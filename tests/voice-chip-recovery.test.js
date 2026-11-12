// 语音便签失败态：「重试」和「删除」并排，重试在前，字号与图标都比原来大一圈。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'add', 'add.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages', 'add', 'add.wxss'), 'utf8');

function rule(selector) {
    // 规则常挤在一条长行里，用「前一个字符是 } 或换行」来定位选择器开头
    const all = [...wxss.matchAll(new RegExp('(?:^|[}\\n])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))];
    assert.ok(all.length, '缺少样式 ' + selector);
    return all[all.length - 1][1];
}

function num(css, prop) {
    const match = css.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*(-?[\\d.]+)rpx'));
    return match ? parseFloat(match[1]) : null;
}

test('重试在前、删除在后，且两者在便签里并排（横排，不再上下叠）', () => {
    const block = wxml.match(/<view class="voice-chip-recovery"[\s\S]*?<\/view><\/view>/)[0];
    const retry = block.indexOf('handleVoiceRetry');
    const remove = block.indexOf('handleVoiceRemove');
    assert.ok(retry > -1 && remove > -1, '便签里要同时有重试和删除');
    assert.ok(retry < remove, '重试必须在删除前面');
    const recovery = rule('.voice-chip-recovery');
    assert.match(recovery, /flex-direction\s*:\s*row/, '必须是横排，column 会变成上下两行');
    assert.equal(num(recovery, 'gap'), 18, '两个动作之间留 18rpx 间距');
    assert.match(recovery, /align-items\s*:\s*center/, '横排后要垂直居中');
});

test('重试字号从 21rpx 放大到 26rpx，仍保持琥珀色', () => {
    const recovery = rule('.voice-chip-recovery');
    assert.equal(num(recovery, 'font-size'), 26, '重试字号 26rpx');
    assert.match(rule('.voice-chip-recovery>text:first-child'), /color\s*:\s*#ab8331/, '重试保持琥珀色，和删除区分开');
    assert.match(wxss, /\.ui-theme-dark\.add-page \.voice-chip-recovery>text:first-child\{color:#dfc184\}/, '深色主题的重试颜色要保留');
});

test('垃圾桶图标放大到 34×38rpx，热区仍有 52×48rpx', () => {
    const box = rule('.voice-chip-recovery .trash-action');
    assert.equal(num(box, 'width'), 52, '热区宽 52rpx');
    assert.equal(num(box, 'height'), 48, '热区高 48rpx，手指点得到');
    const icon = rule('.voice-chip-recovery .trash-action image');
    assert.equal(num(icon, 'width'), 34, '图标宽 34rpx（原来 24rpx）');
    assert.equal(num(icon, 'height'), 38, '图标高 38rpx（原来 27rpx）');
});

test('横排后不会顶掉标题：便签仍然固定高度并裁掉溢出', () => {
    const chip = rule('.add-page .voice-chip');
    assert.equal(num(chip, 'height'), 104, '便签高度仍是 104rpx');
    assert.match(chip, /overflow\s*:\s*hidden/, '溢出仍然裁掉，不会撑破卡片');
});
