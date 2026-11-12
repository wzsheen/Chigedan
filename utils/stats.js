// 数据总览：全部为纯函数，输入记录数组，输出统计结果，便于单独校验。

const KCAL_PER_KG = 7700;

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function dayKey(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return year + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day);
}

// 按日期汇总热量与三大营养素
function groupByDate(records) {
    const map = {};
    for (let i = 0; i < records.length; i += 1) {
        const item = records[i] || {};
        const date = typeof item.date === 'string' ? item.date : '';
        if (date === '') {
            continue;
        }
        if (!map[date]) {
            map[date] = { date: date, kcal: 0, p: 0, c: 0, f: 0, count: 0 };
        }
        const bucket = map[date];
        bucket.kcal += toNumber(item.kcal);
        bucket.p += toNumber(item.protein);
        bucket.c += toNumber(item.carb);
        bucket.f += toNumber(item.fat);
        bucket.count += 1;
    }
    return map;
}

function countStreak(dateMap, now) {
    const cursor = new Date(now.getTime());
    if (!dateMap[dayKey(cursor)]) {
        cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    for (let guard = 0; guard < 3650; guard += 1) {
        if (!dateMap[dayKey(cursor)]) {
            break;
        }
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function buildStats(records, goal, now) {
    const list = Array.isArray(records) ? records : [];
    const target = toNumber(goal) > 0 ? toNumber(goal) : 2000;
    const today = now instanceof Date ? now : new Date();
    const dateMap = groupByDate(list);
    const dates = Object.keys(dateMap);

    let totalKcal = 0;
    let totalP = 0;
    let totalC = 0;
    let totalF = 0;
    let goodDays = 0;

    for (let i = 0; i < dates.length; i += 1) {
        const bucket = dateMap[dates[i]];
        totalKcal += bucket.kcal;
        totalP += bucket.p;
        totalC += bucket.c;
        totalF += bucket.f;
        if (bucket.kcal > 0 && Math.abs(bucket.kcal - target) <= target * 0.1) {
            goodDays += 1;
        }
    }

    const dayCount = dates.length;
    const avgKcal = dayCount > 0 ? Math.round(totalKcal / dayCount) : 0;
    const avgP = dayCount > 0 ? totalP / dayCount : 0;
    const avgC = dayCount > 0 ? totalC / dayCount : 0;
    const avgF = dayCount > 0 ? totalF / dayCount : 0;

    const energyP = avgP * 4;
    const energyC = avgC * 4;
    const energyF = avgF * 9;
    const energyTotal = energyP + energyC + energyF;

    const macro = {
        p: Math.round(avgP),
        c: Math.round(avgC),
        f: Math.round(avgF),
        pPct: energyTotal > 0 ? Math.round((energyP / energyTotal) * 100) : 0,
        cPct: energyTotal > 0 ? Math.round((energyC / energyTotal) * 100) : 0,
        fPct: energyTotal > 0 ? Math.round((energyF / energyTotal) * 100) : 0,
        hasData: energyTotal > 0,
    };

    // 近 7 天（含今天），柱高按「与目标的比例」算，超出目标封顶 100% 但单独标色
    const days = [];
    let maxKcal = target;
    for (let i = 6; i >= 0; i -= 1) {
        const cursor = new Date(today.getTime());
        cursor.setDate(cursor.getDate() - i);
        const key = dayKey(cursor);
        const bucket = dateMap[key];
        const kcal = bucket ? Math.round(bucket.kcal) : 0;
        if (kcal > maxKcal) {
            maxKcal = kcal;
        }
        days.push({
            key: key,
            label: WEEK_LABELS[cursor.getDay()],
            kcal: kcal,
            text: kcal > 0 ? String(kcal) : '',
            empty: kcal === 0,
            over: kcal > target,
        });
    }
    for (let i = 0; i < days.length; i += 1) {
        const item = days[i];
        const pct = maxKcal > 0 ? Math.round((item.kcal / maxKcal) * 100) : 0;
        item.height = Math.max(item.kcal > 0 ? 8 : 3, pct) + '%';
        item.tone = item.empty ? 'bar-empty' : (item.over ? 'bar-over' : 'bar-normal');
    }

    // 最常吃：按名称合并次数与累计热量
    const foodMap = {};
    for (let i = 0; i < list.length; i += 1) {
        const item = list[i] || {};
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (name === '') {
            continue;
        }
        if (!foodMap[name]) {
            foodMap[name] = { name: name, count: 0, kcal: 0 };
        }
        foodMap[name].count += 1;
        foodMap[name].kcal += toNumber(item.kcal);
    }
    const topFoods = Object.keys(foodMap)
        .map(key => foodMap[key])
        .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }
            return right.kcal - left.kcal;
        })
        .slice(0, 3)
        .map(item => ({
            name: item.name,
            count: item.count,
            countText: item.count + ' 次',
            kcal: Math.round(item.kcal),
        }));

    return {
        dayCount: dayCount,
        streak: countStreak(dateMap, today),
        goodDays: goodDays,
        avgKcal: avgKcal,
        totalRecords: list.length,
        days: days,
        macro: macro,
        topFoods: topFoods,
        goal: target,
        hasAny: list.length > 0,
    };
}

module.exports = {
    buildStats,
    KCAL_PER_KG,
};
