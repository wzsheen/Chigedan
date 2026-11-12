const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();
let clipboard='';
let lastNavigation='';
const appInstance={globalData:{}};
global.getApp=()=>appInstance;

global.wx={
    getStorageSync:key=>(storage.has(key)?structuredClone(storage.get(key)):''),
    setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),
    removeStorageSync:key=>storage.delete(key),
    request(){throw new Error('本用例不应发起请求');},
    setClipboardData:options=>{clipboard=options.data;if(options.success)options.success();},
    navigateTo(options){lastNavigation=options.url;},showToast(){},
    getAppBaseInfo:()=>({theme:'light'}),
    setNavigationBarColor(){},setBackgroundColor(){},onThemeChange(){},
};

const update=require('../utils/app-update');
const settings=require('../utils/settings');

function mockRelease(payload,statusCode=200){
    wx.request=options=>{options.success({statusCode,data:payload});};
}
function mockFail(){wx.request=options=>{options.fail({errMsg:'request:fail'});};}
function configure(url){storage.set('cal_update_endpoint',url);}

test('版本比较按数字段逐位比，预发布版低于同号正式版',()=>{
    assert.equal(update.compareVersion('1.2.0','1.1.9'),1);
    assert.equal(update.compareVersion('1.0.10','1.0.9'),1);
    assert.equal(update.compareVersion('v2.0.0','1.9.9'),1);
    assert.equal(update.compareVersion('1.0.0','1.0.0'),0);
    assert.equal(update.compareVersion('1.0','1.0.0'),0);
    assert.equal(update.compareVersion('1.0.0','1.0.0-beta'),1);
    assert.equal(update.compareVersion('abc','1.0.0'),0);
});

test('精简结构与 GitHub 原始结构都能解析，下载地址优先安装包',()=>{
    const simple=update.normalizePayload({version:'v1.3.0',notes:'修复若干问题',releaseUrl:'https://x/tag',downloadUrl:'https://x/app.apk',publishedAt:'2026-11-03T10:00:00Z'});
    assert.equal(simple.version,'1.3.0');
    assert.equal(simple.downloadUrl,'https://x/app.apk');

    const raw=update.normalizePayload({tag_name:'v1.4.0',body:'更新说明',html_url:'https://github.com/x/y/releases/tag/v1.4.0',published_at:'2026-11-04T00:00:00Z',assets:[{name:'notes.txt',browser_download_url:'https://x/notes.txt'},{name:'app-release.apk',browser_download_url:'https://x/app-release.apk'}]});
    assert.equal(raw.version,'1.4.0');
    assert.equal(raw.notes,'更新说明');
    assert.equal(raw.downloadUrl,'https://x/app-release.apk');
    assert.equal(update.formatDate(raw.publishedAt),'2026年11月4日');
});

test('未设置调试覆盖时从 Chigedan Pages 检查更新',async()=>{
    storage.clear();
    let url;
    wx.request=options=>{
        url=new URL(options.url);
        options.success({statusCode:200,data:{version:update.LOCAL_VERSION}});
    };
    const result=await update.check();
    assert.equal(result.status,'latest');
    assert.equal(url.origin,'https://wzsheen.github.io');
    assert.equal(url.pathname,'/Chigedan/version.json');
});

test('远程版本更高时返回 new，带说明与下载地址并写入缓存',async()=>{
    storage.clear();
    configure('https://example.com/version');
    mockRelease({tag_name:'v1.1.0',body:'1. 新的记一笔\n2. 修复若干问题',html_url:'https://github.com/wzsheen/calorie-tracker/releases/tag/v1.1.0',published_at:'2026-11-03T10:00:00Z',assets:[{name:'app.apk',browser_download_url:'https://example.com/app.apk'}]});
    const result=await update.check();
    assert.equal(result.status,'new');
    assert.equal(result.remoteVersion,'1.1.0');
    assert.equal(result.downloadUrl,'https://example.com/app.apk');
    assert.equal(result.notes.indexOf('新的记一笔')>-1,true);
    assert.equal(result.dateText,'2026年11月3日');

    const cached=update.readCache();
    assert.equal(cached.result.status,'new');
    assert.equal(update.isCacheFresh(cached.checkedAt),true);
});

