const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const FILE=path.join(ROOT,'scripts','privacy-page','index.html');
const {UPDATED,CONTACT,SECTIONS,WEB_URL}=require('../utils/privacy-content');
const html=fs.readFileSync(FILE,'utf8');

test('导出的隐私页与 App 内说明同源，不漂移',()=>{
    for(const section of SECTIONS){
        assert.ok(html.indexOf(section.title)>-1,'缺少章节：'+section.title);
        for(const paragraph of section.paragraphs){
            const head=String(paragraph).slice(0,12);
            assert.ok(html.indexOf(head)>-1,'缺少段落（开头：'+head+'…），改完 privacy-content.js 记得跑 scripts/build-privacy-page.js');
        }
    }
    assert.ok(html.indexOf(UPDATED)>-1,'更新日期要与 privacy-content.js 一致');
    assert.ok(html.indexOf(CONTACT.email)>-1,'要留隐私联系邮箱');
});

test('单文件页面：无脚本、无外部资源，GitHub Pages 直接可用',()=>{
    assert.match(html,/^<!doctype html>/i);
    assert.match(html,/lang="zh-CN"/);
    assert.match(html,/name="viewport"/);
    assert.ok(!/<script/i.test(html),'不能带脚本');
    // canonical 只是元信息、不加载资源，允许存在；stylesheet/字体/图标这类外部引用仍然不允许
    const externalLinks=[...html.matchAll(/<link[^>]*>/gi)].map(tag=>tag[0]).filter(tag=>!/rel="canonical"/i.test(tag) && /href="http/i.test(tag));
    assert.equal(externalLinks.length,0,'不能引外部样式或字体（canonical 不算资源）：'+externalLinks.join(' '));
    assert.ok(!/<img[^>]+src="http/i.test(html),'不能引外部图片');
    assert.ok(!/style="[^"]*url\(/i.test(html),'不能内联外部背景图');
});

test('canonical 指向真实部署地址，避免搜索引擎收到两份副本',()=>{
    const canonical=(html.match(/<link[^>]+rel="canonical"[^>]*>/i)||[''])[0];
    assert.ok(canonical,'缺少 canonical');
    assert.ok(canonical.indexOf('href="'+WEB_URL+'"')>-1,'要和 utils/privacy-content.js 的 WEB_URL 一致，生成时用 --url 传最终地址');
});

test('App 内隐私页底部有在线版入口，文字加粗且可点',()=>{
    const wxml=fs.readFileSync(path.join(ROOT,'pages','privacy','privacy.wxml'),'utf8');
    const js=fs.readFileSync(path.join(ROOT,'pages','privacy','privacy.js'),'utf8');
    const wxss=fs.readFileSync(path.join(ROOT,'pages','privacy','privacy.wxss'),'utf8');
    assert.match(wxml,/{{webUrl}}/,'要把地址显示出来，用户可长按复制');
    assert.match(wxml,/handleOpenWeb/,'要能点开浏览器，不能只显示一行不可操作的文字');
    assert.match(js,/WEB_URL/,'地址必须来自 privacy-content.js，不要在这里再写一遍');
    assert.match(wxss,/\.privacy-web-label\{[^}]*font-weight:700/,'入口文字要加粗，否则混在正文里看不见');
    assert.match(wxss,/\.ui-theme-dark \.privacy-web-label/,'深色主题要单独配色，否则棕字贴深底');
});

test('邮箱可点击，且不重复转义',()=>{
    assert.ok(html.indexOf('mailto:'+CONTACT.email)>-1);
    assert.ok(html.indexOf('&amp;amp;')===-1,'不要二次转义');
});

test('若以后重新在弹窗挂外链，链接必须与这份页面地址一致',()=>{
    const copy=JSON.parse(fs.readFileSync(path.join(ROOT,'miniapp-privacy.json'),'utf8'));
    for(const key of Object.keys(copy.messageLinks||{})){
        const url=(copy.messageLinks[key]||{}).url||'';
        assert.match(url,/^https:\/\//,'弹窗链接必须是 HTTPS');
        assert.ok(html.indexOf('href="'+url+'"')>-1,'页面 canonical 与弹窗链接不一致：'+url);
    }
});
