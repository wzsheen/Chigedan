const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let pageDefinition;
let componentDefinition;
const app = { globalData: {} };
const storage = new Map();
const listeners = {};
const manager = {
    onStart(fn) { listeners.start = fn; }, onStop(fn) { listeners.stop = fn; }, onError(fn) { listeners.error = fn; },
    start() { queueMicrotask(() => listeners.start()); },
    stop() { queueMicrotask(() => listeners.stop({ tempFilePath: '/record.mp3', duration: 2100 })); },
};
global.getApp = () => app;
global.Page = definition => { pageDefinition = definition; };
global.Component = definition => { componentDefinition = definition; };
global.wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    getSetting: opts => opts.success({ authSetting: { 'scope.record': true } }),
    getRecorderManager: () => manager,
    getFileSystemManager: () => ({ saveFile: opts => opts.success({ savedFilePath: '/saved.mp3' }) }),
    showToast() {}, navigateTo() {}, redirectTo() {}, navigateBack() {},
};
function page(name) {
    const filename = path.join(root, 'pages', name, name + '.js');
    delete require.cache[require.resolve(filename)]; require(filename);
    const instance = Object.assign({}, pageDefinition, { data: structuredClone(pageDefinition.data) });
    instance.setData = function(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); };
    return instance;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('category browsing keeps additions first, learns selection order and saves adjusted meal template totals', () => {
    const p = page('add');
    const event = dataset => ({ currentTarget: { dataset } });
    p.handleCatalogCategory(event({ category: '快餐' }));
    assert.equal(p.data.catalogColumns[0].top.name, '新增');
    const index = p.data.catalogRows.findIndex(row => row.name === '一荤两素');
    p.handleCatalogTile(event({ index }));
    const original = p.data.portionPreview.totals[0];
    p.handlePortionPart(Object.assign(event({ index: 0 }), { detail: { value: '80' } }));
    assert.equal(p.data.portionPreview.grams, 320);
    assert.ok(Math.abs(p.data.portionPreview.totals[0] - (original - 104)) < 1e-8);
    p.handlePortionAction();
    assert.equal(p.data.items[0].qty, 320);
    p.showCatalog('快餐');
    assert.equal(p.data.catalogRows[0].name, '一荤两素');
    storage.delete('cal_food_selections');
});

test('custom food keeps category, weight and unknown macros after saving to the library', async () => {
    const p = page('add');
    p.showCatalog('水果');
    p.handleCatalogTile({ currentTarget: { dataset: { add: true } } });
    p.setData({ formName: '自制水果拼盘', formQty: '1', formKcal: '100', formGramsPerUnit: '150', formCarb: '25' });
    p.handleCatalogSave();
    await tick();
    const index = p.data.catalogRows.findIndex(row => row.name === '自制水果拼盘');
    assert.ok(index >= 0);
    p.handleCatalogTile({ currentTarget: { dataset: { index } } });
    assert.equal(p.data.portionPreview.grams, 150);
    assert.equal(p.data.portionPreview.protein, '—');
    assert.equal(p.data.portionPreview.carb, '25');
    assert.equal(p.data.items.length, 0);
    storage.delete('cal_foods');
    storage.delete('cal_food_selections');
});

test('portion picker scales the chosen food and opens the existing keypad for an unmatched name', () => {
    const add = page('add');
    add.handlePortionSearch({ detail: { value: '米饭' } });
    const index = add.data.portionMatches.findIndex(row => ['米饭', '熟白米饭'].includes(row.name));
    assert.ok(index >= 0);
    add.handlePortionPick({ currentTarget: { dataset: { index } } });
    assert.deepEqual(add.data.portionFood.presets.map(row => row.grams), [150, 200, 250]);
    add.handlePortionWeight({ currentTarget: { dataset: {} }, detail: { value: 250 } });
    add.handlePortionAction();
    assert.equal(add.data.items[0].qty, 250);
    assert.equal(add.data.items[0].kcal, 325);
    assert.equal(add.data.items[0].unit, '克');
    add.handlePortionSearch({ detail: { value: '自制饭团xyz' } });
    add.handlePortionAction();
    assert.equal(add.data.manualOpen, true);
    assert.equal(add.data.formName, '自制饭团xyz');
    assert.equal(add.data.formKcal, '');
    assert.equal(add.data.items.length, 1);
});

