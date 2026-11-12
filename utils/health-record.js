// 个人健康档案：把散落在设置与记录里的信息汇成一份只读档案。
// 纯函数实现：输入原始数据，输出可直接渲染 / 绘制 PDF 的结构，便于单独校验。

const bmiUtil = require('./bmi.js');
const units = require('./units.js');

const DASH = '—';

const SEX_LABELS = { male: '男', female: '女' };

const ACTIVITY_LABELS = {
    sedentary: '久坐 · 几乎不运动',
    light: '轻度 · 每周 1-3 次',
    moderate: '中度 · 每周 3-5 次',
    high: '高度 · 每周 6-7 次',
};

const ACTIVITY_SHORT = {
    sedentary: '久坐',
    light: '轻度活动',
    moderate: '中度活动',
    high: '高度活动',
};

const GOAL_TYPE_LABELS = { lose: '减脂', keep: '维持', gain: '增肌' };

// 营养素目标缺失时的推荐供能比（与目标页公式一致）
const DEFAULT_MACRO = { carb: 0.45, protein: 0.25, fat: 0.30 };

const MACRO_ENERGY = { carb: 4, protein: 4, fat: 9 };

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toPositive(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

function pad2(value) {
    return value < 10 ? '0' + value : String(value);
}

function formatDateTime(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
        + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

function monthDay(dateText) {
    const matched = typeof dateText === 'string' ? dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
    if (!matched) {
        return dateText || '';
    }
    return matched[2] + '-' + matched[3];
}

// 体重按记录时间从早到晚排列
function sortWeights(weights) {
    if (!Array.isArray(weights)) {
        return [];
    }
    return weights
        .filter(item => item && Number(item.kg) > 0)
        .slice()
        .sort((left, right) => Number(left.ts) - Number(right.ts))
        .map(item => ({ ts: Number(item.ts) || 0, date: String(item.date || ''), kg: Number(item.kg) }));
}

function summarizeRecords(records, target, now) {
    const list = Array.isArray(records) ? records : [];
    const dayMap = {};
    let totalKcal = 0;

    for (let i = 0; i < list.length; i += 1) {
        const item = list[i] || {};
        const date = typeof item.date === 'string' ? item.date : '';
        if (date === '') {
            continue;
        }
        const kcal = Number(item.kcal);
        const safe = Number.isFinite(kcal) ? kcal : 0;
        dayMap[date] = (dayMap[date] || 0) + safe;
        totalKcal += safe;
    }

    const dayCount = Object.keys(dayMap).length;
    const avgKcal = dayCount > 0 ? Math.round(totalKcal / dayCount) : 0;

    return {
        dayCount: dayCount,
        recordCount: list.length,
        avgKcal: avgKcal,
        streak: countStreak(dayMap, now),
        goodDays: countGoodDays(dayMap, target),
    };
}

// 今天没记就从昨天开始数，避免早上打开档案就显示 0 天
function countStreak(dayMap, now) {
    const cursor = new Date(now.getTime());
    const key = date => date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    if (!dayMap[key(cursor)]) {
        cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    for (let guard = 0; guard < 3650; guard += 1) {
        if (!dayMap[key(cursor)]) {
            break;
        }
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function countGoodDays(dayMap, target) {
    if (!(target > 0)) {
        return 0;
    }
    let count = 0;
    const dates = Object.keys(dayMap);
    for (let i = 0; i < dates.length; i += 1) {
        const kcal = dayMap[dates[i]];
        if (kcal > 0 && Math.abs(kcal - target) <= target * 0.1) {
            count += 1;
        }
    }
    return count;
}

function macroRow(label, grams, goalKcal) {
    const value = toPositive(grams);
    if (value <= 0) {
        return { label: label, value: DASH };
    }
    let text = Math.round(value) + ' g';
    if (goalKcal > 0) {
        const energy = value * MACRO_ENERGY[label === '碳水' ? 'carb' : (label === '蛋白质' ? 'protein' : 'fat')];
        text += '（' + Math.round((energy / goalKcal) * 100) + '%）';
    }
    return { label: label, value: text };
}

function buildHealthRecord(input) {
    const opts = input && typeof input === 'object' ? input : {};
    const now = opts.now instanceof Date ? opts.now : new Date();
    const profile = isPlainObject(opts.profile) ? opts.profile : {};
    const macroTargets = isPlainObject(opts.macroTargets) ? opts.macroTargets : null;

    const goal = Math.round(toPositive(opts.goal));
    const waterGoal = Math.round(toPositive(opts.waterGoal));
    const weights = sortWeights(opts.weights);
    const stats = summarizeRecords(opts.records, goal, now);

    const height = toPositive(profile.height);
    const age = toPositive(profile.age);
    const latestKg = weights.length > 0 ? weights[weights.length - 1].kg : 0;
    const bmi = height > 0 && latestKg > 0 ? bmiUtil.calcBmi(latestKg, height) : null;

    const sexText = SEX_LABELS[profile.sex] || DASH;
    const activityText = ACTIVITY_LABELS[profile.activity] || DASH;
    const goalTypeText = GOAL_TYPE_LABELS[profile.goalType] || DASH;

    const headlineParts = [];
    if (SEX_LABELS[profile.sex]) {
        headlineParts.push(SEX_LABELS[profile.sex]);
    }
    if (age > 0) {
        headlineParts.push(Math.round(age) + ' 岁');
    }
    if (height > 0) {
        headlineParts.push(Math.round(height) + ' cm');
    }
    if (ACTIVITY_SHORT[profile.activity]) {
        headlineParts.push(ACTIVITY_SHORT[profile.activity]);
    }

    let weightValue = DASH;
    let changeValue = DASH;
    if (weights.length > 0) {
        const last = weights[weights.length - 1];
        weightValue = units.weightText(last.kg);
        if (last.date) {
            weightValue += ' · ' + monthDay(last.date);
        }
        if (weights.length > 1) {
            const unitLabel = units.weightUnitLabel();
            const diff = Math.round((units.toDisplayWeight(last.kg) - units.toDisplayWeight(weights[0].kg)) * 10) / 10;
            const diffText = diff === 0
                ? '与首次持平'
                : (diff > 0 ? '+' : '-') + Math.abs(diff).toFixed(1) + ' ' + unitLabel;
            changeValue = diffText + ' · 共 ' + weights.length + ' 次';
        } else {
            changeValue = '仅 1 次记录';
        }
    }

    let carbTarget = 0;
    let proteinTarget = 0;
    let fatTarget = 0;
    let macroEstimated = false;
    if (macroTargets) {
        carbTarget = toPositive(macroTargets.carb);
        proteinTarget = toPositive(macroTargets.protein);
        fatTarget = toPositive(macroTargets.fat);
    }
    if (carbTarget <= 0 && proteinTarget <= 0 && fatTarget <= 0 && goal > 0) {
        carbTarget = Math.round(goal * DEFAULT_MACRO.carb / 4);
        proteinTarget = Math.round(goal * DEFAULT_MACRO.protein / 4);
        fatTarget = Math.round(goal * DEFAULT_MACRO.fat / 9);
        macroEstimated = true;
    }

    const sections = [
        {
            title: '基本信息',
            rows: [
                { label: '性别', value: sexText },
                { label: '年龄', value: age > 0 ? Math.round(age) + ' 岁' : DASH },
                { label: '身高', value: height > 0 ? Math.round(height) + ' cm' : DASH },
                { label: '活动水平', value: activityText },
                { label: '目标方向', value: goalTypeText },
            ],
        },
        {
            title: '身体指标',
            rows: [
                { label: '当前体重', value: weightValue },
                { label: '体重变化', value: changeValue },
                { label: 'BMI', value: bmi ? bmi.text + '（' + bmi.level.text + '）' : DASH },
            ],
        },
        {
            title: '营养目标',
            rows: [
                { label: '每日热量', value: goal > 0 ? units.energyText(goal) : DASH },
                macroRow('碳水', carbTarget, goal),
                macroRow('蛋白质', proteinTarget, goal),
                macroRow('脂肪', fatTarget, goal),
                { label: '饮水目标', value: waterGoal > 0 ? waterGoal + ' ml' : DASH },
            ],
        },
        {
            title: '记录概况',
            rows: [
                { label: '记录天数', value: stats.dayCount + ' 天' },
                { label: '记录条数', value: stats.recordCount + ' 条' },
                { label: '连续记录', value: stats.streak + ' 天' },
                { label: '日均摄入', value: stats.avgKcal > 0 ? units.energyText(stats.avgKcal) : DASH },
            ],
        },
    ];

    const record = {
        serial: typeof opts.serial === 'string' && opts.serial !== '' ? opts.serial : DASH,
        issuedText: typeof opts.issuedText === 'string' ? opts.issuedText : '',
        generatedText: formatDateTime(now),
        name: typeof opts.nickname === 'string' && opts.nickname.trim() !== '' ? opts.nickname.trim() : '我的档案',
        headline: headlineParts.length > 0 ? headlineParts.join(' · ') : '档案信息待完善',
        bmiText: bmi ? bmi.text : DASH,
        bmiLevel: bmi ? bmi.level.text : '待完善',
        latestWeightText: latestKg > 0 ? units.weightText(latestKg) : DASH,
        heightText: height > 0 ? Math.round(height) + ' cm' : DASH,
        hasProfile: !!SEX_LABELS[profile.sex] || age > 0 || height > 0,
        hasWeight: weights.length > 0,
        hasRecords: stats.recordCount > 0,
        macroEstimated: macroEstimated,
        sections: sections,
    };

    record.note = [
        '档案内容只读，由你的记录与设置自动汇总，不随本页修改；调整数据请前往「计划制定」。',
        macroEstimated ? '营养素目标未单独设置，按碳水 45% / 蛋白 25% / 脂肪 30% 的推荐供能比换算。' : '',
        '本档案仅用于个人健康记录参考，不构成医学诊断或治疗建议。',
    ].filter(text => text !== '');

    record.text = archiveToText(record);
    return record;
}

// 纯文本版档案：复制到剪贴板 / 导出失败时的兜底
function archiveToText(record) {
    if (!isPlainObject(record)) {
        return '';
    }
    const lines = [];
    lines.push('个人健康档案');
    lines.push('档案编号：' + record.serial);
    if (record.issuedText) {
        lines.push('建档日期：' + record.issuedText);
    }
    lines.push('生成时间：' + record.generatedText);
    lines.push('姓名：' + record.name + '（' + record.headline + '）');
    lines.push('');
    const sections = Array.isArray(record.sections) ? record.sections : [];
    for (let i = 0; i < sections.length; i += 1) {
        lines.push('【' + sections[i].title + '】');
        const rows = Array.isArray(sections[i].rows) ? sections[i].rows : [];
        for (let j = 0; j < rows.length; j += 1) {
            lines.push(rows[j].label + '：' + rows[j].value);
        }
        lines.push('');
    }
    const note = Array.isArray(record.note) ? record.note : [];
    for (let i = 0; i < note.length; i += 1) {
        lines.push(note[i]);
    }
    return lines.join('\n');
}

module.exports = {
    buildHealthRecord,
    archiveToText,
    SEX_LABELS,
    ACTIVITY_LABELS,
    GOAL_TYPE_LABELS,
    DEFAULT_MACRO,
};
