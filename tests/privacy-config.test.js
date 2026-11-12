const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'project.miniapp.json'),'utf8'));
const copy=JSON.parse(fs.readFileSync(path.join(ROOT,'miniapp-privacy.json'),'utf8'));

test('开启隐私弹窗的平台都指向真实模板文件',()=>{
    for(const key of ['mini-android','mini-ios']){
        const privacy=(config[key]||{}).privacy||{};
        assert.equal(privacy.enable,true,key+' 应开启隐私弹窗：应用市场要求启动即告知');
        assert.equal(privacy.template,'miniapp-privacy.json',key+' 的 template 必须指向 miniapp-privacy.json');
        assert.ok(fs.existsSync(path.join(ROOT,privacy.template)),privacy.template+' 不存在，弹窗会回退默认文案');
    }
});

test('弹窗文案不与框架默认模板雷同',()=>{
    // 默认模板写的是「收集设备标识、操作日志等信息用于分析、优化应用性能」，本项目不做这些
    assert.ok(!/设备标识/.test(copy.message),'默认模板文案与实际行为不符');
    assert.ok(!/操作日志/.test(copy.message),'默认模板文案与实际行为不符');
});

test('弹窗外链：占位符必须是完整的 __x__，与 messageLinks 的键逐字对应',()=>{
    // 血泪教训：第一次把键写成裸的 "a"（少了前后下划线），框架就没按占位符匹配，
    // 而是把正文里每个字母 a 都替换成了链接，Supabase 被拆成 Sup《…》b《…》se，__ 还残留在正文里。
    const placeholders=[...copy.message.matchAll(/__([a-z]+)__/g)].map(row=>row[0]);
    assert.ok(placeholders.length>0,'message 里要有占位符，否则链接挂不上去');
    const links=copy.messageLinks||{};
    const keys=Object.keys(links);
    for(const key of keys){
        assert.match(key,/^__[a-z]+__$/,'messageLinks 的键必须写成 __x__ 全形式，裸字母会被全文替换：'+key);
        assert.ok(placeholders.indexOf(key)>-1,key+' 在 message 里没有被引用');
        const item=links[key];
        assert.ok(String(item.text||'').trim(),'链接要有可点的文字');
        assert.match(item.url,/^https:\/\//,'外链必须 HTTPS');
        assert.equal(item.showExternal,true,'github.io 无法做业务域名校验，内置 WebView 打不开，只能用系统浏览器');
    }
    for(const holder of placeholders){
        assert.ok(links[holder],holder+' 没有对应的 messageLinks，弹窗里会显示成裸占位符');
    }
});

test('弹窗链接指向在线版说明，且与 App 内常量同源',()=>{
    const content=require('../utils/privacy-content');
    const links=copy.messageLinks||{};
    const urls=Object.keys(links).map(key=>links[key].url);
    assert.ok(urls.indexOf(content.WEB_URL)>-1,'弹窗链接要和 utils/privacy-content.js 的 WEB_URL 一致');
    assert.match(copy.message,/先读|先看|建议先/,'文案要引导用户先读再决定');
});

test('样式键名符合官方 schema：confirmButton/cancelButton，链接单独上色',()=>{
    const styles=copy.styles||{};
    // 官方字段是 confirmButton / cancelButton，写成 confirm / cancel 会被静默忽略
    assert.ok(styles.confirmButton,'styles.confirmButton 缺省会导致主按钮用默认色');
    assert.ok(styles.cancelButton,'styles.cancelButton 缺省会导致次按钮用默认色');
    assert.equal(styles.confirm,undefined,'confirm 不是合法键名，改用 confirmButton');
    assert.equal(styles.cancel,undefined,'cancel 不是合法键名，改用 cancelButton');
    assert.match(styles.messageLinks.color,/^#[0-9A-Fa-f]{6}$/,'链接颜色只能配颜色，用它做视觉强调');
});

test('弹窗四要素齐全，长度一屏可读',()=>{
    for(const key of ['title','confirm','cancel','message']){
        assert.equal(typeof copy[key],'string',key+' 必须是字符串');
        assert.ok(copy[key].trim().length>0,key+' 不能为空');
    }
    assert.ok(copy.title.length<=10,'标题过长会被截断');
    assert.ok(copy.message.length<=320,'弹窗要一屏读完，全文放 App 内的隐私页');
});

test('文案与隐私页口径一致：本地存储、权限可拒、AI 走用户选的服务商',()=>{
    const content=require('../utils/privacy-content');
    assert.match(copy.message,/本机/);
    assert.match(copy.message,/拒绝|可手动/);
    assert.match(copy.message,/服务商/);
    const email=(copy.message.match(/[\w.+-]+@[\w-]+\.[\w.]+/)||[])[0];
    if(email){
        assert.equal(email,content.CONTACT.email,'弹窗与隐私页的联系邮箱要一致');
    }
});

test('样式只配颜色与圆角，不写死尺寸',()=>{
    assert.equal(typeof copy.styles.borderRadius,'number');
    assert.match(copy.styles.backgroundColor,/^#[0-9A-Fa-f]{6}$/);
    for(const key of ['width','height','top','left']){
        assert.equal(copy.styles[key],undefined,key+' 交给框架自适应，写死会在小屏溢出');
    }
});

test('Android 权限用途描述：覆盖实际用到的权限，句式符合审核要求',()=>{
    const desc=(config['mini-android']||{}).privateDescriptions||{};
    // 这三类权限在代码里真实使用：chooseMedia（拍照/相册）、getRecorderManager（语音）
    for(const key of ['CAMERA','RECORD_AUDIO','READ_MEDIA_IMAGES','READ_EXTERNAL_STORAGE']){
        assert.ok(desc[key],key+' 缺用途描述，上架会以未声明用途驳回');
        assert.match(desc[key],/^申请.+权限用于/,key+' 要用「申请 XXX 权限用于 XXXX」的句式');
        assert.ok(desc[key].length<=40,key+' 描述过长会显示不全');
    }
    assert.equal(desc['android.permission.CAMERA'],undefined,'键名不带 android.permission. 前缀');
});

test('没有调用的权限不要写用途描述',()=>{
    const desc=(config['mini-android']||{}).privateDescriptions||{};
    for(const key of ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','READ_CONTACTS','READ_PHONE_STATE','POST_NOTIFICATIONS']){
        assert.equal(desc[key],undefined,key+' 项目没有调用，声明了反而与实际不符');
    }
});
