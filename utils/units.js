// 单位偏好：内部一律按 kcal / kg 存储与计算，只在展示与输入时换算。
// 这样切换单位不会改历史数据，也不会让 BMI、目标这些计算结果漂移。

const KCAL_TO_KJ = 4.184;
const KG_TO_LB = 2.20462;

function readKey(key, fallback) {
    try {
        const value = wx.getStorageSync(key);
        return typeof value === 'string' && value !== '' ? value : fallback;
    } catch (err) {
        return fallback;
    }
}

/* ---------- 热量 ---------- */

function getEnergyUnit() {
    return readKey('cal_energy_unit', 'kcal') === 'kj' ? 'kj' : 'kcal';
}

function setEnergyUnit(unit) {
    const safe = unit === 'kj' ? 'kj' : 'kcal';
    wx.setStorageSync('cal_energy_unit', safe);
    return safe;
}

function energyUnitLabel() {
    return getEnergyUnit() === 'kj' ? 'kJ' : 'kcal';
}

// kcal → 当前单位数值（已取整）
function toDisplayEnergy(kcal, unit) {
    const value = Number(kcal);
    const safe = Number.isFinite(value) ? value : 0;
    const target = unit || getEnergyUnit();
    return target === 'kj' ? Math.round(safe * KCAL_TO_KJ) : Math.round(safe);
}

// 当前单位数值 → kcal
function toKcal(displayValue, unit) {
    const value = Number(displayValue);
    const safe = Number.isFinite(value) ? value : 0;
    const source = unit || getEnergyUnit();
    return source === 'kj' ? safe / KCAL_TO_KJ : safe;
}

// 带单位的整串，例如「230 kcal」/「962 kJ」
function energyText(kcal, unit) {
    const target = unit || getEnergyUnit();
    return toDisplayEnergy(kcal, target) + ' ' + (target === 'kj' ? 'kJ' : 'kcal');
}

/* ---------- 体重 ---------- */

const WEIGHT_UNITS = {
    kg: { label: 'kg', fromKg: kg => kg, toKg: value => value, digits: 1 },
    jin: { label: '斤', fromKg: kg => kg * 2, toKg: value => value / 2, digits: 1 },
    lb: { label: 'lb', fromKg: kg => kg * KG_TO_LB, toKg: value => value / KG_TO_LB, digits: 1 },
};

function getWeightUnit() {
    const unit = readKey('cal_weight_unit', 'kg');
    return WEIGHT_UNITS[unit] ? unit : 'kg';
}

function setWeightUnit(unit) {
    const safe = WEIGHT_UNITS[unit] ? unit : 'kg';
    wx.setStorageSync('cal_weight_unit', safe);
    return safe;
}

function weightUnitLabel() {
    return WEIGHT_UNITS[getWeightUnit()].label;
}

function toDisplayWeight(kg) {
    const value = Number(kg);
    const safe = Number.isFinite(value) ? value : 0;
    return WEIGHT_UNITS[getWeightUnit()].fromKg(safe);
}

function toKg(displayValue) {
    const value = Number(displayValue);
    const safe = Number.isFinite(value) ? value : 0;
    return WEIGHT_UNITS[getWeightUnit()].toKg(safe);
}

// 体重显示串，例如「70.0 kg」/「140.0 斤」/「154.3 lb」
function weightText(kg) {
    const unit = WEIGHT_UNITS[getWeightUnit()];
    return unit.fromKg(Number(kg) || 0).toFixed(unit.digits) + ' ' + unit.label;
}

module.exports = {
    KCAL_TO_KJ,
    getEnergyUnit,
    setEnergyUnit,
    energyUnitLabel,
    toDisplayEnergy,
    toKcal,
    energyText,
    getWeightUnit,
    setWeightUnit,
    weightUnitLabel,
    toDisplayWeight,
    toKg,
    weightText,
    WEIGHT_UNITS,
};