test('同版本或更低版本返回 latest',async()=>{
    storage.clear();
    configure('https://example.com/version');
    mockRelease({version:update.LOCAL_VERSION});
    const same=await update.check();
    assert.equal(same.status,'latest');

    // 低于当前 APK 版本的 Release（比如误留的旧 tag）不能报更新
    mockRelease({version:'0.0.0'});
    const older=await update.check();
    assert.equal(older.status,'latest');
});

test('404、非 2xx、网络失败、坏 JSON 都给可读提示',async()=>{
    storage.clear();
    configure('https://example.com/version');

    mockRelease({},404);
    assert.match((await update.check()).message,/404/);

    mockRelease({},500);
    assert.match((await update.check()).message,/500/);

    mockFail();
    assert.match((await update.check()).message,/网络/);

    mockRelease('not json');
    assert.match((await update.check()).message,/格式/);

    mockRelease({notes:'没有版本号'});
    assert.match((await update.check()).message,/版本号/);
});

test('非 HTTPS 的接口地址直接拒绝',async()=>{
    storage.clear();
    configure('http://example.com/version');
    let calls=0;wx.request=()=>{calls+=1;};
    const result=await update.check();
    assert.equal(result.status,'error');
    assert.equal(calls,0);
    assert.match(result.message,/HTTPS/);
});

test('关于页：检查到新版自动弹说明，复制按钮落到剪贴板',async()=>{
    storage.clear();
    configure('https://example.com/version');
    mockRelease({version:'1.2.0',notes:'更新内容',downloadUrl:'https://example.com/app.apk',publishedAt:'2026-11-03T10:00:00Z'});

    let definition=null;
    global.Page=value=>{definition=value;};
    // 页面模块被缓存，先清掉再 require，否则后面的用例拿不到 Page 定义
    delete require.cache[require.resolve('../pages/about/about')];
    require('../pages/about/about');
    const page={...definition,data:structuredClone(definition.data)};
    page.setData=patch=>Object.assign(page.data,patch);

    page.onLoad({});
    assert.equal(page.data.version,update.LOCAL_VERSION);
    assert.equal(page.data.updateLabel,'检查更新');

    page.handleCheckUpdate();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(page.data.updateState,'new');
    assert.equal(page.data.updateSheetOpen,true);
    assert.equal(page.data.updateNote.indexOf('发现新版本 v1.2.0')>-1,true);
    assert.equal(page.data.updateInfo.notes,'更新内容');

    page.handleCopyUpdateLink();
    assert.equal(clipboard,'https://example.com/app.apk');
    assert.match(page.data.sheetCopyHint,/已复制/);

    page.handleCloseUpdate();
    assert.equal(page.data.updateSheetOpen,false);
});

test('关于页：已知有新版时再点不重复请求，直接打开说明',async()=>{
    storage.clear();
    configure('https://example.com/version');
    let calls=0;
    wx.request=options=>{calls+=1;options.success({statusCode:200,data:{version:'1.2.0',notes:'更新内容',downloadUrl:'https://example.com/app.apk'}});};

    let definition=null;
    global.Page=value=>{definition=value;};
    // 页面模块被缓存，先清掉再 require，否则后面的用例拿不到 Page 定义
    delete require.cache[require.resolve('../pages/about/about')];
    require('../pages/about/about');
    const page={...definition,data:structuredClone(definition.data)};
    page.setData=patch=>Object.assign(page.data,patch);

    page.handleCheckUpdate();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(calls,1);

    page.handleCloseUpdate();
    page.handleCheckUpdate();
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(calls,1,'不应再发请求');
    assert.equal(page.data.updateSheetOpen,true);
});