test('food dropdown filters typed keywords and fills the form before explicit addition',()=>{
    const p=page('add');
    p.handleFoodFocus();
    assert.equal(p.data.foodMenuOpen,true);
    assert.ok(p.data.foodMenu.length>0);
    p.handleNameInput({detail:{value:'燕麦'}});
    assert.equal(p.data.foodMenuOpen,true);
    assert.equal(p.data.formName,'燕麦');
    const choice=p.data.foodMenu.find(row=>row.name==='燕麦粥');
    assert.ok(choice);
    assert.ok(p.data.foodMenu.every(row=>row.name.includes('燕麦')));
    assert.equal(p.data.items.length,0);
    p.handlePickFood({currentTarget:{dataset:choice}});
    assert.equal(p.data.formName,'燕麦粥');
    assert.equal(p.data.foodMenuOpen,false);
    assert.equal(p.data.items.length,0);
    p.handleAddItem();
    assert.equal(p.data.items.length,1);
    assert.equal(p.data.items[0].name,'燕麦粥');
    p.handleNameInput({detail:{value:'蛋'}});
    assert.ok(p.data.foodMenu.some(row=>row.name==='鸡蛋'));
    p.handleNameInput({detail:{value:'不存在的食品xyz'}});
    assert.equal(p.data.foodMenu.length,0);
});

test('diet presentation preserves empty, unknown, balanced and adjustment states', () => {
    const {buildState}=require('../utils/diet-state');
    const baseline={count:1,total:1200,goal:1800,protein:75,carb:150,fat:33.3,hour:12};
    assert.equal(buildState(baseline).kind,'good');
    assert.equal(buildState({...baseline,count:0}).kind,'neutral');
    assert.equal(buildState({...baseline,protein:0,carb:0,fat:0}).kind,'neutral');
    const high=buildState({...baseline,total:2400});
    assert.equal(high.kind,'adjust'); assert.equal(high.target,'advice'); assert.ok(high.surface.includes('243,177,159'));
    assert.equal(buildState({...baseline,protein:4,carb:210,fat:25}).kind,'adjust');
});

test('four meal libraries have twelve complete recipes and matching ingredient totals', () => {
    const advice=require('../utils/advice');
    for(const meal of advice.MEAL_META) assert.equal(advice.RECIPES.filter(row=>row.meal===meal.key).length,12);
    const ids=new Set();
    for(const recipe of advice.RECIPES){
        assert.ok(!ids.has(recipe.id));ids.add(recipe.id);
        const lines=advice.buildRecipeLines(recipe);assert.equal(lines.length,recipe.parts.length);
        const stat=advice.calcRecipe(recipe);
        assert.ok(Math.abs(lines.reduce((sum,row)=>sum+row.kcal,0)-stat.kcal)<=.5);
        for(const key of ['protein','carb','fat']) assert.ok(Math.abs(lines.reduce((sum,row)=>sum+row[key],0)-stat[key])<.3);
        for(const row of lines) assert.ok(row.fact && Number.isFinite(row.protein) && row.qty>0);
    }
});

