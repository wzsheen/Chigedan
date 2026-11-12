const test=require('node:test');
const assert=require('node:assert/strict');
function setup(t,redirect,cold=false){
    let definition,now=1000,seq=0;
    const timers=new Map();
    t.mock.method(require('../utils/launch-schedule'),'shouldPlayBirthdayVideo',()=>false);
    t.mock.method(Date,'now',()=>now);
    t.mock.method(global,'setTimeout',(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;});
    t.mock.method(global,'clearTimeout',id=>timers.delete(id));
    const oldPage=global.Page,oldWx=global.wx;
    global.Page=value=>{definition=value;};global.wx={redirectTo:redirect};
    t.after(()=>{global.Page=oldPage;global.wx=oldWx;});
    const file='../pages/welcome/welcome';delete require.cache[require.resolve(file)];require(file);
    const page={...definition,data:structuredClone(definition.data)};
    page.setData=patch=>Object.assign(page.data,patch);
    page.onLoad();
    if(!cold)for(const asset of ['logo','slogan'])page.handleAssetReady({currentTarget:{dataset:{asset}}});
    return {page,timers,advance(ms){now+=ms;},fire(){const id=page.timer,entry=timers.get(id);timers.delete(id);entry.fn();}};
}
test('welcome advances to home once and replaces its navigation entry',t=>{
    const calls=[];const {page,timers,fire}=setup(t,request=>calls.push(request));
    page.onShow();assert.equal(timers.get(page.timer).ms,1000);
    page.onShow();assert.equal(timers.size,1);
    fire();page.enterHome();
    assert.equal(calls.length,1);assert.equal(calls[0].url,'/pages/index/index');
    page.onUnload();assert.equal(timers.size,0);
});
test('welcome pauses in background and cannot redirect after unload',t=>{
    const calls=[];const {page,timers,advance,fire}=setup(t,request=>calls.push(request));
    page.onShow();advance(400);page.onHide();
    assert.equal(timers.size,0);assert.equal(page.remaining,600);
    page.enterHome();assert.equal(calls.length,0);
    advance(10000);page.onShow();assert.equal(timers.get(page.timer).ms,600);
    const delayed=timers.get(page.timer).fn;
    page.onUnload();assert.equal(timers.size,0);
    delayed();assert.equal(calls.length,0);
});
test('welcome offers an explicit retry after navigation failure',t=>{
    const calls=[];const {page,fire}=setup(t,request=>calls.push(request));
    page.onShow();fire();calls[0].fail();
    assert.equal(page.data.navigationError,true);assert.equal(page.redirecting,false);
    page.enterHome();assert.equal(calls.length,2);assert.equal(page.data.navigationError,false);
    page.enterHome();assert.equal(calls.length,2);
    page.onUnload();calls[1].fail();assert.equal(page.data.navigationError,false);
});

 test('cold startup waits for both images, then shows a full second and ignores duplicate load events',t=>{
    const calls=[];const {page,timers,fire}=setup(t,request=>calls.push(request),true);
    page.onShow();assert.equal(timers.get(page.timer).ms,4000);
    page.handleAssetReady({currentTarget:{dataset:{asset:'logo'}}});assert.equal(timers.get(page.timer).ms,4000);
    page.handleAssetReady({currentTarget:{dataset:{asset:'slogan'}}});assert.equal(timers.size,1);assert.equal(timers.get(page.timer).ms,1000);
    const timer=page.timer;page.handleAssetReady({currentTarget:{dataset:{asset:'slogan'}}});assert.equal(page.timer,timer);
    fire();assert.equal(calls.length,1);page.onUnload();
 });

test('welcome stays light after system changes without overwriting the saved dark preference',t=>{
 const {page}=setup(t,()=>{});const native=[];wx.getStorageSync=key=>key==='cal_theme'?'dark':undefined;wx.setNavigationBarColor=value=>native.push(value);wx.setStorageSync=()=>assert.fail('welcome must not change preferences');
 page.__navTheme=null;require('../utils/theme').apply(page);assert.equal(page.data.uiResolvedTheme,'light');assert.equal(page.data.uiThemeClass,'ui-theme-light');assert.equal(native.at(-1).frontColor,'#000000');assert.equal(require('../utils/settings').getTheme(),'dark');
 page.onUnload();
});

test('birthday launch routes to video once and falls back to home when unavailable',t=>{
 const calls=[];const {page}=setup(t,request=>calls.push(request));t.mock.method(require('../utils/launch-schedule'),'shouldPlayBirthdayVideo',()=>true);page.onLoad();page.onShow();assert.equal(calls[0].url,'/launch-video/player/index');page.onShow();assert.equal(calls.length,1);calls[0].fail();assert.equal(calls[1].url,'/pages/index/index');page.onUnload();
});
