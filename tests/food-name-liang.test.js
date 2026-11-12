const test=require('node:test');
const assert=require('node:assert/strict');
global.wx={getStorageSync:()=>null};
const parser=require('../utils/voice-parser');
const nutrition=require('../utils/nutrition');
test('语音面食两按成品50克换算并保留其他数量',()=>{
 for(const [text,name,qty] of [['一两牛肉面','牛肉面',1],['两两牛肉面','牛肉面',2],['半两重庆小面','重庆小面',.5]]){
  const result=parser.parse(text); assert.equal(result.pending.length,0,text); assert.equal(result.items.length,1,text);
  const item=result.items[0], ref=nutrition.lookup(name,'两'); assert.equal(item.qty,qty); assert.equal(ref.grams,50); assert.equal(item.kcal,ref.kcal*qty); assert.match(item.note,/成品重量/);
 }
 assert.equal(parser.parse('两个鸡蛋').items[0].qty,2);
});
test('清理后的名称可通过索引查找并保留口味',()=>{
 const index=require('../utils/china-food-index');
 for(const name of ['红烧牛肉方便面','八宝粥（无糖）','牛奶（巧克力味）']) assert.equal(index.lookup(name).name,name);
 assert.equal(index.rows.some(row=>row.name.includes('含调味料')),false);
});
