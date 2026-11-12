const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();let definition;
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value)};
global.Page=page=>{definition=page;};
wx.getWindowInfo=()=>({windowWidth:375,windowHeight:700});
const settings=require('../utils/settings');
require('../pages/index/index');
function page(){return {...definition,data:structuredClone(definition.data),createSelectorQuery(){return {select(){return this;},boundingClientRect(callback){callback({left:20,top:110,right:210,bottom:220,width:190,height:110});return this;},exec(){}};},setData(patch){Object.assign(this.data,patch);}};}
const profile={sex:'female',age:30,height:170,weight:65};
test('first use requires saved goal and complete profile, never treats defaults or draft as setup',()=>{
 storage.clear();assert.equal(settings.getGoal(),2000);assert.equal(settings.needsPlanGuide(),true);
 settings.setProfile(profile);assert.equal(settings.needsPlanGuide(),true);
 settings.setGoal(1800);assert.equal(settings.needsPlanGuide(),false);
 settings.setProfile({...profile,height:''});assert.equal(settings.needsPlanGuide(),true);
});
test('skip persists without changing profile or goal; storage failures keep the guide retryable',()=>{
 storage.clear();const p=page();p.refreshPlanGuide();assert.equal(p.data.planGuideOpen,true);
 p.handlePlanGuideSkip();assert.equal(p.data.planGuideOpen,false);assert.equal(settings.needsPlanGuide(),false);
 assert.equal(storage.has('cal_goal'),false);assert.equal(storage.has('cal_profile'),false);
 storage.clear();p.refreshPlanGuide();const original=wx.setStorageSync;wx.setStorageSync=()=>{throw Error('full');};
 try{p.handlePlanGuideSkip();assert.equal(p.data.planGuideOpen,true);assert.ok(p.data.planGuideError);}finally{wx.setStorageSync=original;}
});
test('three measured entrance steps scroll to water and never write until explicitly finished',()=>{
 storage.clear();wx.getWindowInfo=()=>({windowWidth:375,windowHeight:700});
 const p=page();p.homeVisible=true;
 const goal={left:20,top:110,right:210,bottom:220,width:190,height:110};
 const fab={left:300,top:540,right:360,bottom:600,width:60,height:60};
 let selected; p.createSelectorQuery=()=>({select(selector){selected=selector;return this;},boundingClientRect(callback){callback(selected==='.energy-copy'?goal:{left:50,top:400,right:200,bottom:430,width:150,height:30});return this;},exec(){}});
 const oldScroll=wx.pageScrollTo;let scrollTarget;wx.pageScrollTo=options=>{scrollTarget=options.selector;options.complete();};
 p.selectComponent=selector=>{assert.equal(selector,'#home-dock');return {measureAddTarget:callback=>callback(fab)};};
 p.refreshPlanGuide();assert.equal(p.data.planGuideOpen,true);assert.equal(p.data.planGuideStep,0);assert.match(p.data.planGuideSpotStyle,/left:15px/);
 assert.equal(storage.size,0);p.handlePlanGuideNext();assert.equal(p.data.planGuideStep,1);assert.match(p.data.planGuideSpotStyle,/left:295px/);assert.equal(storage.size,0);
 p.handlePlanGuideNext();assert.equal(scrollTarget,'.water-card');assert.equal(selected,'.water-amount');assert.equal(p.data.planGuideStep,2);assert.equal(storage.size,0);
 p.handlePlanGuideNext();assert.equal(p.data.planGuideOpen,false);assert.equal(settings.needsPlanGuide(),false);assert.equal(storage.has('cal_profile'),false);assert.equal(storage.has('cal_goal'),false);assert.equal(storage.has('cal_water_goal'),false);wx.pageScrollTo=oldScroll;
});
test('late target measurement cannot reopen a skipped or hidden tour',()=>{
 storage.clear();const p=page();p.homeVisible=true;let callback;
 p.createSelectorQuery=()=>({select(){return this;},boundingClientRect(fn){callback=fn;return this;},exec(){}});
 p.showPlanGuideStep(0);p.handlePlanGuideSkip();callback({left:0,top:0,right:50,bottom:50,width:50,height:50});assert.equal(p.data.planGuideOpen,false);
 storage.clear();p.showPlanGuideStep(0);p.homeVisible=false;callback({left:0,top:0,right:50,bottom:50,width:50,height:50});assert.equal(p.data.planGuideOpen,false);
});
test('late water scroll cannot reopen a skipped tour',()=>{
 storage.clear();const p=page();p.homeVisible=true;let complete;const old=wx.pageScrollTo;
 wx.pageScrollTo=options=>{complete=options.complete;};
 try {p.showPlanGuideStep(2);p.handlePlanGuideSkip();complete();assert.equal(p.data.planGuideOpen,false);} finally {wx.pageScrollTo=old;}
});
