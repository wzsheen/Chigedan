// 记一餐搜索框：话筒旁的录音波纹要「看得清」——两根柱子、够粗、有高低差。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'add', 'add.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages', 'add', 'add.wxss'), 'utf8');

function rule(selector) {
    // add.wxss 上有一段同名旧声明，后写的生效，所以取最后一条；只看行首选择器，避免命中 .ui-theme-dark 前缀规则
    const all = [...wxss.matchAll(new RegExp('(?:^|\\n)' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))];
    assert.ok(all.length, '缺少样式 ' + selector);
    return all[all.length - 1][1];
}

function num(css, prop) {
    const match = css.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*(-?[\\d.]+)rpx'));
    return match ? parseFloat(match[1]) : null;
}

const voiceLine = wxml.match(/<view class="search-voice[\s\S]*?search-voice-mic"[\s\S]*?<\/view><\/view>/)[0];

test('录音时左右各两根柱子，柱子上带 search-mic-bar 类名（不再用裸 view 选择器）', () => {
    const left = voiceLine.match(/search-mic-wave search-mic-wave-left"[\s\S]*?<\/view><\/view>/)[0];
    const right = voiceLine.match(/search-mic-wave search-mic-wave-right"[\s\S]*?<\/view><\/view>/)[0];
    for (const [name, group] of [['左', left], ['右', right]]) {
        const bars = group.match(/search-mic-bar/g) || [];
        assert.equal(bars.length, 2, name + '侧应该是两根柱子');
    }
    assert.equal((voiceLine.match(/search-mic-bar/g) || []).length, 4, '四根柱子都走 .search-mic-bar，样式才吃得准');
    assert.doesNotMatch(wxss, /\.search-mic-wave view\s*\{/, '柱子不能再靠 view 标签选择器上色，否则小程序与预览端不一致');
});

test('柱子够粗、够高：6rpx 宽，高柱 24rpx / 矮柱 14rpx', () => {
    const bar = rule('.search-mic-bar');
    assert.equal(num(bar, 'width'), 6, '柱子宽度 6rpx（约 3px），3rpx 太细看不清');
    assert.equal(num(bar, 'height'), 14, '矮柱 14rpx');
    assert.match(bar, /linear-gradient\(180deg,#ffd05a,#efab2c\)/, '柱子用琥珀渐变，单色 #e9b847 在白底上不够跳');

    const tall = wxss.match(/\.search-mic-wave-left \.search-mic-bar:last-child,[^{]*\{([^}]*)\}/);
    assert.ok(tall, '缺少内侧高柱规则');
    assert.equal(num(tall[1], 'height'), 24, '内侧高柱 24rpx，与矮柱拉开 10rpx 高低差');
});

test('波纹与话筒平行：整组中线落在话筒胶囊中线（不是盒子中线，也不能按 -7rpx 过度上移）', () => {
    const wave = rule('.search-mic-wave');
    const mic = rule('.search-voice-mic');
    // 话筒 margin-top:-7rpx 在 flex 居中下只让胶囊上移 3.5rpx，再按设计图往下 1.5rpx ≈ 2rpx
    assert.match(wave, /top\s*:\s*calc\(50% - 2rpx\)/, '波纹要跟着胶囊中线走，写成 -7rpx 会整体偏高');
    assert.equal(num(mic, 'margin-top'), -7, '话筒仍上移 7rpx');
    assert.equal(num(wave, 'gap'), 4, '两根柱子间距 4rpx');
});

test('话筒盒子留出波纹位：68rpx 宽，话筒尺寸不变', () => {
    const voice = rule('.portion-search .search-voice');
    assert.equal(num(voice, 'width'), 68, '盒子加宽到 68rpx，波纹才不会顶到输入框');
    const mic = rule('.search-voice-mic');
    assert.equal(num(mic, 'width'), 16, '话筒本体宽度保持 16rpx');
    assert.equal(num(mic, 'height'), 24, '话筒本体高度保持 24rpx');
});

test('波纹仍在录音态才出现，深浅主题各有配色，减动效时不抖动', () => {
    assert.match(wxml, /wx:if="\{\{recordingFromSearch\}\}"[^>]*search-mic-wave-left/, '波纹跟随录音态出现');
    assert.match(wxml, /wx:if="\{\{recordingFromSearch\}\}"[^>]*search-mic-wave-right/, '右侧波纹同样跟随录音态');
    assert.match(wxss, /\.ui-theme-dark \.search-mic-bar\s*\{[^}]*linear-gradient/, '深色主题要有更亮的柱子');
    assert.match(wxss, /@media \(prefers-reduced-motion:reduce\)\{\.search-mic-bar\{animation:none\}\}/, '尊重减动效设置');
    assert.match(wxss, /@keyframes search-wave\{from\{transform:scaleY\(\.35\)\}to\{transform:scaleY\(1\)\}\}/, '波纹幅度从 0.35 到 1');
});
