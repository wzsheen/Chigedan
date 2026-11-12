const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCalendar, daySummary } = require('../utils/trend-calendar');
const storage = new Map();
let definition;
global.Page = page => { definition = page; };
global.wx = { getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),showToast(){},navigateBack(){},pageScrollTo(){} };
function page(name) {
    const file='../pages/'+name+'/'+name+'.js';delete require.cache[require.resolve(file)];require(file);
    return Object.assign({},definition,{data:structuredClone(definition.data),setData(patch,callback){Object.assign(this.data,patch);if(callback)callback();}});
}

test('calendar respects leap months, meal coverage and future dates; day totals stay separate',()=>{
    const rows=[{date:'2024-02-28',meal:'snack',name:'苹果',kcal:50},{date:'2024-02-29',meal:'breakfast',kcal:200},{date:'2024-02-29',meal:'lunch',kcal:300},{date:'2024-02-29',meal:'dinner',kcal:400}];
    const cal=buildCalendar(2024,1,rows,'2024-02-29','2024-02-29');
    assert.equal(cal.cells.filter(cell=>!cell.blank).length,29);
    assert.equal(cal.cells.find(cell=>cell.day===28).tone,'some');
    assert.equal(cal.cells.find(cell=>cell.day===29).tone,'three');
    assert.equal(cal.canNext,false);
    assert.equal(cal.cells.find(cell=>cell.day===29).selected,true);
    const day=daySummary('2024-02-28',rows,[{date:'2024-02-28',ml:250},{date:'2024-02-29',ml:500}]);
    assert.equal(day.kcal,50);assert.equal(day.water,250);assert.equal(day.meals[0].recorded,false);assert.equal(day.meals[3].recorded,true);
    assert.equal(buildCalendar(2024,2,[],'2024-03-02','2024-03-02').cells.find(cell=>cell.day===3).future,true);
});

test('plan recalculates drafts without saving and validates all fields before unified save',()=>{
    storage.clear();const p=page('goal');p.onLoad();
    p.handleAge({detail:{value:'28'}});p.handleHeight({detail:{value:'170'}});p.handleWeight({detail:{value:'60'}});
    assert.ok(p.data.result);const old=p.data.result.kcalText;
    p.handleGoalType({currentTarget:{dataset:{key:'keep'}}});assert.ok(Number(p.data.result.kcalText)>Number(old));
    assert.equal(storage.has('cal_goal'),false);p.handleWaterInput({detail:{value:'200'}});p.handleSave();
    assert.equal(storage.has('cal_profile'),false);assert.match(p.data.error,/饮水/);
    p.handleWaterInput({detail:{value:'2000'}});p.handleAge({detail:{value:''}});p.handleSave();assert.equal(storage.has('cal_profile'),false);
    p.handleAge({detail:{value:'28'}});p.handleSave();
    assert.equal(storage.get('cal_water_goal'),2000);assert.equal(storage.get('cal_profile').age,28);assert.equal(storage.get('cal_goal'),Number(p.data.result.kcalText));assert.ok(storage.get('cal_macro_targets').protein>0);
});

test('plan keypad edits each draft, enforces decimal rules and does not save',()=>{
    storage.clear();const p=page('goal');p.onLoad();
    const open=field=>p.openKeypad({currentTarget:{dataset:{field}}});
    const key=value=>p.handleKeypadKey({currentTarget:{dataset:{key:value}}});
    open('ageText');key('2');key('8');key('.');assert.equal(p.data.ageText,'28');
    p.nextKeypadField();assert.equal(p.data.keypadField,'heightText');key('1');key('7');key('0');key('.');key('5');assert.equal(p.data.heightText,'170.5');
    p.nextKeypadField();key('6');key('0');key('.');key('5');key('back');assert.equal(p.data.weightText,'60.');
    p.nextKeypadField();key('2');key('0');key('0');key('0');key('.');assert.equal(p.data.waterGoalText,'2000');
    p.nextKeypadField();assert.equal(p.data.keypadField,'');assert.equal(storage.has('cal_goal'),false);
});

test('knowledge deep links, readable steps, quizzes and explicit read progress remain coherent',()=>{
    storage.clear();const p=page('knowledge');p.onLoad({id:'portion'});
    assert.equal(p.data.article.id,'portion');assert.equal(p.data.article.steps.length,3);assert.equal(p.data.readCount,0);
    p.handleQuiz({currentTarget:{dataset:{index:1}}});assert.equal(p.data.quizRevealed,true);
    assert.equal(p.data.quizIndex,p.data.article.quiz[2]);
    p.handleReveal();assert.equal(p.data.quizRevealed,false);
    p.handleQuiz({currentTarget:{dataset:{index:0}}});assert.equal(p.data.quizRevealed,true);
    assert.notEqual(p.data.quizIndex,p.data.article.quiz[2]);
    p.handleQuiz({currentTarget:{dataset:{index:99}}});assert.equal(p.data.quizIndex,0);
    p.handleRead();p.handleRead();assert.equal(p.data.readCount,1);assert.equal(storage.get('cal_knowledge_read').length,1);
    p.handleCloseArticle();p.handleSearch({detail:{value:'营养成分表'}});assert.equal(p.data.articles.length,1);
    p.openArticle('labels');assert.equal(p.data.quizIndex,-1);assert.equal(p.data.quizRevealed,false);assert.equal(p.data.showSources,false);assert.ok(p.data.article.references.length);
});