test('every recipe has a reviewed image and mismatched fruit images are replaced', () => {
    const advice=require('../utils/advice');
    const content=require('../utils/recipe-content');
    for(const recipe of advice.RECIPES){
        const art=content.recipeImage(recipe);
        assert.ok(art.src,recipe.id+' has no reviewed photo');
        assert.ok(fs.existsSync(path.join(root,art.src)),recipe.id+' photo is missing');
    }
    const at=id=>content.recipeImage(advice.getRecipe(id));
    assert.equal(at('s12').src,'/assets/recipe-atlas-extra.jpg');
    assert.equal(at('s12').style,'width:500%;height:200%;left:-0%;top:-0%;');
    assert.notEqual(at('s5').style,at('s12').style);
    assert.notEqual(at('s10').style,at('s12').style);
    assert.equal(at('b10').style,'left:-200%;top:-200%;');
    for(const [id,index] of Object.entries({b1:0,b2:1,b3:0,b5:2,b6:3,b7:0,b8:0,b9:0,b11:3,l1:4,l3:6,l4:9,l6:4,l8:7,l9:8,l10:4,l11:5,l12:8,d1:8,d2:4,d3:6,d5:5,d7:8,d8:9,d10:7,d11:6,d12:7,s2:10,s6:11,s7:11,s11:11})) {
        assert.equal(at(id).src,'/assets/recipe-atlas.jpg');
        assert.equal(at(id).style,'left:-'+index%4*100+'%;top:-'+Math.floor(index/4)*100+'%;',id+' suitable original photo changed');
    }
    const cards=page('advice');
    assert.equal(cards.buildCard('s12').artSrc,at('s12').src);
    assert.equal(cards.buildCard('s12').artStyle,at('s12').style);
});

test('recipe tabs search and inline accordions keep independent expanded state', async () => {
    const advice=page('advice');advice.onLoad();await tick();
    advice.handleTab({currentTarget:{dataset:{key:'library'}}});
    advice.handleLibMeal({currentTarget:{dataset:{key:'lunch'}}});assert.equal(advice.data.libCount,12);
    advice.handleSearch({detail:{value:'鸡胸肉'}});assert.ok(advice.data.libRecipes.length>0);
    assert.ok(advice.data.libRecipes.every(row=>(row.title+row.subtitle).includes('鸡胸肉')));
    const id=advice.data.libRecipes[0].id;advice.handleToggleRecipe({currentTarget:{dataset:{id}}});assert.equal(advice.data.libExpandedId,id);
    advice.handleToggleRecipe({currentTarget:{dataset:{id}}});assert.equal(advice.data.libExpandedId,'');
    advice.handleTab({currentTarget:{dataset:{key:'advice'}}});advice.handleToggleRecipe({currentTarget:{dataset:{id:'b1'}}});assert.equal(advice.data.expandedId,'b1');
});

test('recipe imports editable ingredients without saving, including when display unit is kJ', () => {
    storage.set('cal_energy_unit','kj');
    const before=(storage.get('cal_records')||[]).length;
    const add=page('add');add.onLoad({recipe:'l1'});
    const expected=require('../utils/advice').calcRecipe(require('../utils/advice').getRecipe('l1'));
    assert.equal(add.data.items.length,3);assert.equal(add.data.selectedMeal,'lunch');
    assert.equal(Math.round(add.data.items.reduce((sum,row)=>sum+row.kcal,0)),expected.kcal);
    assert.equal((storage.get('cal_records')||[]).length,before);
    add.handleEditItem({currentTarget:{dataset:{index:0}}});assert.equal(add.data.formQty,'0.5');
    add.onUnload();storage.delete('cal_energy_unit');
});

test('knowledge filters, deep links and article sources are complete', () => {
    const knowledge=require('../utils/knowledge');
    assert.ok(knowledge.filterArticles('份量估算','份').length>0);
    assert.equal(knowledge.filterArticles('全部','not-a-real-topic').length,0);
    for(const item of knowledge.ARTICLES){const article=knowledge.getArticle(item.id);assert.ok(article.sections.length>=3);assert.ok(article.references.every(ref=>ref.url.startsWith('https://')));}
    const science=page('knowledge');science.onLoad({id:'portion'});assert.equal(science.data.article.id,'portion');
});

