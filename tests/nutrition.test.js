const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value)};
const nutrition=require('../utils/nutrition');
const parser=require('../utils/voice-parser');
const {createFoodStore}=require('../utils/food-store');
test('nutrition matching loads with JS-only mini-program module resolution',()=>{
    const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
    const cache=new Map();
    function load(file){
        file=path.resolve(file);
        if(cache.has(file))return cache.get(file).exports;
        assert.equal(path.extname(file),'.js','Mini-program require must resolve a JS module');
        const module={exports:{}};cache.set(file,module);
        const requireLocal=name=>load(path.resolve(path.dirname(file),path.extname(name)?name:name+'.js'));
        vm.runInNewContext('(function(require,module,exports,wx){'+fs.readFileSync(file,'utf8')+'\n})',{console})(requireLocal,module,module.exports,global.wx);
        return module.exports;
    }
    const db=load(path.join(__dirname,'../utils/food-db.js'));
    assert.ok(db.searchFoods('燕麦').some(row=>row.name==='燕麦粥'));
});
test('public foods scale by edible grams and keep unknown portions unmatched',()=>{
    const dry=nutrition.lookup('干燕麦片','克'), cooked=nutrition.lookup('燕麦粥','克');
    assert.ok(dry.kcal>cooked.kcal*4);
    assert.equal(dry.fdcId,173904);
    assert.equal(nutrition.lookup('干燕麦片','碗'),null);
    assert.equal(nutrition.lookup('燕麦','碗'),null);
    assert.equal(nutrition.lookup('香蕉','千克').kcal,nutrition.lookup('香蕉','克').kcal*1000);
    assert.equal(nutrition.data.length,38);
    assert.ok(nutrition.data.every(row=>row.description && row.per100g.kcal>0));
});
test('voice preserves ambiguous and unknown food and identifies date and meal',()=>{
    const result=parser.parse('昨天早上吃了一个鸡蛋，一碗燕麦，还有神秘菜。',new Date(2026,10,2,20).getTime());
    assert.equal(result.items.length,1);
    assert.equal(result.items[0].name,'鸡蛋');
    assert.deepEqual(result.pending.map(row=>row.name),['燕麦','神秘菜']);
    assert.equal(result.context.meal,'breakfast');
    assert.equal(result.context.date,'2026-11-01');
    assert.equal(parser.parse('早饭一个鸡蛋，中午一碗米饭').multipleMeals,true);
    assert.equal(parser.parse('早上吃了燕麦').pending[0].name,'燕麦');
});
test('confirmed foods retain macros separately for each unit, without guessing a new unit',async()=>{
    storage.clear();
    const store=createFoodStore({storageKey:'cal_foods'});
    await store.upsert('自制麦片',120,'杯',{p:5,c:20,f:2});
    await store.upsert('自制麦片',60,'勺',{p:2.5,c:10,f:1});
    assert.equal((await store.list()).data.length,2);
    assert.equal(nutrition.lookup('自制麦片','杯').p,5);
    assert.equal(nutrition.lookup('自制麦片','碗'),null);
});
test('unknown nutrition is not synthesized from a similar food name',()=>{
    assert.equal(require('../utils/food-db').findMacro('神秘甜品',100),null);
    assert.equal(require('../utils/food-db').findMacro('番茄炒蛋神秘版',100),null);
});
test('personal backup whitelist and import retain confirmed nutrition but never secrets',()=>{
    const clean=require('../utils/personal-foods').sanitize([{name:'私房菜',unit:'份',kcal:123,nutrition:{p:2,c:3,f:4},apiKey:'secret'}]);
    assert.equal(JSON.stringify(clean).includes('secret'),false);
    const parsed=require('../utils/importer').parseImport(JSON.stringify({foods:clean,records:[]}));
    assert.deepEqual(parsed.foods[0].nutrition,{p:2,c:3,f:4});
});
test('calorie-only manual records retain unknown macros and do not report a balanced diet',async()=>{
    let definition;
    global.Page=value=>{definition=value;};
    require('../pages/add/add');
    const page={...definition,data:structuredClone(definition.data)};
    page.setData=(patch,callback)=>{Object.assign(page.data,patch);if(callback)callback();};
    Object.assign(page.data,{formName:'未知私房菜',formQty:'1',formKcal:'200',formProtein:'',formCarb:'',formFat:'',selectedUnit:'份',formNote:''});
    const item=page.buildItemFromForm().item;
    assert.equal(item.nutritionStatus,'incomplete');
    assert.equal(item.protein,null);
    const store=require('../utils/record-store').createRecordStore({storageKey:'test-records'});
    await store.create({...item,date:'2026-11-02',meal:'breakfast',timeKnown:false});
    const row=(await store.list()).data[0];
    assert.equal(row.protein,null);
    assert.equal(row.timeKnown,false);
    assert.equal(require('../utils/diet-state').buildState({count:1,total:200,goal:1800,protein:20,carb:25,fat:7,nutritionMissing:true,hour:8}).kind,'neutral');
});
test('nutrition estimate never calls an unstarted service',async()=>{
    storage.clear();
    await assert.rejects(require('../utils/ai-runtime').estimateFood('私房菜','份'),/启动营养估算/);
});
