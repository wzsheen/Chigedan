const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),showToast(){}};
global.getApp=()=>({globalData:{}});
const parser=require('../utils/voice-parser');
const nutrition=require('../utils/nutrition');
const ai=require('../utils/ai-settings');
const runtime=require('../utils/ai-runtime');
function page(){let definition;global.Page=value=>{definition=value;};delete require.cache[require.resolve('../pages/add/add')];require('../pages/add/add');return {...definition,data:structuredClone(definition.data),setData(patch,callback){Object.assign(this.data,patch);if(callback)callback();}};}

test('packaging counts are retained while missing capacity or net weight is explained accurately',()=>{
 storage.clear();
 for(const [text,name,qty,unit] of [['一瓶可乐','可乐',1,'瓶'],['半瓶可乐','可乐',.5,'瓶'],['一瓶半可乐','可乐',1.5,'瓶'],['可乐喝了一瓶','可乐',1,'瓶'],['一罐可乐','可乐',1,'罐'],['一听可乐','可乐',1,'罐'],['两盒牛奶','牛奶',2,'盒'],['一包薯片','薯片',1,'包']]){
  const result=parser.parse(text);assert.equal(result.items.length,0,text);assert.equal(result.pending.length,1,text);const row=result.pending[0];assert.equal(row.name,name,text);assert.equal(row.qty,qty,text);assert.equal(row.unit,unit,text);assert.equal(row.requiresDetail,true);assert.ok(row.reason.includes('容量') || row.reason.includes('净含量'));
 }
});
test('explicit package sizes, total sizes, half portions and metric aliases produce correct amounts',()=>{
 storage.clear();
 const cases=[['一瓶500毫升可乐',500],['两瓶500ml的可乐',1000],['半瓶500mL可乐',250],['一瓶500毫升可乐喝了一半',250],['一瓶可乐500毫升',500],['可乐500毫升',500],['两瓶可乐，每瓶500毫升',1000],['两瓶可乐一共500毫升',500],['一瓶半500毫升可乐',750],['喝了零点五升可乐',500],['喝了五百毫升可乐',500],['喝了330ML可乐',330]];
 for(const [text,amount] of cases){const r=parser.parse(text);assert.equal(r.pending.length,0,text);assert.equal(r.items.length,1,text);const item=r.items[0],ml=item.unit==='升'?item.qty*1000:item.qty;assert.equal(ml,amount,text);assert.ok(Math.abs(item.kcal-amount*.42)<.001,text);}
});
test('adjacent foods split without punctuation and capacity never transfers to a different food',()=>{
 storage.clear();
 const r=parser.parse('昨天中午一个鸡蛋一瓶可乐，500毫升牛奶',new Date(2026,10,3,12).getTime());
 assert.deepEqual(r.items.map(row=>row.name),['鸡蛋','牛奶']);assert.equal(r.pending[0].name,'可乐');assert.equal(r.pending[0].qty,1);
 assert.equal(r.context.meal,'lunch');assert.equal(r.context.date,'2026-11-02');
 const separate=parser.parse('一瓶可乐和500毫升牛奶');assert.equal(separate.pending.length,1);assert.equal(separate.items[0].name,'牛奶');
 const consecutive=parser.parse('一瓶可乐一盒牛奶');assert.equal(consecutive.pending.length,2);assert.deepEqual(consecutive.pending.map(row=>row.qty),[1,1]);
});
test('generic drinks remain ambiguous even with a known volume; confirmed personal bottle sizes still work',async()=>{
 storage.clear();const r=parser.parse('一瓶500毫升饮料');assert.equal(r.pending[0].name,'饮料');assert.equal(r.pending[0].qty,500);assert.equal(r.pending[0].requiresDetail,true);
 const store=require('../utils/food-store').createFoodStore({storageKey:'cal_foods'});await store.upsert('可乐',210,'瓶',{p:0,c:52.5,f:0});assert.equal(parser.parse('喝了一瓶可乐').items[0].kcal,210);storage.clear();
});
test('capacity confirmation is excluded from automatic AI guesses and individual AI estimates',async()=>{
 storage.clear();let calls=0;wx.request=()=>{calls++;throw Error('must not request');};
 ai.save('nutrition',{provider:'custom',baseUrl:'https://example.test/v1',model:'test',apiKey:'test'});ai.setEnabled('nutrition',true);
 const input=parser.parse('一瓶可乐');const resolved=await runtime.resolvePending(input);assert.equal(resolved.pending[0].qty,1);assert.equal(calls,0);
 await assert.rejects(runtime.estimateFood('可乐','瓶'),/确认包装容量/);assert.equal(calls,0);storage.clear();
});
test('capacity completion uses millilitres without rounding per-unit calories to zero or losing duplicate pending items',async()=>{
 storage.clear();const add=page();add.data.pendingFoods=parser.parse('一瓶可乐一瓶可乐').pending;
 add.handlePendingFill({currentTarget:{dataset:{index:0}}});assert.equal(add.data.formName,'可乐');assert.equal(add.data.selectedUnit,'毫升');assert.equal(add.data.formQty,'');assert.equal(add.data.formKcal,'0.42');
 add.data.formQty='500';add.syncQtyDerived();add.handleAddItem();assert.equal(add.data.items.length,1);assert.equal(add.data.items[0].kcal,210);assert.equal(add.data.items[0].perUnit,.42);assert.equal(add.data.pendingFoods.length,1);
 const store=require('../utils/food-store').createFoodStore({storageKey:'cal_foods'});await store.upsert('可乐',.42,'毫升',{p:0,c:.1036,f:.0025});assert.equal(nutrition.lookup('可乐','毫升').kcal,.42);
 const diet=await store.upsert('无糖可乐',.02,'毫升',{p:.0011,c:.0029,f:.0003});assert.equal(diet.data.kcal,.02);
 storage.set('cal_energy_unit','kj');const other=page();other.data.pendingFoods=parser.parse('一瓶可乐').pending;other.handlePendingFill({currentTarget:{dataset:{index:0}}});other.data.formQty='500';other.syncQtyDerived();assert.ok(Math.abs(other.buildItemFromForm().item.kcal-210)<.1);storage.clear();
});