test('home BMI uses stored body profile when no weigh-in exists', async () => {
    storage.clear();storage.set('cal_profile',{height:170,weight:62.5});
    const home=page('index');await home.loadWeight();assert.equal(home.data.bmiText,'21.6');assert.ok(home.data.weightText.includes('62.5'));
    home.handleScienceChange({detail:{current:2}});assert.equal(home.data.scienceIndex,2);
    home.pauseScience();assert.equal(home.data.scienceAutoplay,false);home.resumeScience();assert.equal(home.data.scienceAutoplay,true);
    storage.clear();
});

test('home handles empty days, actual macros, energy units and meal expansion', () => {
    const home = page('index');
    home.applyRecords([], 1800, null);
    assert.equal(home.data.groups.length, 3);
    assert.equal(home.data.todayKcalText, '0');
    assert.equal(home.data.macroCards[0].target, '113');
    home.applyRecords([{ id:'a',meal:'lunch',name:'鸡胸肉',kcal:165,protein:31,carb:0,fat:3.6,qty:1,unit:'份',note:'' }],1800,{protein:90,carb:200,fat:60});
    assert.equal(home.data.macroCards[0].value, '31');
    assert.equal(home.data.groups[1].summary, '鸡胸肉');
    assert.ok(home.data.progressWidth > 0);
    home.handleMealTap({currentTarget:{dataset:{key:'lunch'}}}); assert.equal(home.data.expandedMeal,'lunch');
    home.handleMealTap({currentTarget:{dataset:{key:'lunch'}}}); assert.equal(home.data.expandedMeal,'');
});

test('manual draft can be edited and persisted as one meal', async () => {
    storage.clear();
    const add = page('add'); add.onLoad({mode:'manual',meal:'dinner'}); add.onReady();
    assert.equal(add.data.selectedMeal,'dinner'); assert.equal(add.data.manualOpen,false);
    add.handleOpenManual(); assert.equal(add.data.manualOpen,true);
    add.setData({formName:'水煮蛋',formQty:'2',formKcal:'70',formProtein:'12',formCarb:'1',formFat:'10',selectedUnit:'个'});
    add.handleAddItem();
    assert.equal(add.data.itemsCount,1); assert.equal(add.data.items[0].kcal,140);
    add.handleEditItem({currentTarget:{dataset:{index:0}}});
    assert.equal(add.data.formQty,'2');
    const result=await add.saveItems(add.data.items);
    assert.equal(result.error,null);assert.equal(storage.get('cal_records').length,1);
    assert.equal(storage.get('cal_records')[0].meal,'dinner');
    add.onUnload();
});

test('voice provider stays editable, recalculates totals and requires explicit save', async () => {
    const recognizer = require('../utils/voice-recognize');
    recognizer.setProvider(async () => ({ok:true,items:[{name:'米饭',qty:1,unit:'碗',kcal:230,protein:5,carb:50,fat:.6}]}));
    app.globalData.voiceNote={path:'/saved.mp3',duration:2};
    const before = (storage.get('cal_records') || []).length;
    const add=page('add');add.onLoad({mode:'voice'});await tick();
    assert.equal(add.data.itemsCount,1);assert.equal(add.data.items[0].kcal,230);
    assert.equal((storage.get('cal_records') || []).length,before);
    add.handleEditItem({currentTarget:{dataset:{index:0}}});assert.equal(add.data.formName,'米饭');
    recognizer.setProvider(null);
    const result=await recognizer.recognize({path:'/saved.mp3'});assert.equal(result.source,'unconfigured');
    recognizer.setProvider(async () => {throw Error('offline');});assert.equal((await recognizer.recognize({})).ok,false);
    recognizer.setProvider(null);add.onUnload();
});