test('关于页：进页面只回显上次结果，不发请求',async()=>{
    storage.clear();
    configure('https://example.com/version');
    storage.set('cal_update_cache',{checkedAt:Date.now(),result:{ok:true,status:'latest',localVersion:update.LOCAL_VERSION,remoteVersion:update.LOCAL_VERSION}});
    let calls=0;wx.request=()=>{calls+=1;};

    let definition=null;
    global.Page=value=>{definition=value;};
    // 页面模块被缓存，先清掉再 require，否则后面的用例拿不到 Page 定义
    delete require.cache[require.resolve('../pages/about/about')];
    require('../pages/about/about');
    const page={...definition,data:structuredClone(definition.data)};
    page.setData=patch=>Object.assign(page.data,patch);
    page.onShow();

    assert.equal(page.data.updateState,'latest');
    assert.match(page.data.updateNote,/已是最新版本/);
    assert.equal(calls,0);
});

test('自动检查仅在发现未关闭的新版本时跳转关于页',async()=>{
    storage.clear();
    settings.setHomeDisplay({autoUpdate:true});
    let calls=0;
    wx.request=options=>{calls+=1;options.success({statusCode:200,data:{version:'1.0.0',notes:'更新',downloadUrl:'https://x/app.apk'}});};
    let definition;
    global.Page=value=>{definition=value;};
    delete require.cache[require.resolve('../pages/index/index')];
    require('../pages/index/index');
    const page={...definition,data:structuredClone(definition.data),homeVisible:true,setData(patch){Object.assign(this.data,patch);}};
    page.checkUpdateOnStartup(true);
    await Promise.resolve();
    assert.equal(calls,1);
    assert.equal(global.getApp().globalData.pendingUpdateInfo.version,'1.0.0');
    assert.equal(lastNavigation,'/pages/about/about?autoUpdate=1');
});

test('App 内版本号与 APK 构建版本保持一致，防止更新检查永远报有新版本',()=>{
    const fs=require('node:fs');
    const path=require('node:path');
    const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../project.miniapp.json'),'utf8'));
    assert.equal(update.LOCAL_VERSION,config.version);
    assert.ok(Number(config.versionCode)>0);
});

test('安装包信息：优先 APK 附件，给出体积文案',()=>{
    const raw=update.normalizePayload({tag_name:'v0.0.2',assets:[
        {name:'release-notes.txt',size:1024,browser_download_url:'https://x/notes.txt'},
        {name:'app-release.apk',size:12582912,browser_download_url:'https://x/app-release.apk'},
    ]});
    assert.equal(raw.downloadUrl,'https://x/app-release.apk');
    assert.equal(raw.assetName,'app-release.apk');
    assert.equal(raw.sizeText,'12.0 MB');
    assert.equal(update.formatSize(0),'');
    assert.equal(update.formatSize(2048),'2 KB');
});

test('bump-version 脚本同时改 APK 配置与 App 内版本号',()=>{
    const fs=require('node:fs');
    const os=require('node:os');
    const path=require('node:path');
    const {execFileSync}=require('node:child_process');
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'cal-bump-'));
    fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
    fs.mkdirSync(path.join(root,'utils'),{recursive:true});
    fs.copyFileSync(path.join(__dirname,'../scripts/bump-version.js'),path.join(root,'scripts/bump-version.js'));
    fs.writeFileSync(path.join(root,'project.miniapp.json'),JSON.stringify({version:'0.0.1',versionCode:100,other:{keep:true}}));
    fs.writeFileSync(path.join(root,'utils/app-update.js'),"const LOCAL_VERSION = '0.0.1';\nconst BUILD_CHANNEL = 'development';\n");

    execFileSync(process.execPath,[path.join(root,'scripts/bump-version.js'),'v0.0.2','beta']);
    const config=JSON.parse(fs.readFileSync(path.join(root,'project.miniapp.json'),'utf8'));
    assert.equal(config.version,'0.0.2');
    assert.equal(config.versionCode,101);
    assert.deepEqual(config.other,{keep:true});
    assert.match(fs.readFileSync(path.join(root,'utils/app-update.js'),'utf8'),/LOCAL_VERSION = '0\.0\.2'/);
    assert.match(fs.readFileSync(path.join(root,'utils/app-update.js'),'utf8'),/BUILD_CHANNEL = 'beta'/);

    assert.throws(()=>execFileSync(process.execPath,[path.join(root,'scripts/bump-version.js'),'abc'],{stdio:'pipe'}));
    fs.rmSync(root,{recursive:true,force:true});
});

