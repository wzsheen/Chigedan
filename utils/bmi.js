// BMI 计算与分级：首页、个人中心、体重页共用一套阈值，避免各改各的。

function classifyBmi(bmi) {
    if (!Number.isFinite(bmi) || bmi <= 0) {
        return { text: '—', tone: 'metric-empty' };
    }
    if (bmi < 18.5) {
        return { text: '偏瘦', tone: 'metric-low' };
    }
    if (bmi < 24) {
        return { text: '正常', tone: 'metric-normal' };
    }
    if (bmi < 28) {
        return { text: '超重', tone: 'metric-high' };
    }
    return { text: '肥胖', tone: 'metric-danger' };
}

// 返回 { value, text, level } 或 null（缺身高 / 体重）
function calcBmi(kg, heightCm) {
    const weight = Number(kg);
    const height = Number(heightCm);
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(height) || height <= 0) {
        return null;
    }
    const raw = weight / Math.pow(height / 100, 2);
    const value = Math.round(raw * 10) / 10;
    const level = classifyBmi(value);
    return { value: value, text: value.toFixed(1), level: level };
}

module.exports = {
    classifyBmi,
    calcBmi,
};