test('recorder completes once, cancels without saving and handles automatic stop', async () => {
    const recorder=require('../utils/recorder');
    const completions=[];
    assert.equal(await recorder.start(result=>completions.push(result)),true);
    const result=await recorder.stop(false);assert.equal(result.path,'/saved.mp3');assert.equal(completions.length,1);
    assert.equal(await recorder.start(result=>completions.push(result)),true);
    await recorder.stop(true);assert.equal(completions[1].canceled,true);
    assert.equal(await recorder.start(result=>completions.push(result)),true);
    listeners.stop({tempFilePath:'/auto.mp3',duration:60000});
    assert.equal(completions.length,3);assert.equal(completions[2].duration,60);assert.equal(recorder.isActive(),false);
});

test('dock suppresses long-press tap, cancels on swipe, and opens inline menu', async () => {
    require('../components/app-dock/app-dock');
    const dock=Object.assign({},componentDefinition.methods,{data:structuredClone(componentDefinition.data),properties:{active:'home'}});
    dock.setData=function(patch){Object.assign(this.data,patch);};
    dock.toggle();assert.equal(dock.data.expanded,true);dock.close();
    dock.touchStart({touches:[{clientY:600}]});dock.longPress();await tick();
    assert.equal(dock.data.recording,true);
    dock.touchMove({touches:[{clientY:500}]});assert.equal(dock.data.canceling,true);
    dock.touchEnd();await tick();assert.equal(dock.data.recording,false);
    dock.toggle();assert.equal(dock.data.expanded,false);
    dock.cleanup();
});

test('releasing while microphone permission is pending cancels the eventual recording', async () => {
    const original = wx.getSetting;
    let grant;
    wx.getSetting = opts => { grant = () => opts.success({ authSetting: { 'scope.record': true } }); };
    const dock=Object.assign({},componentDefinition.methods,{data:structuredClone(componentDefinition.data),properties:{active:'home'}});
    dock.setData=function(patch){Object.assign(this.data,patch);};
    dock.touchStart({touches:[{clientY:600}]});dock.longPress();dock.touchEnd();
    grant();await tick();
    assert.equal(dock.data.recording,false);assert.equal(dock.data.busy,false);
    assert.equal(require('../utils/recorder').isActive(),false);
    dock.cleanup();wx.getSetting=original;
});

test('dock checks final release coordinates and handles pageY and system cancellation', async () => {
    let navigations=0;const original=wx.navigateTo;wx.navigateTo=()=>{navigations++;};
    const make=()=>{
        const dock=Object.assign({},componentDefinition.methods,{data:structuredClone(componentDefinition.data),properties:{active:'home'}});
        dock.setData=patch=>Object.assign(dock.data,patch);return dock;
    };
    const canceled=make();canceled.touchStart({touches:[{identifier:1,pageY:600}]});canceled.longPress();await tick();
    canceled.touchEnd({changedTouches:[{identifier:1,pageY:500}]});await tick();
    assert.equal(navigations,0);assert.equal(canceled.data.busy,false);canceled.cleanup();
    const submitted=make();submitted.touchStart({touches:[{identifier:2,clientY:600}]});submitted.longPress();await tick();
    submitted.touchEnd({changedTouches:[{identifier:2,clientY:595}]});submitted.touchEnd();await tick();
    assert.equal(navigations,1);submitted.cleanup();
    const interrupted=make();interrupted.touchStart({touches:[{clientY:600}]});interrupted.longPress();interrupted.touchCancel();await tick();
    assert.equal(navigations,1);assert.equal(require('../utils/recorder').isActive(),false);interrupted.cleanup();
    wx.navigateTo=original;
});

test('release before native recorder starts cancels without leaving a live recorder',async()=>{
    const originalStart=manager.start;
    manager.start=()=>{};
    const dock=Object.assign({},componentDefinition.methods,{data:structuredClone(componentDefinition.data),properties:{active:'home'}});
    dock.setData=patch=>Object.assign(dock.data,patch);
    dock.touchStart({touches:[{clientY:600}]});dock.longPress();await tick();
    assert.equal(require('../utils/recorder').isActive(),true);
    dock.touchEnd();listeners.start();await tick();
    assert.equal(require('../utils/recorder').isActive(),false);assert.equal(dock.data.busy,false);
    dock.cleanup();manager.start=originalStart;
});