test('关于页：点「现在更新」把安装包直链交给系统浏览器',async()=>{
    storage.clear();
    clipboard='';
    configure('https://example.com/version');
    mockRelease({version:'1.2.0',notes:'更新内容',downloadUrl:'https://example.com/app.apk'});
    let opened='';
    wx.miniapp={openUrl(options){opened=options.url;if(options.success)options.success();}};

    let definition=null;
    global.Page=value=>{definition=value;};
    delete require.cache[require.resolve('../pages/about/about')];
    require('../pages/about/about');
    const page={...definition,data:structuredClone(definition.data)};
    page.setData=patch=>Object.assign(page.data,patch);

    page.handleCheckUpdate();
    await new Promise(resolve=>setTimeout(resolve,20));
    page.handleStartUpdate();

    assert.equal(opened,'https://example.com/app.apk','要把 APK 直链交给 openUrl');
    assert.equal(clipboard,'','能直接打开时不该再走复制');
    assert.match(page.data.sheetCopyHint,/浏览器/);
    delete wx.miniapp;
});

test('关于页：没有 openUrl 的环境退回复制链接，不把用户卡死',async()=>{
    storage.clear();
    clipboard='';
    configure('https://example.com/version');
    mockRelease({version:'1.2.0',notes:'更新内容',downloadUrl:'https://example.com/app.apk'});
    delete wx.miniapp;

    let definition=null;
    global.Page=value=>{definition=value;};
    delete require.cache[require.resolve('../pages/about/about')];
    require('../pages/about/about');
    const page={...definition,data:structuredClone(definition.data)};
    page.setData=patch=>Object.assign(page.data,patch);

    page.handleCheckUpdate();
    await new Promise(resolve=>setTimeout(resolve,20));
    page.handleStartUpdate();

    assert.equal(clipboard,'https://example.com/app.apk');
    assert.match(page.data.sheetCopyHint,/已复制/);
});

test('失败结果不写缓存，下次进页面不会被旧错误占据',async()=>{
    storage.clear();
    configure('https://example.com/version');
    mockFail();
    const failed=await update.check();
    assert.equal(failed.ok,false);
    assert.equal(update.readCache(),null);

    mockRelease({version:'1.0.0'});
    await update.check();
    mockFail();
    await update.check();
    const cached=update.readCache();
    assert.equal(cached.result.ok,true,'失败不应覆盖上一次成功结果');
    assert.equal(cached.result.status,'new');
});

