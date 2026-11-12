const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../utils/meal-detail');

test('餐食明细保留零值并区分缺失营养', () => {
    const result = build({ protein: 3.25, carb: 0, fat: null, note: '少盐' });
    assert.equal(result.macroText, '蛋白质 3.3g · 碳水 0g · 脂肪 未记录');
    assert.equal(result.detailText, '少盐');
});

test('已知来源简写并保留份量或额外备注', () => {
    assert.equal(build({ note: '官方分类表 · 置信度高 · 熟食材 · 1 碗' }).detailText, '食库参考 · 1 碗');
    assert.equal(build({ note: '官方成分表 · 置信度高 · 熟食材 · 1 碗' }).detailText, '食库参考 · 1 碗');
    assert.equal(build({ note: 'AI营养估算，请核对做法与份量；少油' }).detailText, 'AI估算 · 少油');
    assert.equal(build({ note: '自制，少油' }).detailText, '自制，少油');
});

test('优先显示已记录总克重，否则显示原数量单位', () => {
    assert.equal(build({ qty: 2, unit: '碗', note: '少盐；参考每碗150g，共300g' }).qtyText, ' ×300克');
    assert.equal(build({ qty: 2, unit: '碗', note: '参考1碗约150g' }).qtyText, ' ×2碗');
    assert.equal(build({ qty: 300, unit: '克', note: '' }).qtyText, ' ×300克');
});