test('trend chart distinguishes missing days and respects selected range', () => {
    const analysis=page('analysis');
    const today=require('../utils/record-store').formatDate(new Date());
    const chart=analysis.buildTrend([{date:today,kcal:400}],7,1800);
    assert.equal(chart.points.length,7);assert.equal(chart.recordedDays,1);
    assert.equal(chart.points[0].missing,true);assert.equal(chart.points[6].total,400);
    assert.equal(analysis.buildTrend([],30,1800).points.length,30);
});

test('page JSON, component paths and WXML event bindings resolve', () => {
    const config=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
    for(const route of config.pages) {
        const cfg=JSON.parse(fs.readFileSync(path.join(root,route+'.json'),'utf8'));
        for(const target of Object.values(cfg.usingComponents || {})) assert.ok(fs.existsSync(path.join(root,target+'.json')));
        const name=route.split('/')[1]; const instance=page(name);
        const markup=fs.readFileSync(path.join(root,route+'.wxml'),'utf8');
        for(const match of markup.matchAll(/(?:bind|catch)(?:tap|longpress|touchstart|touchend|touchcancel|touchmove|input|change|confirm|error)="([\w]+)"/g)) assert.equal(typeof instance[match[1]],'function',route+' '+match[1]);
    }
});

test('short presses toggle the add menu once without starting a recording',()=>{
    delete require.cache[require.resolve('../components/app-dock/app-dock')];require('../components/app-dock/app-dock');
    const dock={...componentDefinition.methods,data:structuredClone(componentDefinition.data),properties:{active:'home'}};
    dock.setData=patch=>Object.assign(dock.data,patch);
    dock.touchStart({touches:[{identifier:1,clientY:600}]});dock.touchEnd({changedTouches:[{identifier:1,clientY:600}]});
    assert.equal(dock.data.expanded,true);assert.equal(require('../utils/recorder').isActive(),false);
    dock.toggle();assert.equal(dock.data.expanded,true,'native synthetic tap must not close the menu again');
    dock.touchStart({touches:[{identifier:2,clientY:600}]});dock.touchEnd({changedTouches:[{identifier:2,clientY:600}]});
    assert.equal(dock.data.expanded,false);dock.cleanup();
});

test('custom units are trimmed, saved without duplicates and reused by records and new pages',async()=>{
    storage.clear();const add=page('add');add.onLoad({mode:'manual'});await tick();
    add.handleUnitInput({detail:{value:' 小盘 '}});add.handleUnitCommit();
    assert.equal(add.data.selectedUnit,'小盘');assert.equal(add.data.unitOptions.includes('小盘'),true);
    add.handleUnitCommit();assert.deepEqual(storage.get('cal_custom_units'),['小盘']);
    add.setData({formName:'水果',formQty:'2',formKcal:'50'});
    const built=add.buildItemFromForm();assert.equal(built.item.unit,'小盘');assert.equal(built.item.qtyText,'2小盘');
    const next=page('add');next.onLoad({});assert.ok(next.data.unitOptions.includes('小盘'));
    next.handleUnitPick({currentTarget:{dataset:{key:'小盘'}}});assert.equal(next.data.selectedUnit,'小盘');
    next.handleUnitInput({detail:{value:''}});next.setData({formName:'水果',formQty:'1',formKcal:'50'});
    assert.ok(next.buildItemFromForm().error.includes('单位'));
    assert.throws(()=>require('../utils/custom-units').add('100克'));
    next.onUnload();add.onUnload();
});

