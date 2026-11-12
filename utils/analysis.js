// 健康分析引擎：纯函数，不依赖 wx，输入原始数据，输出分析结果。
// 输入：{ records, goal, macroTargets, profile, weights, waterEntries, days, today }

const KCAL_PER_KG = 7700;
const DEFAULT_WATER_GOAL = 1500;

// 三大营养素建议供能比（中国居民膳食指南常用区间，单位 %）
const MACRO_RANGES = {
    carb: { min: 45, max: 55 },
    protein: { min: 15, max: 25 },
    fat: { min: 20, max: 30 },
};

const DEFAULT_MACRO_SHARE = { carb: 50, protein: 20, fat: 30 };

function pad2(value) {
    return value < 10 ? '0' + value : String(value);
}

function formatDate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function addDays(date, offset) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + offset);
    return next;
}

function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

function average(list) {
    if (list.length === 0) {
        return null;
    }
    let sum = 0;
    for (let i = 0; i < list.length; i += 1) {
        sum += list[i];
    }
    return sum / list.length;
}

function buildDayBuckets(dates) {
    const buckets = {};
    for (let i = 0; i < dates.length; i += 1) {
        buckets[dates[i]] = {
            date: dates[i],
            kcal: 0,
            nutritionMissing: false,
            protein: 0,
            carb: 0,
            fat: 0,
            water: 0,
            count: 0,
            meals: {},
            names: [],
            firstMinute: null,
            lastMinute: null,
        };
    }
    return buckets;
}

function fillRecords(buckets, records) {
    for (let i = 0; i < records.length; i += 1) {
        const record = records[i];
        const bucket = buckets[record.date];
        if (!bucket) {
            continue;
        }
        bucket.kcal += Number(record.kcal) || 0;
        bucket.protein += Number(record.protein) || 0;
        bucket.carb += Number(record.carb) || 0;
        bucket.fat += Number(record.fat) || 0;
        bucket.count += 1;
        if(record.nutritionStatus==='incomplete') bucket.nutritionMissing=true;
        bucket.meals[record.meal] = true;
        if (typeof record.name === 'string' && record.name.trim() !== '') {
            bucket.names.push(record.name.trim());
        }
        const ts = record.timeKnown === false ? NaN : Number(record.createdAt);
        if (Number.isFinite(ts) && ts > 0) {
            const time = new Date(ts);
            const minuteOfDay = time.getHours() * 60 + time.getMinutes();
            if (bucket.firstMinute === null || minuteOfDay < bucket.firstMinute) {
                bucket.firstMinute = minuteOfDay;
            }
            if (bucket.lastMinute === null || minuteOfDay > bucket.lastMinute) {
                bucket.lastMinute = minuteOfDay;
            }
        }
    }
}

function fillWater(buckets, waterEntries) {
    for (let i = 0; i < waterEntries.length; i += 1) {
        const entry = waterEntries[i];
        const bucket = buckets[entry.date];
        if (bucket) {
            bucket.water += Number(entry.ml) || 0;
        }
    }
}

// 目标供能比：优先用用户设定的营养素目标克数换算，否则用默认比例。
function resolveMacroShare(macroTargets) {
    if (!macroTargets) {
        return { share: DEFAULT_MACRO_SHARE, fromTargets: false };
    }
    const protein = Number(macroTargets.protein) || 0;
    const carb = Number(macroTargets.carb) || 0;
    const fat = Number(macroTargets.fat) || 0;
    const energy = protein * 4 + carb * 4 + fat * 9;
    if (energy <= 0) {
        return { share: DEFAULT_MACRO_SHARE, fromTargets: false };
    }
    return {
        share: {
            carb: (carb * 4 / energy) * 100,
            protein: (protein * 4 / energy) * 100,
            fat: (fat * 9 / energy) * 100,
        },
        fromTargets: true,
    };
}

