const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();let definition;
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),showToast(){},navigateBack(){}};
global.Page=value=>{definition=value;};global.getApp=()=>({globalData:{},markBodyChanged(){}});
const {formatDate}=require('../utils/record-store');
const today=formatDate(new Date());
const {buildHealthScore}=require('../utils/body-health');
const {indicators}=require('../utils/body-health');
const body=require('../utils/body-measurements');
const {buildBodyChart}=require('../utils/body-chart');
function current(bmi=23,ratio=.45,date=today){return {kg:{value:bmi*4,date},heightCm:{value:200,date:''},waistCm:{value:ratio*200,date}};}
function page(name){const file='../pages/'+name+'/'+name;delete require.cache[require.resolve(file)];require(file);return {...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch);}};}
function past(days){const date=new Date();date.setDate(date.getDate()-days);return formatDate(date);}
test('health mapping uses raw boundaries and min, never display rounding or unrelated inputs',()=>{
 for(const [bmi,score] of [[18.499,70],[18.5,100],[23.96,100],[24,70],[27.999,70],[28,40]])assert.equal(buildHealthScore(current(bmi),{age:30},today).value,score);
 for(const [ratio,score] of [[.4,100],[.4999,100],[.5,70],[.5999,70],[.6,40]])assert.equal(buildHealthScore(current(23,ratio),{age:30},today).value,score);
 assert.equal(buildHealthScore(current(28,.45),{age:30,records:999,water:99999},today).value,40);
});
test('four equal waist ratio scale bands align with eligibility and reference boundaries',()=>{
 for(const [ratio,position,tone] of [[.3,0,'metric-low'],[.4,25,'metric-normal'],[.5,50,'metric-high'],[.6,75,'metric-danger'],[.8,100,'metric-danger']]){
  const data=current(23,ratio),score=buildHealthScore(data,{age:30},today),indicator=indicators(data,score,today)[1];
  assert.ok(Math.abs(indicator.position-position)<1e-8);assert.equal(indicator.tone,tone);
 }
});
test('eligibility age, missing, date and range gates return null not zero; no seven day gate',()=>{
 for(const [age,ready] of [[17,false],[18,true],[64,true],[65,false]])assert.equal(buildHealthScore(current(),{age},today).ready,ready);
 for(const data of [current(35),current(23,.399),current(23,.45,''),current(23,.45,past(31))])assert.equal(buildHealthScore(data,{age:30},today).value,null);
 assert.equal(buildHealthScore(current(23,.45,past(30)),{age:30},today).ready,true);
 const data=current();data.kg.date=past(20);assert.equal(buildHealthScore(data,{age:30},today).ready,true);
 assert.equal(buildHealthScore(current(),{age:30,isPregnant:true},today).value,null);
 assert.equal(buildHealthScore(current(),{age:30,isAthlete:true},today).value,null);
 const missing=current();missing.waistCm.value=null;assert.equal(buildHealthScore(missing,{age:30},today).value,null);
});
test('saved plan profile syncs body/home/profile/reopened plan without adding or redating measurements',async()=>{
 storage.clear();storage.set('cal_profile',{age:30,height:170,weight:65,sex:'female',activity:'light'});
 storage.set('cal_body_measurements',[{date:past(2),ts:Date.now()-172800000,kg:65,waistCm:78}]);storage.set('cal_weight',[{date:past(2),ts:Date.now()-172800000,kg:65}]);
 const before=JSON.stringify(body.history());const plan=page('goal');plan.onLoad();plan.setData({weightText:'68'});plan.handleSave();
 assert.equal(body.current().kg.value,68);assert.equal(body.current().kg.date,'');assert.equal(JSON.stringify(body.history()),before);
 const bodyPage=page('weight');bodyPage.onShow();assert.equal(bodyPage.data.weightText,'68.0');assert.equal(bodyPage.data.healthScore.ready,false);assert.equal(bodyPage.openEditor,undefined);
 const home=page('index');await home.loadWeight();assert.equal(Number(home.data.weightValueText),68);
 const profile=page('profile');await profile.refresh();assert.equal(profile.data.weightRaw,68);
 const reopened=page('goal');reopened.onLoad();assert.equal(Number(reopened.data.weightText),68);reopened.handleSave();assert.equal(JSON.stringify(body.history()),before);
 await body.save({kg:67});assert.equal(body.current().kg.value,67);assert.equal(body.current().kg.date,today);
});
test('unchanged plan/activity retains measurement dates and weight units cannot change score',()=>{
 storage.clear();storage.set('cal_profile',{age:30,height:170,weight:65,sex:'female',activity:'light'});storage.set('cal_body_measurements',[{date:past(2),ts:Date.now()-172800000,kg:65,waistCm:78}]);
 const p=page('goal');p.onLoad();p.setData({selectedActivity:'moderate'});p.handleSave();assert.equal(body.current().kg.date,past(2));
 for(const unit of ['kg','jin','lb']){storage.set('cal_weight_unit',unit);const view=page('weight');view.onShow();assert.equal(view.data.healthScore.value,100);}
});
test('body chart never fabricates data, uses daily last records and separates missing days',()=>{
 const rows=[{date:'2026-11-01',ts:1,kg:65},{date:'2026-11-01',ts:2,kg:64},{date:'2026-11-03',ts:3,kg:63},{date:'2026-11-02',ts:4,waistCm:78}];
 storage.clear();const chart=buildBodyChart(rows,'kg',30,'2026-11-03');assert.equal(chart.points.length,2);assert.equal(chart.points[0].text,'64.0');assert.equal(chart.segments.length,0);assert.equal(chart.changeText,'-1.0');
 const waist=buildBodyChart(rows,'waistCm',30,'2026-11-03');assert.equal(waist.points.length,1);assert.equal(waist.hasLine,false);assert.equal(buildBodyChart([],'kg',0,'2026-11-03').hasData,false);
 const consecutive=buildBodyChart([{date:'2026-11-02',ts:1,kg:64},{date:'2026-11-03',ts:2,kg:63}],'kg',30,'2026-11-03');
 const [a,b]=consecutive.points,segment=consecutive.segments[0],radians=segment.angle*Math.PI/180;
 assert.ok(Math.abs(a.x+segment.width*Math.cos(radians)-b.x)<1e-8);
 assert.ok(Math.abs(a.y+segment.width*Math.sin(radians)*600/180-b.y)<1e-8);
});