test('BMI state colors and three water amounts preserve underlying health data',async()=>{
    storage.clear();const home=page('index');
    for(const [weight,tone] of [[45,'metric-low'],[60,'metric-normal'],[74,'metric-high'],[90,'metric-danger']]){
        storage.set('cal_profile',{height:170,weight});await home.loadWeight();assert.equal(home.data.bmiToneClass,tone);
    }
    for(const ml of [100,250,500])await home.handleWaterAdd({currentTarget:{dataset:{ml}}});
    assert.equal(home.data.waterTotalText,'850');assert.equal(home.data.mascotState,'water');
    home.applyRecords([{id:'digit',meal:'lunch',name:'饭',kcal:1234,protein:20,carb:100,fat:20,qty:1,unit:'份'}],1800);
    assert.equal(home.data.energyDigits.join(''),home.data.todayKcalText);
    home.applyRecords([],1800);assert.equal(home.data.energyEmpty,true);assert.deepEqual(home.data.energyDigits,[]);assert.equal(home.data.todayKcalText,'0');
    home.applyRecords([{id:'zero',meal:'lunch',name:'水',kcal:0,protein:0,carb:0,fat:0,qty:1,unit:'份'}],1800);assert.equal(home.data.energyDigits.join(''),'0');assert.equal(home.data.energyEmpty,false);home.onUnload();
});

test('approved mascot states map to all pose assets and events take priority',()=>{
    const {resolve,STATES}=require('../utils/mascot-state');
    const base={kind:'neutral',count:0,hour:9,water:500,waterGoal:1500};
    assert.equal(resolve(base),'idle');assert.equal(resolve({...base,hour:22}),'sleep');
    assert.equal(resolve({...base,count:2,kind:'adjust'}),'adjust');assert.equal(resolve({...base,count:2,kind:'good'}),'balanced');
    assert.equal(resolve({...base,hour:16,water:0}),'idle');assert.equal(resolve({...base,hour:22,event:'success'}),'success');
    for(const state of Object.keys(STATES))for(const frame of [0,1])assert.ok(fs.existsSync(path.join(root,'assets/mascot',state+'-'+frame+'.png')));
    for(const avatar of require('../utils/avatars').AVATARS)assert.ok(fs.existsSync(path.join(root,'assets/avatars',avatar.key+'.png')));
});

test('date dropdown supports leap months and blocks future and pre-2020 records', () => {
    const add=page('add');
    add.renderDateMonth(2024,1);
    assert.equal(add.data.dateDays.filter(day=>day.value).length,29);
    assert.equal(add.data.dateMonthLabel,'2024年2月');
    add.handleDatePick({currentTarget:{dataset:{value:'2024-02-29'}}});
    assert.equal(add.data.dateValue,'2024-02-29');
    assert.equal(add.data.dateOpen,false);
    for(const value of ['2099-01-01','2019-12-31','']) add.handleDatePick({currentTarget:{dataset:{value}}});
    assert.equal(add.data.dateValue,'2024-02-29');
    add.renderDateMonth(2020,0);
    add.handleDateMonth({currentTarget:{dataset:{step:-1}}});
    assert.equal(add.data.dateMonthLabel,'2020年1月');
    add.handleDateReset();
    assert.equal(add.data.dateLabel,'今天');
    assert.equal(add.data.datePicked,false);
});

test('compact home cards keep unit conversion and avoid the native menu capsule',async()=>{
    storage.clear();
    const oldInfo=wx.getWindowInfo,oldCapsule=wx.getMenuButtonBoundingClientRect;
    wx.getWindowInfo=()=>({windowWidth:320,statusBarHeight:24});
    wx.getMenuButtonBoundingClientRect=()=>({left:233});
    try{
        const home=page('index');home.onLoad();
        assert.equal(home.data.homeTopInset,46);
        assert.ok(home.data.sloganMaxWidth+320*28/750<233);
        storage.set('cal_energy_unit','kj');
        const records=[{id:'compact',meal:'lunch',name:'米饭',kcal:280,protein:12,carb:40,fat:8,qty:1,unit:'碗'}];
        home.applyRecords(records,1800);
        assert.equal(home.data.energyUnit,'kJ');
        assert.equal(home.data.goalValueText,String(Math.round(1800*4.184)));
        assert.equal(home.data.remainingValueText,String(Math.round(1520*4.184)));
        assert.equal(home.data.groups.find(g=>g.key==='lunch').totalValueText,String(Math.round(280*4.184)));
        assert.equal(home.data.macroCards.find(m=>m.key==='carb').label,'碳水');
        storage.set('cal_profile',{height:170,weight:60});storage.set('cal_weight_unit','lb');
        await home.loadWeight();
        assert.equal(home.data.heightValueText,'170');
        assert.equal(home.data.weightValueText,'132.3');assert.equal(home.data.weightUnitText,'lb');
        assert.equal(home.data.bmiText,'20.8');home.onUnload();
    }finally{wx.getWindowInfo=oldInfo;wx.getMenuButtonBoundingClientRect=oldCapsule;storage.clear();}
});