test('manual completion learns calorie-only food on meal save and the next voice entry retains unknown macros',async()=>{
 storage.clear();const add=page();add.data.pendingFoods=parser.parse('一碗私房麦羹').pending;assert.equal(add.data.pendingFoods[0].knownFood,false);
 add.handlePendingFill({currentTarget:{dataset:{index:0}}});add.data.formKcal='200';add.data.formQty='1';add.handleAddItem();
 assert.equal(add.data.pendingFoods.length,0);assert.equal(add.data.items[0].nutritionStatus,'incomplete');assert.equal(add.data.items[0].protein,null);
 let completed=0;add.finishSave=()=>{completed++;};add.handleSave();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(completed,1);assert.equal(storage.get('cal_foods')[0].name,'私房麦羹');
 const next=parser.parse('两碗私房麦羹');assert.equal(next.pending.length,0);assert.equal(next.items[0].kcal,400);assert.equal(next.items[0].protein,null);assert.equal(next.items[0].nutritionStatus,'incomplete');
 assert.equal(require('../utils/food-db').findMacro('私房麦羹',200),null);storage.clear();
});
test('food-library failure offers a retry without saving the meal twice',async()=>{
 storage.clear();const add=page();add.addQuickItem('鸡蛋',70,'个');let completed=0;add.finishSave=()=>{completed++;};
 const original=wx.setStorageSync;wx.setStorageSync=(key,value)=>{if(key==='cal_foods')throw Error('quota');original(key,value);};
 try{add.handleSave();await new Promise(resolve=>setImmediate(resolve));assert.equal(add.data.foodLearningPending,true);assert.equal(storage.get('cal_records').length,1);assert.equal(storage.has('cal_foods'),false);assert.equal(completed,0);}
 finally{wx.setStorageSync=original;}
 await add.handleSave();assert.equal(add.data.foodLearningPending,false);assert.equal(storage.get('cal_records').length,1);assert.equal(storage.get('cal_foods').length,1);assert.equal(completed,1);storage.clear();
});