test('imperial plan saves and unit round trips preserve untouched measured values and dates',()=>{
 for(const unit of ['kg','jin','lb']){
  storage.clear();storage.set('cal_weight_unit',unit);
  const original={age:30,height:170,weight:65.1,sex:'female',activity:'light'};
  storage.set('cal_profile',original);storage.set('cal_body_measurements',[{date:past(2),ts:Date.now()-172800000,kg:65.1,heightCm:170,waistCm:78}]);
  const history=JSON.stringify(body.history()),p=page('goal');p.onLoad();
  p.setData({selectedActivity:'moderate'});p.handleSave();
  assert.equal(storage.get('cal_profile').height,170);assert.equal(storage.get('cal_profile').weight,65.1);
  p.handleUnitMode({currentTarget:{dataset:{mode:p.data.unitMode==='imperial'?'metric':'imperial'}}});
  p.handleUnitMode({currentTarget:{dataset:{mode:p.data.unitMode==='imperial'?'metric':'imperial'}}});p.handleSave();
  assert.equal(storage.get('cal_profile').height,170);assert.equal(storage.get('cal_profile').weight,65.1);
  assert.equal(body.current().heightCm.date,past(2));assert.equal(body.current().kg.date,past(2));assert.equal(JSON.stringify(body.history()),history);
  p.setData({weightText:String(Number(p.data.weightText)+2)});p.handleSave();assert.notEqual(storage.get('cal_profile').weight,65.1);
 }
});
test('partial plan save failure rolls back profile and targets without changing history',()=>{
 storage.clear();storage.set('cal_profile',{age:30,height:170,weight:65,sex:'female'});storage.set('cal_goal',1800);storage.set('cal_water_goal',1500);storage.set('cal_macro_targets',{protein:100,carb:200,fat:60});
 const before=structuredClone(Array.from(storage.entries()));const p=page('goal');p.onLoad();p.setData({weightText:'68'});
 const original=wx.setStorageSync;let failed=false;wx.setStorageSync=(key,value)=>{if(key==='cal_macro_targets' && !failed){failed=true;throw Error('quota');}return original(key,value);};
 try{p.handleSave();}finally{wx.setStorageSync=original;}
 assert.match(p.data.error,/保存失败/);assert.deepEqual(Array.from(storage.entries()),before);assert.equal(storage.has('cal_weight'),false);
});

