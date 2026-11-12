const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),showToast(){}};
const regional=require('../utils/chongqing-foods');
const nutrition=require('../utils/nutrition');
const parser=require('../utils/voice-parser');
const ai=require('../utils/ai-settings');
const runtime=require('../utils/ai-runtime');
const config={provider:'custom',baseUrl:'https://example.test/v1',model:'nutrition-chat',apiKey:'private-test'};
function enable(kind){ai.save(kind,config);ai.setEnabled(kind,true);}

test('regional recipes expose 80+ distinct foods, auditable ingredients and safe unit conversions',()=>{
    storage.clear();assert.ok(regional.foods.length>=80);const names=new Set();
    for(const row of regional.foods){assert.ok(!names.has(row.name));names.add(row.name);assert.ok(row.kcal>0);assert.ok([row.p,row.c,row.f].every(n=>Number.isFinite(n)&&n>=0));assert.equal(row.source,'recipe-estimate');}
    const block=nutrition.lookup('豆干','块'),gram=nutrition.lookup('豆干','克');assert.ok(block.kcal>0);assert.ok(Math.abs(block.kcal-gram.kcal*30)<.3);
    assert.equal(nutrition.lookup('豆干','杯'),null);assert.equal(nutrition.lookup('若皮','块').name,'苕皮');
    assert.ok(require('../utils/food-db').searchFoods('豆干').length>=4);assert.ok(require('../utils/food-db').searchFoods('若皮').some(row=>row.name==='苕皮'));
});

test('the screenshot transcript retains both foods and corrects only the controlled regional alias',()=>{
    storage.clear();const result=parser.parse('一块豆干，一块若皮。');assert.equal(result.items.length,2);assert.equal(result.pending.length,0);
    assert.deepEqual(result.items.map(row=>row.name),['豆干','苕皮']);assert.ok(result.items.every(row=>row.kcal>0 && row.protein>=0));
    assert.equal(parser.parse('两串烤牛肉串，一张烤苕皮').items.length,2);assert.equal(parser.parse('一碗米饭').items[0].name,'米饭');
});

test('nutrition credentials are independent; vision cannot silently authorize nutrition calls',async()=>{
    storage.clear();enable('vision');let calls=0;wx.request=()=>{calls++;};
    await assert.rejects(runtime.estimateFood('未知小吃','份'),/营养估算/);assert.equal(calls,0);
    enable('nutrition');assert.equal(ai.isEnabled('nutrition'),true);ai.clear('vision');assert.equal(ai.isEnabled('nutrition'),true);assert.equal(ai.read().nutrition.apiKey,'private-test');
    ai.setEnabled('nutrition',false);assert.equal(ai.isEnabled('nutrition'),false);
});

test('unknown-food fallback batches text only, retains local foods, leaves quantity-less items pending',async()=>{
    storage.clear();enable('nutrition');let calls=0;
    wx.request=options=>{calls++;assert.equal(options.data.model,'nutrition-chat');const body=JSON.stringify(options.data);assert.ok(body.includes('自制小吃'));assert.ok(!body.includes('image_url'));assert.ok(!body.includes('录音路径'));queueMicrotask(()=>options.success({statusCode:200,data:{choices:[{message:{content:JSON.stringify({items:[{name:'自制小吃',unit:'份',gramsPerUnit:100,per100g:{kcal:100,protein:5,carb:10,fat:4}}]})}}]}}));};
    const local={name:'豆干',qty:1,kcal:45};
    const parsed={items:[local],pending:[{name:'自制小吃',unit:'份',qty:2},{name:'未知食品',unit:'份',qty:null}],context:{meal:'breakfast'},multipleMeals:false};
    const result=await runtime.resolvePending(parsed);assert.equal(calls,1);assert.equal(result.items[0],local);assert.equal(result.items[1].kcal,200);assert.equal(result.items[1].source,'ai-estimate');assert.equal(result.pending.length,1);assert.equal(result.pending[0].qty,null);
    wx.request=options=>queueMicrotask(()=>options.fail({errMsg:'request:fail timeout'}));const failed=await runtime.resolvePending(parsed);assert.equal(failed.items[0],local);assert.equal(failed.pending.length,2);
});

test('system mode resolves light to simple and tracks changes without changing manual themes',()=>{
    storage.clear();const settings=require('../utils/settings');let listener;let current;
    global.getCurrentPages=()=>current?[current]:[];wx.getAppBaseInfo=()=>({theme:'light'});wx.onThemeChange=fn=>{listener=fn;};
    delete require.cache[require.resolve('../utils/theme')];const theme=require('../utils/theme');theme.initialize();theme.initialize();
    current={data:{},setData(patch){Object.assign(this.data,patch);}};settings.setTheme('system');theme.apply(current);assert.equal(current.data.uiTheme,'system');assert.equal(current.data.uiResolvedTheme,'simple');
    listener({theme:'dark'});assert.equal(current.data.uiResolvedTheme,'dark');assert.equal(settings.getTheme(),'system');
    settings.setTheme('light');theme.apply(current);listener({theme:'light'});assert.equal(current.data.uiResolvedTheme,'light');
    settings.setTheme('dark');theme.apply(current);assert.equal(current.data.uiResolvedTheme,'dark');
});
