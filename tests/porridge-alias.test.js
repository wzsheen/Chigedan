const test = require('node:test');
const assert = require('node:assert/strict');
global.wx = { getStorageSync() { return []; } };
const index = require('../utils/china-food-index');
const foodDb = require('../utils/food-db');
const catalog = require('../utils/meal-catalog');

test('稀饭搜索返回不同粥类，并支持具体稀饭名称', () => {
    const rows = catalog.rows([], {});
    const matches = rows.filter(row => (row.aliases || []).some(alias => alias.includes('稀饭')));
    assert.ok(matches.some(row => row.name === '小米粥'));
    assert.ok(matches.some(row => row.name === '南瓜粥'));
    assert.equal(index.lookup('小米稀饭').name, '小米粥');
    assert.equal(index.lookup('南瓜稀饭').name, '南瓜粥');
    assert.equal(index.lookup('稀饭'), null);
    assert.ok(foodDb.searchFoods('稀饭').some(row => row.name === '小米粥'));
});
