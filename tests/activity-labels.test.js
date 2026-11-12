const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let definition;
global.wx = { getStorageSync: () => '', setStorageSync: () => {}, showToast: () => {}, navigateTo: () => {} };
global.Page = value => { definition = value; };
require('../pages/goal/goal');

const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'goal', 'goal.wxml'), 'utf8');

test('活动强度第一项叫「久坐不动」，其余三项维持原样', () => {
    const labels = definition.data.activities.map(item => item.label);
    assert.deepEqual(labels, ['久坐不动', '轻度活动', '中度活动', '高度活动']);
    assert.deepEqual(definition.data.activities.map(item => item.desc), [
        '几乎不运动', '每周运动 1-3 次', '每周运动 3-5 次', '每周运动 6-7 次',
    ]);
});

test('模板不再给名称拼「活动」后缀，避免出现「久坐不动活动」', () => {
    assert.ok(!/label\}\}活动/.test(wxml), 'label 已是完整名称，模板里不能再拼「活动」');
    assert.equal((wxml.match(/\{\{activities\[activityIndex\]\.label\}\}/g) || []).length, 2, '当前项：可见文字与 aria 都直接输出 label');
    assert.equal((wxml.match(/aria-label="\{\{item\.label\}\}，/g) || []).length, 1, '下拉项的 aria 直接输出 label');
    assert.equal((wxml.match(/class="activity-option-label">\{\{item\.label\}\}</g) || []).length, 1, '下拉项的可见文字直接输出 label');
    assert.ok(!/久坐/.test(wxml), '文案只在 js 里维护一份');
});