test('plan activity picker and local unit switching preserve the underlying profile and preferences',()=>{
    storage.clear();storage.set('cal_weight_unit','kg');
    const p=page('goal');p.onLoad();p.setData({ageText:'28',heightText:'170',weightText:'60',selectedGoal:'keep'});p.refreshPreview();
    const before=Number(p.data.result.kcalText);
    p.handleUnitMode({currentTarget:{dataset:{mode:'imperial'}}});
    assert.equal(p.data.weightUnit,'lb');assert.equal(p.data.heightUnit,'in');
    assert.ok(Math.abs(p.inputHeightCm()-170)<.03);assert.ok(Math.abs(p.inputWeightKg()-60)<.01);
    assert.ok(Math.abs(Number(p.data.result.kcalText)-before)<=1);assert.equal(storage.get('cal_weight_unit'),'kg');
    p.handleActivity({currentTarget:{dataset:{}},detail:{value:'2'}});
    assert.equal(p.data.selectedActivity,'moderate');assert.equal(p.data.activityIndex,2);
    p.handleUnitMode({currentTarget:{dataset:{mode:'metric'}}});assert.equal(p.data.heightText,'170');assert.equal(p.data.weightText,'60');
    assert.equal(storage.has('cal_profile'),false);
});

test('each knowledge article owns a distinct topic illustration used by both its list and detail',()=>{
    const fs=require('node:fs');const path=require('node:path');storage.clear();const p=page('knowledge');p.onLoad();
    const covers=new Set();const contents=new Set();
    for(const article of p.data.articles){
        assert.ok(!covers.has(article.cover));covers.add(article.cover);
        const svg=fs.readFileSync(path.join(__dirname,'..',article.cover),'utf8');
        assert.ok(svg.includes('<svg'));assert.ok(!/https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg','')));contents.add(svg);
        p.openArticle(article.id);assert.equal(p.data.article.cover,article.cover);
    }
    assert.equal(contents.size,p.data.articles.length);
});

test('trend date selection anchors charts and never connects through missing dates',()=>{
    storage.clear();const p=page('analysis');p.setData({selectedDate:'2026-10-30'});
    p.records=[{date:'2026-10-28',name:'鸡蛋',meal:'breakfast',kcal:100,protein:6,carb:1,fat:5},{date:'2026-10-30',name:'燕麦',meal:'breakfast',kcal:200,protein:5,carb:30,fat:3}];
    p.weights=[];p.waterEntries=[{date:'2026-10-30',ml:2000},{date:'2026-10-31',ml:2000}];
    const trend=p.buildTrend(p.records,7,2000);
    assert.equal(trend.points[6].key,'2026-10-30');assert.equal(trend.recordedDays,2);assert.equal(trend.segments.length,0);
    p.renderAnalysis(7);assert.equal(p.data.overview.average,'150');assert.equal(p.data.overview.waterDays,1);assert.equal(p.data.overview.distinct,2);
    p.calendarYear=2026;p.calendarMonth=9;p.updateCalendar();p.handleDay({currentTarget:{dataset:{date:'2026-10-28'}}});
    assert.equal(p.data.day.kcal,100);assert.equal(p.data.trend.points[6].key,'2026-10-28');assert.equal(p.data.overview.average,'100');
});

test('trend opens the shared editor and refreshes today after a measurement',()=>{
 storage.clear();const p=page('analysis');let refreshed=0;p.load=()=>{refreshed++;};p.data.selectedDate='2026-10-01';p.handleOpenWeight();assert.equal(p.data.weightEditorOpen,true);p.closeWeightEditor();assert.equal(storage.has('cal_weight'),false);p.handleBodySaved();assert.equal(p.data.weightEditorOpen,false);assert.equal(refreshed,1);assert.equal(p.data.selectedDate,require('../utils/record-store').formatDate(new Date()));
});

test('the existing body chart switches to recorded waist or hip values without inventing weight measurements',()=>{
 storage.clear();const p=page('analysis');p.data.selectedDate='2026-11-01';p.records=[];p.weights=[];p.waterEntries=[];p.bodyMeasurements=[{date:'2026-10-30',ts:1,waistCm:82},{date:'2026-11-01',ts:2,waistCm:80,hipCm:96}];
 p.handleBodyMetric({currentTarget:{dataset:{key:'waistCm'}}});assert.equal(p.data.weightGraph.points.length,2);assert.equal(p.data.bodyTrendSummary,'82.0 → 80.0 cm');assert.equal(p.data.bodyTrendChange,'-2 cm');p.handleOpenWeight();assert.equal(p.data.bodyEditorMode,'change','「记变化」固定打开体重/腰围/臀围三项，不跟当前 Tab 走');
 p.handleBodyMetric({currentTarget:{dataset:{key:'kg'}}});assert.equal(p.data.weightGraph.points.length,0);assert.equal(p.data.bodyTrendSummary,'');
});
