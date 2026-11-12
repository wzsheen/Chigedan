const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'data', 'data.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages', 'data', 'data.wxss'), 'utf8');

function rule(selector) {
    const match = wxss.match(new RegExp('\\' + selector + '\\s*\\{([^}]*)\\}'));
    assert.ok(match, '缺少样式 ' + selector);
    return match[1];
}

test('占用与饮食/体重/饮水的标签在同一水平线：小号数字沿用同一条固定行高', () => {
    const value = rule('.stat-value');
    const small = rule('.stat-value-small');
    const lineHeight = (css) => {
        const match = css.match(/line-height\s*:\s*([\d.]+)rpx/);
        return match && match[1];
    };
    assert.ok(lineHeight(value), '.stat-value 必须用固定 rpx 行高，不能是 1.2 这类倍数');
    assert.ok(lineHeight(small), '.stat-value-small 必须显式给出同样的固定行高');
    assert.equal(lineHeight(small), lineHeight(value), '两个数字行高必须一致，否则「占用」会跟着 6 KB 被顶上去');
    assert.match(small, /font-size\s*:\s*28rpx/, '占用数字仍然是 28rpx 的小号字');
});

test('四个统计项结构一致，占用仍是第四个单元格里的数字加标签', () => {
    const row = wxml.match(/<view class="stat-row">[\s\S]*?<\/view>\s*<\/view>/)[0];
    const cells = row.match(/<view class="stat-cell">/g) || [];
    assert.equal(cells.length, 4, '统计行应保持四个单元格');
    assert.match(row, /<text class="stat-value stat-value-small">\{\{storageText\}\}<\/text>\s*<text class="stat-label">占用<\/text>/, '占用必须仍是 value + label 的两段结构');
    assert.equal((row.match(/stat-label/g) || []).length, 4, '四项都要有同样的标签节点');
});
