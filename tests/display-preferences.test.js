const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();
let definition;
const navigations=[];
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),showToast(){},navigateTo:arg=>navigations.push(arg.url)};
global.getApp=()=>({globalData:{}});
global.Page=value=>{definition=value;};
const settings=require('../utils/settings');
function page(name){const file='../pages/'+name+'/'+name;delete require.cache[require.resolve(file)];require(file);return {...definition,data:structuredClone(definition.data),setData(patch,callback){Object.assign(this.data,patch);if(callback)callback();}};}

test('water shortcuts validate complete distinct amounts and never leak mutable defaults',()=>{
    storage.clear();const defaults=settings.getWaterShortcuts();defaults[0]=999;
    assert.deepEqual(settings.getWaterShortcuts(),[100,250,500]);
    for(const invalid of [[100,100,500],[0,250,500],[100,250,5001],[100,250.5,500],[100,250],['100',250,500]])assert.equal(settings.setWaterShortcuts(invalid),false);
    const valid=[120,300,700];assert.equal(settings.setWaterShortcuts(valid),true);valid[0]=999;
    assert.deepEqual(settings.getWaterShortcuts(),[120,300,700]);
    storage.set('cal_water_shortcuts',[1,2]);assert.deepEqual(settings.getWaterShortcuts(),[100,250,500]);
});

test('preference changes persist on valid blur and invalid partial edits keep the saved shortcut list',()=>{
    storage.clear();const p=page('prefs');p.onShow();
    p.handleQuickInput({currentTarget:{dataset:{index:0}},detail:{value:'150'}});assert.equal(p.commitQuick(),true);
    assert.deepEqual(settings.getWaterShortcuts(),[150,250,500]);
    p.handleQuickInput({currentTarget:{dataset:{index:1}},detail:{value:''}});assert.equal(p.commitQuick(),false);assert.ok(p.data.quickError);
    assert.deepEqual(settings.getWaterShortcuts(),[150,250,500]);
    p.handleQuickRestore();assert.deepEqual(settings.getWaterShortcuts(),[100,250,500]);assert.equal(p.data.quickError,'');
    p.handleDisplay({currentTarget:{dataset:{key:'scienceAutoplay'}},detail:{value:false}});
    assert.deepEqual(settings.getHomeDisplay(),{mascotAnimation:true,scienceAutoplay:false,autoUpdate:true});
    p.handleDisplay({currentTarget:{dataset:{key:'mascotAnimation'}},detail:{value:false}});
    p.handleDisplay({currentTarget:{dataset:{key:'autoUpdate'}},detail:{value:true}});
    const reopened=page('prefs');reopened.onShow();assert.deepEqual(reopened.data.homeDisplay,{mascotAnimation:false,scienceAutoplay:false,autoUpdate:true});
});

test('disabled home animation creates no clocks or reminder timers; science touch release respects its switch',async t=>{
    storage.clear();settings.setHomeDisplay({mascotAnimation:false,scienceAutoplay:false,autoUpdate:false});settings.setWaterShortcuts([120,300,700]);
    let clocks=0,timers=0;t.mock.method(global,'setInterval',()=>{clocks++;return 1;});t.mock.method(global,'setTimeout',()=>{timers++;return 2;});
    const home=page('index');home.refresh=()=>Promise.resolve();home.onShow();await Promise.resolve();
    assert.equal(clocks,0);assert.equal(home.data.mascotAnimation,false);assert.deepEqual(home.data.waterShortcuts,[120,300,700]);
    home.playMascot('water');home.updateMascot();assert.equal(timers,0);assert.equal(home.data.mascotState,'idle');
    home.pauseScience();home.resumeScience();assert.equal(home.data.scienceAutoplay,false);
    await home.handleWaterAdd({currentTarget:{dataset:{ml:700}}});assert.equal(storage.get('cal_water')[0].ml,700);assert.equal(timers,0);
    home.onHide();settings.setHomeDisplay({mascotAnimation:true,scienceAutoplay:true});home.onShow();await Promise.resolve();
    assert.equal(clocks,1);assert.equal(home.data.scienceAutoplay,true);home.onUnload();
});

test('profile classification preserves every target and rejects unknown menu keys',()=>{
    navigations.length=0;const p=page('profile');
    assert.equal(p.data.menuGroups.length,3);assert.equal(p.data.menuGroups[0].title,'健康管理');assert.equal(p.data.menuGroups[0].items.length,4);let total=0;
    for(const group of p.data.menuGroups)for(const item of group.items){p.handleMenu({currentTarget:{dataset:{key:item.key}}});assert.equal(navigations.at(-1),item.route);total++;}
    assert.equal(total,8);p.handleMenu({currentTarget:{dataset:{key:'unknown'}}});assert.equal(navigations.length,8);
});

test('theme choice applies immediately, persists across pages, and preserves records and other preferences',()=>{
    storage.clear();storage.set('cal_records',[{id:'keep',kcal:200}]);settings.setWaterShortcuts([120,300,700]);
    const prefs=page('prefs');prefs.onShow();assert.equal(prefs.data.uiTheme,'light');
    prefs.handleTheme({currentTarget:{dataset:{key:'simple'}}});assert.equal(prefs.data.uiThemeClass,'ui-theme-simple');
    const home=page('index');home.onLoad();assert.equal(home.data.uiTheme,'simple');
    const profile=page('profile');profile.onLoad();assert.equal(profile.data.uiTheme,'simple');
    prefs.handleTheme({currentTarget:{dataset:{key:'light'}}});profile.onLoad();assert.equal(profile.data.uiThemeClass,'ui-theme-light');
    assert.deepEqual(storage.get('cal_records'),[{id:'keep',kcal:200}]);assert.deepEqual(settings.getWaterShortcuts(),[120,300,700]);
    settings.setTheme('invalid');assert.equal(settings.getTheme(),'light');
});

test('theme lifecycle wrapper refreshes on return and forwards original arguments and async results',async()=>{
    storage.clear();const {withTheme}=require('../utils/theme');const seen=[];
    const def=withTheme({data:{value:7},onLoad(options){seen.push(options.id);return this.data.value;},onShow(){seen.push('show');return Promise.resolve('kept');}});
    const instance={...def,data:structuredClone(def.data),setData(patch){Object.assign(this.data,patch);}};
    assert.equal(instance.onLoad({id:'abc'}),7);assert.equal(instance.data.uiTheme,'light');
    settings.setTheme('simple');assert.equal(await instance.onShow(),'kept');assert.equal(instance.data.uiThemeClass,'ui-theme-simple');assert.deepEqual(seen,['abc','show']);
});
