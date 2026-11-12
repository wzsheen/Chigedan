const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'prefs', 'prefs.wxml'), 'utf8');

// 按出现顺序取出所有卡片标题
const titles = [...wxml.matchAll(/<text class="prefs-title">([^<]+)<\/text>/g)].map(match => match[1]);

test('偏好设置卡片顺序：饮水快捷量在记录习惯之前', () => {
    assert.deepEqual(titles, [
        '主题风格', '导航栏设置', '显示单位', '饮水快捷量', '记录习惯', '功能开关',
    ]);
    assert.ok(
        titles.indexOf('饮水快捷量') + 1 === titles.indexOf('记录习惯'),
        '饮水快捷量应该紧挨在记录习惯上面'
    );
});

test('交换顺序后两张卡的功能绑定都没丢', () => {
    // 饮水快捷量：三个输入框 + 恢复默认 + 错误提示
    assert.match(wxml, /class="restore-default" bindtap="handleQuickRestore"/);
    assert.match(wxml, /class="quick-field" wx:for="\{\{waterDrafts\}\}"/);
    assert.match(wxml, /bindinput="handleQuickInput"/);
    assert.match(wxml, /wx:if="\{\{quickError\}\}"/);
    // 记录习惯：保存一餐后的两个选项
    assert.match(wxml, /data-key="back" bindtap="handleAfterSave"/);
    assert.match(wxml, /data-key="stay" bindtap="handleAfterSave"/);
    assert.match(wxml, /\{\{afterSaveHint\}\}/);
});