test('week month year and custom chart periods use inclusive boundaries and preserve missing days',()=>{
 const rows=[{date:'2025-11-03',ts:1,kg:66},{date:'2025-11-04',ts:2,kg:65},{date:'2026-10-05',ts:3,kg:64},{date:'2026-10-27',ts:4,kg:63},{date:'2026-10-28',ts:5,kg:62},{date:'2026-11-03',ts:6,kg:61}];
 const week=buildBodyChart(rows,'kg',7,'2026-11-03');assert.equal(week.startDate,'2026-10-28');assert.equal(week.points.length,2);
 assert.equal(buildBodyChart(rows,'kg',30,'2026-11-03').points.length,4);
 const year=buildBodyChart(rows,'kg',365,'2026-11-03');assert.equal(year.startDate,'2025-11-04');assert.equal(year.points.length,5);
 const custom=buildBodyChart(rows,'kg',30,'2026-11-03',{start:'2026-10-27',end:'2026-10-28'});assert.equal(custom.points.length,2);assert.equal(custom.segments.length,1);assert.equal(custom.endDate,'2026-10-28');
 const same=buildBodyChart(rows,'kg',30,'2026-11-03',{start:'2026-10-28',end:'2026-10-28'});assert.equal(same.points[0].x,50);assert.equal(same.hasLine,false);
 const leap=buildBodyChart([{date:'2024-02-29',ts:1,kg:60}],'kg',30,'2026-11-03',{start:'2024-02-29',end:'2024-02-29'});assert.equal(leap.points.length,1);
 for(const range of [{start:'2026-02-30',end:'2026-03-01'},{start:'2026-11-03',end:'2026-11-02'},{start:'2026-11-03',end:'2026-11-04'}])assert.throws(()=>buildBodyChart(rows,'kg',30,'2026-11-03',range),RangeError);
});
test('custom range stays applied when changing metric; invalid drafts keep previous graph',()=>{
 storage.clear();const p=page('weight');p.onShow();p.handleBodyRange({currentTarget:{dataset:{range:'week'}}});assert.equal(p.data.bodyChart.days,7);
 p.handleBodyRange({currentTarget:{dataset:{range:'custom'}}});p.handleCustomDate({currentTarget:{dataset:{field:'customStart'}},detail:{value:past(10)}});p.handleCustomDate({currentTarget:{dataset:{field:'customEnd'}},detail:{value:past(2)}});p.applyCustomRange();assert.equal(p.data.bodyRange,'custom');assert.equal(p.data.bodyChart.endDate,past(2));
 p.handleBodyMetric({currentTarget:{dataset:{metric:'waistCm'}}});assert.equal(p.data.bodyChart.endDate,past(2));
 const old=structuredClone(p.data.bodyChart);p.setData({customStart:today,customEnd:past(1)});p.applyCustomRange();assert.ok(p.data.rangeError);assert.deepEqual(p.data.bodyChart,old);
 p.handleBodyRange({currentTarget:{dataset:{range:'year'}}});assert.equal(p.data.bodyChart.days,365);assert.equal(p.data.appliedRange,null);
});