test('small recognition state ignores canceled and removed voice results, and retries exactly once',async()=>{
 const recognizer=require('../utils/voice-recognize');const waiting=[];
 recognizer.setProvider(()=>new Promise(resolve=>waiting.push(resolve)));
 app.globalData.voiceNote={path:'/saved.mp3',duration:4};const add=page('add');add.onLoad({mode:'voice'});await tick();
 assert.equal(add.data.voiceRecognizing,true);assert.equal(add.data.voiceStage,'working');
 const before=(storage.get('cal_records') || []).length;add.handleSave();assert.equal(add.data.submitting,false);
 add.handleCancelVoiceRecognition();assert.equal(add.data.voiceStage,'canceled');
 waiting.shift()({ok:true,text:'旧结果',items:[{name:'鸡蛋',qty:1,unit:'个',kcal:70,protein:6,carb:.5,fat:5}]});await tick();assert.equal(add.data.itemsCount,0);
 const retry=add.handleVoiceRetry();await tick();assert.equal(waiting.length,1);add.handleVoiceRetry();assert.equal(waiting.length,1);
 waiting.shift()({ok:true,text:'今天中午一个鸡蛋',items:[{name:'鸡蛋',qty:1,unit:'个',kcal:70,protein:6,carb:.5,fat:5}]});await retry;
 assert.equal(add.data.itemsCount,1);assert.equal(add.data.voiceStage,'ready');assert.equal(add.data.voiceTranscript,'今天中午一个鸡蛋');assert.equal(add.data.manualOpen,false);
 add.handleTranscriptToggle();assert.equal(add.data.voiceTranscriptOpen,true);
 assert.equal((storage.get('cal_records') || []).length,before);
 add.handleVoiceRemove();assert.equal(add.data.voiceStage,'idle');assert.equal(add.data.voiceTranscript,'');assert.equal(add.data.itemsCount,1);
 add.onUnload();recognizer.setProvider(null);
});
test('removed or unloaded voice work cannot repopulate the meal; errors stay retryable',async()=>{
 const recognizer=require('../utils/voice-recognize');let finish;
 recognizer.setProvider(()=>new Promise(resolve=>{finish=resolve;}));
 app.globalData.voiceNote={path:'/saved.mp3',duration:4};const add=page('add');add.onLoad({mode:'voice'});await tick();add.handleVoiceRemove();
 finish({ok:true,text:'不要回填',items:[{name:'鸡蛋',qty:1,unit:'个',kcal:70,protein:6,carb:.5,fat:5}]});await tick();assert.equal(add.data.itemsCount,0);assert.equal(add.data.voiceStage,'idle');add.onUnload();
 recognizer.setProvider(async()=>({ok:false,error:'识别失败',items:[]}));const next=page('add');next.onLoad({});await next.runVoiceRecognition({path:'/saved.mp3',duration:4});assert.equal(next.data.voiceStage,'error');assert.equal(next.data.voiceRecognizing,false);assert.equal(next.data.voiceNote.path,'/saved.mp3');next.onUnload();recognizer.setProvider(null);
});