function scoreLevel(total) {
    if (total >= 85) {
        return { text: '优秀', tone: 'good' };
    }
    if (total >= 70) {
        return { text: '良好', tone: 'good' };
    }
    if (total >= 55) {
        return { text: '一般', tone: 'warn' };
    }
    return { text: '待改善', tone: 'bad' };
}

function buildAnalysis(input) {
    const config = input || {};
    const rangeDays = config.days === 30 ? 30 : 7;
    const today = typeof config.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(config.today)
        ? config.today
        : formatDate(new Date());
    const goal = Number(config.goal) > 0 ? Number(config.goal) : 2000;
    const goalWater = Number(config.waterGoal) > 0 ? Number(config.waterGoal) : DEFAULT_WATER_GOAL;
    const records = Array.isArray(config.records) ? config.records : [];
    const weights = Array.isArray(config.weights) ? config.weights : [];
    const waterEntries = Array.isArray(config.waterEntries) ? config.waterEntries : [];

    const todayDate = new Date(today.slice(0, 4), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
    const dates = [];
    for (let i = rangeDays - 1; i >= 0; i -= 1) {
        dates.push(formatDate(addDays(todayDate, -i)));
    }

    const buckets = buildDayBuckets(dates);
    fillRecords(buckets, records);
    fillWater(buckets, waterEntries);

    const dayList = dates.map(date => buckets[date]);
    // 今天通常还没记完，参与展示但不参与达成率打分，避免白天打开就被扣分。
    const pastDays = dayList.filter(day => day.date !== today);
    const recordedPastDays = pastDays.filter(day => day.count > 0);

    const totalRecords = dayList.reduce((sum, day) => sum + day.count, 0);
    if (totalRecords === 0) {
        return {
            days: rangeDays,
            today: today,
            hasData: false,
            goal: goal,
            goalWater: goalWater,
        };
    }

    // ---- 热量达成 ----
    const kcalScores = recordedPastDays.map(day => {
        const deviation = Math.abs(day.kcal - goal) / goal;
        return clamp01(1 - deviation / 0.35);
    });
    let kcalScore = average(kcalScores);

    // ---- 营养结构 ----
    const macroTarget = resolveMacroShare(config.macroTargets);
    const macroDays = recordedPastDays.filter(day => !day.nutritionMissing && day.protein + day.carb + day.fat > 0);
    const macroScores = macroDays.map(day => {
        const proteinEnergy = day.protein * 4;
        const carbEnergy = day.carb * 4;
        const fatEnergy = day.fat * 9;
        const energy = proteinEnergy + carbEnergy + fatEnergy;
        if (energy <= 0) {
            return null;
        }
        const share = {
            carb: (carbEnergy / energy) * 100,
            protein: (proteinEnergy / energy) * 100,
            fat: (fatEnergy / energy) * 100,
        };
        const deviation = (Math.abs(share.carb - macroTarget.share.carb)
            + Math.abs(share.protein - macroTarget.share.protein)
            + Math.abs(share.fat - macroTarget.share.fat)) / 2;
        return clamp01(1 - deviation / 0.35);
    }).filter(value => value !== null);
    let macroScore = average(macroScores);

    // ---- 喝水达成 ----
    // 只看过去几天：今天还在进行中，用 7 天均摊会把今天的几口水稀释成「喝水太少」的误导结论
    const hasWaterData = pastDays.some(day => day.water > 0);
    const waterScores = hasWaterData
        ? pastDays.map(day => clamp01(day.water / goalWater))
        : [];
    let waterScore = average(waterScores);

    // ---- 记录完整度 ----
    const elapsedDays = pastDays.length > 0 ? pastDays.length : 1;
    const dayCoverage = clamp01(recordedPastDays.length / elapsedDays);
    let mealPairs = 0;
    for (let i = 0; i < pastDays.length; i += 1) {
        mealPairs += Object.keys(pastDays[i].meals).length;
    }
    const mealCoverage = clamp01(mealPairs / (elapsedDays * 3));
    let recordScore = dayCoverage * 0.6 + mealCoverage * 0.4;

    // ---- 只有一天数据时的兜底 ----
    // 刚开始用时打分区里没有完整的一天，总分恒为 0，看起来像「很不健康」。
    // 只要今天有记录或喝水，就按今天的数据直接打分：热量分按「当前进度 vs 一天的合理进度」算，
    // 避免上午打开就因为吃得少被扣爆。
    const todayBucket = dayList[dayList.length - 1];
    const todayOnly = recordedPastDays.length === 0 && todayBucket && (todayBucket.count > 0 || todayBucket.water > 0);
    if (todayOnly) {
        const hour = new Date().getHours();
        if (goal > 0) {
            const expected = clamp01((hour - 6) / 16);
            // 非对称容差：吃超进度按 0.35 严罚；落后进度只是「晚点补」，按 0.9 宽容。
            // 否则 20 点后只吃到六成会被打到 20 分以下，和「晚饭还没吃完」的现实不符。
            const gap = todayBucket.kcal / goal - expected;
            kcalScore = clamp01(1 - Math.abs(gap) / (gap >= 0 ? 0.35 : 0.9));
        }
        const todayEnergy = todayBucket.protein * 4 + todayBucket.carb * 4 + todayBucket.fat * 9;
        if (todayEnergy > 0 && !todayBucket.nutritionMissing) {
            const todayShare = {
                carb: (todayBucket.carb * 4 / todayEnergy) * 100,
                protein: (todayBucket.protein * 4 / todayEnergy) * 100,
                fat: (todayBucket.fat * 9 / todayEnergy) * 100,
            };
            const todayDeviation = (Math.abs(todayShare.carb - macroTarget.share.carb)
                + Math.abs(todayShare.protein - macroTarget.share.protein)
                + Math.abs(todayShare.fat - macroTarget.share.fat)) / 2;
            macroScore = clamp01(1 - todayDeviation / 0.35);
        }
        if (todayBucket.water > 0) {
            waterScore = clamp01(todayBucket.water / goalWater);
        }
        recordScore = clamp01(Object.keys(todayBucket.meals).length / 3);
    }

    // ---- 总分（缺失维度重新分配权重）----
    const dimensions = [
        { key: 'kcal', label: '热量达成', weight: 0.35, score: kcalScore },
        { key: 'macro', label: '营养结构', weight: 0.3, score: macroScore },
        { key: 'record', label: '记录完整', weight: 0.2, score: recordScore },
        { key: 'water', label: '喝水达成', weight: 0.15, score: waterScore },
    ];
    let weightSum = 0;
    let weighted = 0;
    for (let i = 0; i < dimensions.length; i += 1) {
        const dim = dimensions[i];
        if (dim.score !== null) {
            weightSum += dim.weight;
            weighted += dim.weight * dim.score;
        }
    }
    const totalScore = weightSum > 0 ? Math.round((weighted / weightSum) * 100) : 0;
    const dims = dimensions.map(dim => ({
        key: dim.key,
        label: dim.label,
        score: dim.score === null ? null : Math.round(dim.score * 100),
    }));

    // ---- 营养结构明细 ----
    let sumProtein = 0;
    let sumCarb = 0;
    let sumFat = 0;
    for (let i = 0; i < macroDays.length; i += 1) {
        sumProtein += macroDays[i].protein;
        sumCarb += macroDays[i].carb;
        sumFat += macroDays[i].fat;
    }
    const macroEnergy = sumProtein * 4 + sumCarb * 4 + sumFat * 9;
    const hasMacroData = macroDays.length > 0 && macroEnergy > 0;
    const shares = hasMacroData
        ? {
            carb: (sumCarb * 4 / macroEnergy) * 100,
            protein: (sumProtein * 4 / macroEnergy) * 100,
            fat: (sumFat * 9 / macroEnergy) * 100,
        }
        : null;
    const macroRows = hasMacroData
        ? [
            buildMacroRow('碳水', shares.carb, MACRO_RANGES.carb),
            buildMacroRow('蛋白质', shares.protein, MACRO_RANGES.protein),
            buildMacroRow('脂肪', shares.fat, MACRO_RANGES.fat),
        ]
        : [];

    // ---- 平均摄入 ----
    const avgKcal = average(recordedPastDays.map(day => day.kcal));
    const recordedDayCount = recordedPastDays.length;

    // ---- 体重与热量缺口交叉验证 ----
    const weightResult = buildWeightResult({
        weights: weights,
        dates: dates,
        pastDays: recordedPastDays,
        goal: goal,
    });

    // ---- 饮食行为 ----
    const behavior = buildBehavior(pastDays);

    // ---- 食物多样性 ----
    const diversity = buildDiversity(dayList);

    // ---- 结论 ----
    const conclusions = buildConclusions({
        rangeDays: rangeDays,
        goal: goal,
        goalWater: goalWater,
        avgKcal: avgKcal,
        recordedDayCount: recordedDayCount,
        elapsedDays: elapsedDays,
        macroRows: macroRows,
        dayList: dayList,
        hasWaterData: hasWaterData,
        behavior: behavior,
        diversity: diversity,
        weight: weightResult,
    });

    return {
        days: rangeDays,
        today: today,
        hasData: true,
        goal: goal,
        goalWater: goalWater,
        score: {
            total: totalScore,
            level: scoreLevel(totalScore),
            dims: dims,
        },
        intake: {
            avgKcal: avgKcal === null ? 0 : Math.round(avgKcal),
            recordedDays: recordedDayCount,
            elapsedDays: elapsedDays,
            macroFromTargets: macroTarget.fromTargets,
        },
        macro: {
            hasData: hasMacroData,
            rows: macroRows,
        },
        weight: weightResult,
        behavior: behavior,
        diversity: diversity,
        conclusions: conclusions,
    };
}

function buildMacroRow(label, share, range) {
    const value = round1(share);
    // 允许 0.5 的取整误差，避免 30.1% 这种边界值被判成超标
    let status = 'ok';
    if (value < range.min - 0.5) {
        status = 'low';
    } else if (value > range.max + 0.5) {
        status = 'high';
    }
    return {
        label: label,
        share: value,
        min: range.min,
        max: range.max,
        status: status,
        width: Math.min(100, value),
    };
}

function buildWeightResult(params) {
    const weights = params.weights;
    const goal = params.goal;
    const rangeDates = params.dates;
    const firstDate = rangeDates[0];
    const sorted = weights
        .filter(item => typeof item.date === 'string')
        .sort((left, right) => left.ts - right.ts);
    const inRange = sorted.filter(item => item.date >= firstDate);
    // 区间内不足两次时，用区间开始前最近的一次记录当基线，这样刚记一次也能看出变化
    let baseline = null;
    for (let i = 0; i < sorted.length; i += 1) {
        if (sorted[i].date < firstDate) {
            baseline = sorted[i];
        }
    }
    const series = (baseline !== null && inRange.length < 2)
        ? [baseline].concat(inRange)
        : inRange;

    // 理论体重变化：累计热量缺口 / 7700（正缺口 = 掉秤）
    let deficit = 0;
    for (let i = 0; i < params.pastDays.length; i += 1) {
        deficit += goal - params.pastDays[i].kcal;
    }
    const theoryChange = -deficit / KCAL_PER_KG;

    if (series.length < 2) {
        return {
            hasData: series.length === 1,
            hasTrend: false,
            message: series.length === 1
                ? '只记录了 1 次体重，再记几次就能看趋势'
                : '这段时间还没记体重，去体重页记一笔就能看趋势',
        };
    }

    const start = series[0];
    const end = series[series.length - 1];
    const change = end.kg - start.kg;
    const diff = change - theoryChange;
    let verdict = 'match';
    let verdictText = '';
    if (Math.abs(diff) <= 0.5) {
        verdict = 'match';
        verdictText = '实际体重变化与热量缺口基本吻合，说明记录比较准确';
    } else if (diff < 0) {
        verdict = 'less';
        verdictText = '实际掉秤比理论多 ' + round1(Math.abs(diff)) + ' kg，可能有水肿消退或活动量增加';
    } else {
        verdict = 'more';
        verdictText = '实际掉秤比理论少 ' + round1(Math.abs(diff)) + ' kg，可能存在少记、或近期水分滞留';
    }

    return {
        hasData: true,
        hasTrend: true,
        startKg: start.kg,
        endKg: end.kg,
        startDate: start.date,
        endDate: end.date,
        change: round1(change),
        theoryChange: round1(theoryChange),
        deficit: Math.round(deficit),
        verdict: verdict,
        verdictText: verdictText,
    };
}

function buildBehavior(pastDays) {
    const dayWindows = pastDays
        .filter(day => day.firstMinute !== null && day.lastMinute !== null)
        .map(day => day.lastMinute - day.firstMinute);

    let lateDays = 0;
    let firstMealSum = 0;
    let firstMealCount = 0;
    for (let i = 0; i < pastDays.length; i += 1) {
        const day = pastDays[i];
        if (day.lastMinute !== null && day.lastMinute >= 20 * 60) {
            lateDays += 1;
        }
        if (day.firstMinute !== null) {
            firstMealSum += day.firstMinute;
            firstMealCount += 1;
        }
    }

    const windowAvg = average(dayWindows);
    const firstMealAvg = firstMealCount === 0 ? null : firstMealSum / firstMealCount;
    return {
        hasData: dayWindows.length > 0,
        windowHours: windowAvg === null ? 0 : round1(windowAvg / 60),
        lateDays: lateDays,
        firstMealHour: firstMealAvg === null
            ? ''
            : Math.floor(firstMealAvg / 60) + ':' + pad2(Math.round(firstMealAvg % 60)),
    };
}

function buildDiversity(dayList) {
    const counter = {};
    let total = 0;
    for (let i = 0; i < dayList.length; i += 1) {
        const names = dayList[i].names;
        for (let j = 0; j < names.length; j += 1) {
            const key = names[j];
            counter[key] = (counter[key] || 0) + 1;
            total += 1;
        }
    }
    const keys = Object.keys(counter);
    const sorted = keys
        .map(key => ({ name: key, count: counter[key] }))
        .sort((left, right) => right.count - left.count);
    const distinct = keys.length;
    return {
        distinct: distinct,
        total: total,
        repeatRate: total === 0 ? 0 : Math.round((1 - distinct / total) * 100),
        top: sorted.slice(0, 3),
    };
}

function buildConclusions(params) {
    const lines = [];
    const avgKcal = params.avgKcal;

    if (avgKcal !== null && params.recordedDayCount >= 2) {
        const gap = avgKcal - params.goal;
        if (Math.abs(gap) <= params.goal * 0.1) {
            lines.push('平均每天 ' + Math.round(avgKcal) + ' kcal，和目标几乎一致，节奏保持得住。');
        } else if (gap > 0) {
            lines.push('平均每天超出目标 ' + Math.round(gap) + ' kcal，' + (gap > 300 ? '这个量级一周会多出约 ' + Math.round(gap * 7 / KCAL_PER_KG * 10) / 10 + ' kg 的热量盈余' : '控制一下加餐就能拉回来'));
        } else {
            lines.push('平均每天低于目标 ' + Math.round(Math.abs(gap)) + ' kcal，缺口偏大，注意别把代谢压下去。');
        }
    }

    for (let i = 0; i < params.macroRows.length; i += 1) {
        const row = params.macroRows[i];
        if (row.status === 'low') {
            lines.push(row.label + '供能比 ' + row.share + '%，低于建议区间 ' + row.min + '–' + row.max + '%，可以适当补一点。');
        } else if (row.status === 'high') {
            lines.push(row.label + '供能比 ' + row.share + '%，高于建议区间 ' + row.min + '–' + row.max + '%，建议往下压。');
        }
    }

    if (params.recordedDayCount > 0 && params.recordedDayCount < params.elapsedDays) {
        lines.push('这段时间有 ' + (params.elapsedDays - params.recordedDayCount) + ' 天没有记录，分析结果的准确度会打折。');
    }

    if (params.hasWaterData) {
        let waterSum = 0;
        for (let i = 0; i < params.dayList.length; i += 1) {
            waterSum += params.dayList[i].water;
        }
        const avgWater = waterSum / params.dayList.length;
        if (avgWater < params.goalWater * 0.7) {
            lines.push('日均喝水约 ' + Math.round(avgWater) + ' ml，只到目标的 ' + Math.round(avgWater / params.goalWater * 100) + '%，再多喝两杯。');
        }
    }

    if (params.behavior.hasData && params.behavior.lateDays >= 3) {
        lines.push('有 ' + params.behavior.lateDays + ' 天最后一次进食在 20 点后，吃得偏晚会影响睡眠和第二天食欲。');
    }

    if (params.diversity.distinct > 0 && params.diversity.distinct < 10 && params.diversity.total >= 8) {
        lines.push('这段时间只吃了 ' + params.diversity.distinct + ' 种食物，重复率偏高，注意换着吃补微量元素。');
    }

    if (params.weight.hasTrend && params.weight.verdict !== 'match') {
        lines.push(params.weight.verdictText + '。');
    }

    if (lines.length === 0) {
        lines.push('数据还不多，多记几天就能看出规律。');
    }
    return lines.slice(0, 6);
}

// 今日一句话诊断：供首页环下方使用。纯规则，不依赖窗口统计。
// 输入：{ total, goal, protein, carb, fat, macroTargets, count, hour }
function buildTodayHint(params) {
    const config = params || {};
    const total = Number(config.total) || 0;
    const goal = Number(config.goal) > 0 ? Number(config.goal) : 2000;
    const protein = Number(config.protein) || 0;
    const carb = Number(config.carb) || 0;
    const fat = Number(config.fat) || 0;
    const count = Number(config.count) || 0;
    const hour = Number.isFinite(Number(config.hour)) ? Number(config.hour) : new Date().getHours();
    const targets = config.macroTargets && Number(config.macroTargets.protein) > 0 ? config.macroTargets : null;

    if (count === 0) {
        return { text: '今天还没记录，点下方 + 记第一笔', tone: 'neutral' };
    }

    if (total > goal) {
        return { text: '已超目标 ' + Math.round(total - goal) + ' kcal，接下来吃清淡点', tone: 'warn' };
    }

    const energy = carb * 4 + protein * 4 + fat * 9;
    if (energy <= 0) {
        return { text: '这些记录还没填营养素，补上才能看结构', tone: 'neutral' };
    }

    const carbShare = Math.round((carb * 4 / energy) * 100);
    const fatShare = Math.round((fat * 9 / energy) * 100);

    if (targets && protein < targets.protein * 0.6 && hour >= 16) {
        return {
            text: '蛋白还差 ' + Math.round(targets.protein - protein) + ' g，晚餐加份肉蛋奶',
            tone: 'warn',
        };
    }
    if (carbShare > 55) {
        return { text: '碳水占到 ' + carbShare + '%，主食可以减一点', tone: 'warn' };
    }
    if (fatShare > 35) {
        return { text: '脂肪占到 ' + fatShare + '%，注意油炸和坚果', tone: 'warn' };
    }
    if (total < goal * 0.35 && hour >= 20) {
        return { text: '今天吃得偏少，别过度节食', tone: 'warn' };
    }
    if (targets && protein >= targets.protein) {
        return { text: '蛋白质达标，结构不错', tone: 'good' };
    }
    return { text: '热量还在目标内，注意补够蛋白', tone: 'good' };
}

module.exports = {
    buildAnalysis,
    buildTodayHint,
    formatDate,
    KCAL_PER_KG,
    DEFAULT_WATER_GOAL,
    MACRO_RANGES,
    DEFAULT_MACRO_SHARE,
};
