const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const storage = new Map();
global.wx = {
    getStorageSync: key => (storage.has(key) ? structuredClone(storage.get(key)) : ''),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: key => storage.delete(key),
    showToast() {},
    setNavigationBarColor() {},
    setBackgroundColor() {},
    onThemeChange() {},
    getAppBaseInfo: () => ({ theme: 'light' }),
};

const WXML = fs.readFileSync(path.join(__dirname, '..', 'pages', 'ai', 'ai.wxml'), 'utf8');
const WXSS = fs.readFileSync(path.join(__dirname, '..', 'pages', 'ai', 'ai.wxss'), 'utf8');

let definition;
global.Page = value => { definition = value; };
delete require.cache[require.resolve('../pages/ai/ai')];
require('../pages/ai/ai');

const builtin = require('../utils/builtin-ai');

function makePage() {
    const page = Object.assign({}, definition, { data: structuredClone(definition.data) });
    page.setData = patch => Object.assign(page.data, patch);
    return page;
}

test('内置 AI 卡在页头下方，配置 API 卡在标签页下方', () => {
    const header = WXML.indexOf('class="header"');
    const builtinCard = WXML.indexOf('builtin-service-card');
    const tabs = WXML.indexOf('class="ai-tabs"');
    const notice = WXML.indexOf('class="ai-notice');
    const configCard = WXML.indexOf('<view class="card config-card">');
    assert.ok(header >= 0 && builtinCard >= 0 && tabs >= 0 && notice >= 0 && configCard >= 0, '五个区块都要在模板里');
    assert.ok(header < builtinCard, '内置服务卡紧跟页头，作为第一块');
    assert.ok(builtinCard < tabs, '内置服务卡在标签页之前');
    assert.ok(tabs < notice, '配置 API 的状态卡回到标签页下方');
    assert.ok(notice < configCard, 'API 状态卡紧接在配置表单上方');
});

test('内置卡是一键总开关，不再跟着标签页改名字', () => {
    const card = WXML.slice(WXML.indexOf('builtin-service-card'), WXML.indexOf('class="ai-tabs"'));
    assert.match(card, /内置 AI 服务/, '标题固定为「内置 AI 服务」');
    assert.ok(!/\{\{\s*serviceLabel\s*\}\}/.test(card), '内置卡不能再用 serviceLabel 跟着视觉/语音变');
    assert.ok(!/内置\{\{/.test(card), '不能再出现「内置{{…}}」这种拼接');
    assert.match(card, /bindtap="handleBuiltin"/, '一键启停仍绑 handleBuiltin');
    assert.match(card, /wx:if="\{\{builtinAll\}\}"/, '全开时显示「已全部启动」');
    assert.match(card, /wx:elif="\{\{builtinPartial\}\}"/, '只有部分开着时要能看出来');
    assert.match(card, /每项内置服务每天可免费使用 3 次/, '说明沿用原来那句免费次数说明');
    assert.ok(!/共用一个开关/.test(card), '不需要额外解释共用一个开关');
});

test('配置 API 卡里不再重复出现当前服务名', () => {
    const notice = WXML.slice(WXML.indexOf('class="ai-notice'), WXML.indexOf('<view class="card config-card">'));
    assert.ok(!/service-kind/.test(notice), '「请配置 API」下面不再挂视觉/语音/营养估算的小字');
    assert.ok(!/\{\{\s*serviceLabel\s*\}\}/.test(notice), '也不再输出服务名文本');
    assert.match(notice, /请配置 API/, '标题保留');
    assert.match(notice, /handleToggleService/, '启停按钮保留');
});

test('一键启动同时打开三项，再点一次全部关闭', () => {
    storage.clear();
    const page = makePage();
    page.onLoad();
    assert.equal(page.data.builtinAll, false, '初始没有任何内置服务开启');
    assert.equal(page.data.builtinPartial, false);

    page.handleBuiltin();
    assert.deepEqual(storage.get('cal_builtin_ai'), { vision: true, speech: true, nutrition: true }, '一个开关要同时写三项');
    assert.equal(page.data.builtinAll, true);
    assert.equal(page.data.builtinPartial, false);

    page.handleBuiltin();
    assert.deepEqual(storage.get('cal_builtin_ai'), { vision: false, speech: false, nutrition: false });
    assert.equal(page.data.builtinAll, false);
});

test('历史上只开过某一项时显示「部分已启动」，再点启动补齐为全部', () => {
    storage.clear();
    builtin.setEnabled('speech', true);
    const page = makePage();
    page.onLoad();
    assert.equal(page.data.builtinAll, false, '只开一项不算全部启动');
    assert.equal(page.data.builtinPartial, true, '要提示部分已启动');
    assert.equal(page.data.builtinEnabled, false, '当前停在视觉页，视觉的内置没开');

    page.handleBuiltin();
    assert.deepEqual(storage.get('cal_builtin_ai'), { vision: true, speech: true, nutrition: true });
    assert.equal(page.data.builtinAll, true);
});

test('API 卡按当前服务独立启停，内置卡状态随之回落到「部分」', () => {
    storage.clear();
    builtin.setEnabled('vision', true);
    builtin.setEnabled('speech', true);
    builtin.setEnabled('nutrition', true);
    const page = makePage();
    page.onLoad();
    assert.equal(page.data.builtinAll, true);

    page.handleBuiltin(); // 先全关，模拟用户改用自己配置的服务
    const ai = require('../utils/ai-settings');
    ai.save('vision', { provider: 'custom', baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: '' });
    ai.setEnabled('vision', true);
    page.select('vision');
    assert.equal(page.data.builtinEnabled, false, '内置已关，API 才会生效');
    assert.equal(page.data.enabled, true, '当前服务的 API 已启动');
    assert.equal(page.data.builtinAll, false, '内置没有全开');
    assert.equal(page.data.builtinPartial, false);
});

test('样式：内置卡不再依赖与标签页相邻的负边距', () => {
    assert.ok(!/\.ai-tabs\s*\+\s*\.builtin-service-card/.test(WXSS), '换位置后相邻选择器会失效');
    assert.match(WXSS, /\.page\s+\.builtin-service-card\s*\{[^}]*padding:\s*19rpx 23rpx/, '内置卡保持原来的紧凑内边距');
    assert.match(WXSS, /\.ai-tabs\{[^}]*margin:25rpx 0 12rpx/, '标签页与下方 API 卡之间收紧一点');
    assert.ok(!/\.service-kind/.test(WXSS), '没有用到的小字样式一并删掉');
});