test('静态版本文件本身能被客户端解析，字段齐全',()=>{
    const fs=require('node:fs');
    const path=require('node:path');
    const file=path.join(__dirname,'../scripts/version-endpoint/version.json');
    const payload=JSON.parse(fs.readFileSync(file,'utf8'));

    assert.match(payload.version,/^\d+(\.\d+){0,2}$/,'版本号必须是不带 v 的数字');
    assert.ok(payload.notes.trim(),'必须写更新说明，否则 App 里是空白面板');
    assert.ok(!payload.downloadUrl||/^https:\/\//i.test(payload.downloadUrl),'下载地址必须是 HTTPS');

    const parsed=update.normalizePayload(payload);
    assert.equal(parsed.version,payload.version);
    assert.equal(parsed.downloadUrl,payload.downloadUrl||'');
});

test('请求版本文件时带时间戳参数，避免 CDN 缓存挡住新版本',async()=>{
    storage.clear();
    configure('https://example.com/app/version.json');
    let requested='';
    wx.request=options=>{requested=options.url;options.success({statusCode:200,data:{version:'0.0.2'}});};
    await update.check();
    assert.match(requested,/_t=\d+/);

    // 带查询参数的地址不能拼出两个 ?
    assert.equal(update.withCacheBuster('https://x/v.json?v=1').split('?').length,2);
    assert.match(update.withCacheBuster('https://x/v.json?v=1'),/v=1&_t=\d+/);
    assert.equal(update.withCacheBuster(''),'');
});

// ---- 应用内更新链路：downloadFile → installApp ----

function loadAboutPage(){
    let definition=null;
    global.Page=value=>{definition=value;};
    delete require.cache[require.resolve('../pages/about/about')];
    require('../pages/about/about');
    const page={...definition,data:structuredClone(definition.data)};
    page.setData=patch=>Object.assign(page.data,patch);
    return page;
}

async function openUpdateSheet(page){
    configure('https://example.com/version');
    mockRelease({version:'1.2.0',notes:'更新内容',downloadUrl:'https://example.com/app.apk'});
    page.handleCheckUpdate();
    await new Promise(resolve=>setTimeout(resolve,20));
}

test('有 installApp 时在应用内下载并拉起安装器，不再复制链接',async()=>{
    storage.clear();
    clipboard='';
    let installed='';
    let progressCallback=null;
    wx.downloadFile=options=>{
        progressCallback=fn=>{progressCallback=fn;};
        setTimeout(()=>{
            if(progressCallback)progressCallback({progress:62});
            options.success({statusCode:200,tempFilePath:'wxfile://tmp/app.apk'});
        },0);
        return {onProgressUpdate(fn){progressCallback=fn;}};
    };
    wx.miniapp={
        openUrl(){throw new Error('能应用内安装就不该打开浏览器');},
        installApp(options){installed=options.filePath;if(options.success)options.success();},
    };

    const page=loadAboutPage();
    await openUpdateSheet(page);
    page.handleStartUpdate();
    await new Promise(resolve=>setTimeout(resolve,10));

    assert.equal(installed,'wxfile://tmp/app.apk','要下载完成后把临时文件路径交给 installApp');
    assert.equal(clipboard,'');
    assert.equal(page.data.installStage,'idle','装完后状态要复位，否则按钮一直是「安装中」');
    assert.match(page.data.sheetCopyHint,/安装/);
    delete wx.downloadFile;
    delete wx.miniapp;
});

test('下载被域名白名单拦住时退回浏览器，并说明原因',async()=>{
    storage.clear();
    clipboard='';
    let opened='';
    wx.downloadFile=options=>{
        setTimeout(()=>options.fail({errMsg:'downloadFile:fail url not in domain list'}),0);
        return {onProgressUpdate(){}};
    };
    wx.miniapp={
        installApp(){throw new Error('下载都没成功，不该去调用安装器');},
        openUrl(options){opened=options.url;if(options.success)options.success();},
    };

    const page=loadAboutPage();
    await openUpdateSheet(page);
    page.handleStartUpdate();
    await new Promise(resolve=>setTimeout(resolve,10));

    assert.equal(opened,'https://example.com/app.apk','下载失败要退回系统浏览器');
    assert.equal(page.data.installStage,'idle');
    assert.match(page.data.sheetCopyHint,/白名单/);
    delete wx.downloadFile;
    delete wx.miniapp;
});

test('安装器报签名不一致时给可读提示，而不是抛 errMsg',async()=>{
    storage.clear();
    clipboard='';
    wx.downloadFile=options=>{
        setTimeout(()=>options.success({statusCode:200,tempFilePath:'wxfile://tmp/app.apk'}),0);
        return {onProgressUpdate(){}};
    };
    wx.miniapp={
        installApp(options){if(options.fail)options.fail({errMsg:'installApp:fail Signature verification failed'});},
        openUrl(options){if(options.success)options.success();},
    };

    const page=loadAboutPage();
    await openUpdateSheet(page);
    page.handleStartUpdate();
    await new Promise(resolve=>setTimeout(resolve,10));

    assert.match(page.data.sheetCopyHint,/卸载旧版/);
    delete wx.downloadFile;
    delete wx.miniapp;
});

test('版本号以运行时 appVersion 为准，包内常量落后也不会一直提示更新',async()=>{
    storage.clear();
    wx.getAppBaseInfo=()=>({theme:'light',appVersion:'0.0.2'});
    configure('https://example.com/version');
    mockRelease({version:'0.0.2'});

    const result=await update.check();
    assert.equal(result.status,'latest','装的是 0.0.2 就不该再提示 0.0.2 是新版本');
    assert.equal(update.appVersion(),'0.0.2');

    wx.getAppBaseInfo=()=>({theme:'light'});
    assert.equal(update.appVersion(),update.LOCAL_VERSION,'取不到真实版本时回落常量');
});

// ---- 「稍后」的冷却与重提醒 ----

test('「稍后」只静音 24 小时，冷却过后或换了版本继续提醒',()=>{
    storage.clear();
    const now=Date.now();
    update.dismiss('1.2.0',now);
    assert.equal(update.isDismissed('1.2.0',now+1000),true,'刚关掉要安静');
    assert.equal(update.isDismissed('1.2.0',now+update.DISMISS_COOLDOWN-1),true,'冷却期内不打扰');
    assert.equal(update.isDismissed('1.2.0',now+update.DISMISS_COOLDOWN+1),false,'过了 24 小时要重新提醒');
    assert.equal(update.isDismissed('1.3.0',now+1),false,'换新版本要提醒');
    assert.equal(update.isDismissed('',now),false);
    assert.equal(update.isDismissed('1.2.0'),true,'默认按当前时间判断');
});

test('老版本留下的永久静音键被忽略，写入新记录时顺手清掉',()=>{
    storage.clear();
    storage.set('cal_update_dismissed_version','0.0.2');
    assert.equal(update.isDismissed('0.0.2'),false,'老键没有时间戳，按冷却已过处理，升级后能重新看到提醒');
    update.dismiss('0.0.2');
    assert.equal(storage.has('cal_update_dismissed_version'),false,'两套记录不能互相打架');
    assert.equal(update.isDismissed('0.0.2'),true);

    update.clearDismiss();
    assert.equal(update.isDismissed('0.0.2'),false,'清掉后可以立刻再提示');
});

test('自动检查：已点过稍后的版本不跳转，冷却过后恢复，失败 2 分钟后可重试',async()=>{
    storage.clear();
    settings.setHomeDisplay({autoUpdate:true});
    lastNavigation='';
    let calls=0;
    wx.request=options=>{calls+=1;options.success({statusCode:200,data:{version:'1.0.0',notes:'更新',downloadUrl:'https://x/app.apk'}});};
    let definition;
    global.Page=value=>{definition=value;};
    delete require.cache[require.resolve('../pages/index/index')];
    require('../pages/index/index');
    const makePage=()=>({...definition,data:structuredClone(definition.data),homeVisible:true,setData(patch){Object.assign(this.data,patch);}});

    update.dismiss('1.0.0');
    const quiet=makePage();
    quiet.checkUpdateOnStartup(true);
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(lastNavigation,'','刚点过稍后，不该立刻再弹');

    // 冷却期过了：用同一个页面实例（相当于 App 退后台很久后再回来）
    update.dismiss('1.0.0',Date.now()-update.DISMISS_COOLDOWN-1000);
    quiet.updateNextCheckAt=0;
    quiet.checkUpdateOnStartup(true);
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(lastNavigation,'/pages/about/about?autoUpdate=1','冷却过后要重新提醒');

    // 5 分钟内不重复请求
    lastNavigation='';
    const second=makePage();
    const before=calls;
    second.checkUpdateOnStartup(true);
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(calls,before+1);
    second.checkUpdateOnStartup(true);
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(calls,before+1,'5 分钟内不重复发请求');

    // 检查失败后 2 分钟就允许重试，而不是等满 5 分钟
    const failing=makePage();
    mockFail();
    failing.checkUpdateOnStartup(true);
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(failing.updateNextCheckAt>0);
    assert.ok(failing.updateNextCheckAt-Date.now()<=120000+50,'失败后按 2 分钟重试');
});

test('点过「现在更新」再关弹窗不静音，下次启动还要提醒',async()=>{
    storage.clear();
    settings.setHomeDisplay({autoUpdate:true});
    wx.downloadFile=()=>{
        wx.miniapp.installApp={};
        return {onProgressUpdate(){}};
    };
    wx.miniapp={installApp(){},openUrl(){}};

    const page=loadAboutPage();
    await openUpdateSheet(page);
    page.handleStartUpdate();
    page.handleCloseUpdate();
    assert.equal(update.isDismissed('1.2.0'),false,'下载没装成说明用户想更新，不能静音');

    // 没点更新、只是关掉说明的，才进入冷却
    const other=loadAboutPage();
    await openUpdateSheet(other);
    other.handleCloseUpdate();
    assert.equal(update.isDismissed('1.2.0'),true);

    delete wx.downloadFile;
    delete wx.miniapp;
});

test('下载进度里带「已下载 / 总量」的 MB 文案',async()=>{
    storage.clear();
    let progressCallback=null;
    wx.downloadFile=options=>{
        setTimeout(()=>{
            if(progressCallback)progressCallback({progress:19,totalBytesWritten:12582912,totalBytesExpectedToWrite:66479718});
        },0);
        return {onProgressUpdate(fn){progressCallback=fn;}};
    };
    wx.miniapp={installApp(){},openUrl(){}};

    const page=loadAboutPage();
    await openUpdateSheet(page);
    page.handleStartUpdate();
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(page.data.installBytesText,'12.0 MB / 63.4 MB','光给百分比看不出还要多久');
    assert.equal(page.data.installPercent,19);

    delete wx.downloadFile;
    delete wx.miniapp;
});

// ---- 24 小时只弹一次 ----

function loadIndexPage(){
    let definition=null;
    global.Page=value=>{definition=value;};
    delete require.cache[require.resolve('../pages/index/index')];
    require('../pages/index/index');
    const page={...definition,data:structuredClone(definition.data),homeVisible:true};
    page.setData=patch=>Object.assign(page.data,patch);
    return page;
}

test('弹窗只要展示过，24 小时内就不再弹（点稍后 / 点更新没装成 / 按返回都算一次）',async()=>{
    storage.clear();
    settings.setHomeDisplay({autoUpdate:true});
    update.clearPrompt();

    const about=loadAboutPage();
    await openUpdateSheet(about);
    assert.equal(about.data.updateSheetOpen,true);
    assert.equal(update.isPromptCooling(),true,'弹窗展示的那一刻就记一次，不靠关闭动作');
    // 模拟「点了现在更新但没装成、然后按返回键退出」：既没 dismiss，弹窗也不是被正常关闭的
    assert.equal(update.isDismissed('1.2.0'),false);

    lastNavigation='';
    const home=loadIndexPage();
    home.checkUpdateOnStartup(true);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(lastNavigation,'','这一轮 24 小时额度已用完，不该再跳更新页');
});

test('24 小时到期才恢复提醒，中途换了版本也等冷却结束',async()=>{
    storage.clear();
    settings.setHomeDisplay({autoUpdate:true});
    configure('https://example.com/version');
    mockRelease({version:'1.3.0',notes:'更新',downloadUrl:'https://example.com/app.apk'});

    update.markPrompted('1.2.0',Date.now()-update.PROMPT_COOLDOWN+60000);
    assert.equal(update.isPromptCooling(),true,'还差一分钟到期，仍然安静');

    lastNavigation='';
    const home=loadIndexPage();
    home.checkUpdateOnStartup(true);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(lastNavigation,'','冷却没结束，新版本也先不弹');

    // 到期后恢复正常；记录里存的是旧版本号也照样放行
    update.markPrompted('1.2.0',Date.now()-update.PROMPT_COOLDOWN-1000);
    assert.equal(update.isPromptCooling(),false);
    const again=loadIndexPage();
    again.checkUpdateOnStartup(true);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(lastNavigation,'/pages/about/about?autoUpdate=1','过了 24 小时要能重新提醒');
});

test('自己再点一次「查看更新说明」不刷新 24 小时额度',async()=>{
    storage.clear();
    update.clearPrompt();
    const page=loadAboutPage();
    await openUpdateSheet(page);
    const promptedAt=update.readPrompt().at;

    page.handleCloseUpdate();
    page.handleCheckUpdate(); // 已知有新版本，走的是「直接打开说明」
    assert.equal(page.data.updateSheetOpen,true);
    assert.equal(update.readPrompt().at,promptedAt,'只是自己再翻一遍，不该把冷却续期');
});
