const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value)};
const db=require('../utils/food-db');
const nutrition=require('../utils/nutrition');
const regional=require('../utils/chongqing-foods');

test('old household defaults agree with the same foods used by unit lookup and search',()=>{
    storage.clear();
    for(const row of db.FOOD_DB){
        const reference=nutrition.lookupBuiltin(row.name,row.unit);
        if(!reference)continue;
        for(const key of ['kcal','p','c','f'])assert.ok(Math.abs(row[key]-reference[key])<.01,row.name+' '+key);
        const exact=db.findExact(row.name),unit=db.findByUnit(row.name,row.unit);
        assert.equal(exact.kcal,unit.kcal,row.name);
    }
    assert.equal(db.findExact('米饭').kcal,195);
    assert.equal(db.findExact('燕麦粥').kcal,177.5);
    assert.equal(db.findByUnit('黄瓜','根').kcal,db.findByUnit('黄瓜','克').kcal*200);
});

test('nonessential regional prefixes are aliases, while established geographic food names remain',()=>{
    storage.clear();
    for(const [old,name] of [['重庆牛肉面','牛肉面'],['重庆凉面','凉面'],['重庆米线','米线'],['重庆泡菜','泡菜'],['山城小汤圆','小汤圆'],['山城麻花','麻花'],['重庆火锅荤素拼盘','火锅荤素拼盘']]){
        const row=nutrition.lookup(old);assert.equal(row.name,name);
        assert.equal(row.kcal,nutrition.lookup(name).kcal);
        assert.ok(!regional.foods.some(row=>row.name===old));
    }
    for(const name of ['重庆小面','合川桃片','万州烤鱼','黔江鸡杂','羊角豆干'])assert.ok(regional.foods.some(row=>row.name===name));
});

test('soy drinks share a declared 250g reference cup, have separate sugar recipes and no duplicate default',()=>{
    storage.clear();
    const plain=nutrition.lookup('无糖豆浆','杯'),sweet=nutrition.lookup('含糖豆浆','杯');
    assert.equal(plain.grams,250);assert.equal(sweet.grams,250);assert.ok(sweet.kcal>plain.kcal);
    assert.equal(db.findExact('豆浆').kcal,sweet.kcal);
    assert.equal(db.findByUnit('重庆豆浆','杯').kcal,sweet.kcal);
    const results=db.searchFoods('豆浆');assert.equal(results.length,2);
    for(const row of results){
        assert.ok(!row.name.includes('重庆'));
        const grams=nutrition.lookup(row.name,'克'),millilitres=nutrition.lookup(row.name,'毫升');
        assert.ok(Math.abs(row.kcal-grams.kcal*250)<1.3);
        assert.equal(grams.kcal,millilitres.kcal);
    }
});

test('normalizing defaults does not rewrite records or confirmed personal food data',()=>{
    const records=[{id:'keep',name:'重庆豆浆',kcal:167}];storage.set('cal_records',records);
    storage.set('cal_foods',[{name:'豆浆',unit:'杯',kcal:90,nutrition:{p:5,c:8,f:3}}]);
    assert.equal(db.findExact('豆浆').source,'personal');assert.equal(db.findExact('豆浆').kcal,90);
    assert.deepEqual(storage.get('cal_records'),records);
    storage.clear();
});
