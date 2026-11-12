const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'components', 'app-dock');
const wxml = fs.readFileSync(path.join(dir, 'app-dock.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(dir, 'app-dock.wxss'), 'utf8');

function hintBlock() {
    const match = wxml.match(/<view class="quick-actions">([\s\S]*?)<\/view><view class="quick-button"/);
    assert.ok(match, '找不到 quick-actions 里位于按钮之前的提示区');
    return match[1];
}

// wxss 里规则挤在超长单行，选择器必须锚定在前一条规则的 } 之后，
// 否则 `.quick-hint-check{` 会误命中组合选择器 `.quick-confirm,.quick-hint-check{`。
function rule(selector) {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const all = [...wxss.matchAll(new RegExp('(?:^|[}\\n])\\s*' + esc + '\\s*\\{([^}]*)\\}', 'g'))];
    assert.ok(all.length, '缺少样式 ' + selector);
    return all[all.length - 1][1];
}

test('提示文案删掉「如果」，只剩「点 + 勾 + 自动识别」', () => {
    const hint = hintBlock();
    assert.doesNotMatch(hint, /如果/, '「如果」两个字必须删掉');
    assert.doesNotMatch(hint, /✔|️|\u2714/, '不能再用 emoji 勾字符');
    assert.match(hint, /<text>点<\/text>/);
    assert.match(hint, /<text>自动识别<\/text>/);
    assert.match(hint, /quick-hint-check[^\"]*"\s*aria-hidden="true">✓<\/view>/);
    assert.ok(
        hint.indexOf('<text>点</text>') < hint.indexOf('quick-hint-check') &&
        hint.indexOf('quick-hint-check') < hint.indexOf('<text>自动识别</text>'),
        '顺序必须是 点 → 勾 → 自动识别'
    );
});

test('小勾与右上角大勾共用同一条样式（同款金色圆形）', () => {
    const match = wxss.match(/\.quick-confirm,\.quick-hint-check\{([^}]*)\}/);
    assert.ok(match, '大小两个勾要写在同一条组合选择器里，保证同款');
    const shared = match[1];
    assert.match(shared, /border-radius:50%/, '同为圆形');
    assert.match(shared, /background:#ffe393/, '同为香槟金底');
    assert.match(shared, /color:#63420e/, '同为深棕勾');
    assert.match(shared, /align-items:center/);
    assert.match(shared, /justify-content:center/);
});

test('小勾是缩小版：28rpx 且不参与伸缩，大勾仍是 58rpx 并绝对定位在右上角', () => {
    const big = rule('.quick-confirm');
    const small = rule('.quick-hint-check');
    assert.match(big, /position:absolute/);
    assert.match(big, /top:16rpx/);
    assert.match(big, /right:18rpx/);
    assert.match(big, /width:58rpx/);
    assert.match(big, /height:58rpx/);
    assert.match(small, /width:28rpx/);
    assert.match(small, /height:28rpx/);
    assert.match(small, /flex:none/, '小勾不能被 flex 拉变形');
    assert.match(small, /font-size:18rpx/);
});

test('提示区改成 flex 横排并垂直居中，深色主题仍可读', () => {
    const hint = rule('.quick-hint');
    assert.match(hint, /display:flex/);
    assert.match(hint, /align-items:center/);
    assert.match(hint, /gap:6rpx/);
    assert.match(hint, /flex:1/);
    assert.match(wxss, /\.float-dark \.quick-placeholder,\.float-dark \.quick-hint\{color:#aeb4bd\}/);
});

test('只改提示区：确认按钮、输入框与两个入口都保持原样', () => {
    assert.match(wxml, /class="quick-confirm" catchtap="quickSubmit"/);
    assert.match(wxml, /placeholder="试试快捷记，如输入：今天吃了二两小面，一个煎蛋"/);
    assert.match(wxml, /class="quick-button" catchtap="manual"/);
    assert.match(wxml, /class="quick-button" catchtap="photo"/);
});
