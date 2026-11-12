const test=require('node:test');
const assert=require('node:assert/strict');
global.wx={getStorageSync(){}};
const state=require('../utils/body-state');
test('30 day changes use last measurement per day, independent fields and seven day separation',()=>{
 const rows=[{date:'2026-11-03',ts:4,kg:61},{date:'2026-10-05',ts:1,kg:65},{date:'2026-10-05',ts:2,kg:64},{date:'2026-10-04',ts:0,kg:70},{date:'2026-11-02',ts:3,waistCm:80}];
 const result=state.changes(rows,'2026-11-03');assert.equal(result[0].text,'-3.0 kg');assert.equal(result[0].count,2);assert.match(result[1].text,/暂无/);assert.equal(result[2].count,0);
 assert.match(state.changes([{date:'2026-11-03',kg:60},{date:'2026-10-28',kg:62}],'2026-11-03')[0].text,/暂无/);
});
test('seven complete days exclude today and missing days; null nutrients stay unknown',()=>{
 const result=state.summaries([{date:'2026-11-03',kcal:999},{date:'2026-10-27',kcal:100,protein:null,carb:0,fat:2},{date:'2026-11-02',kcal:300,protein:10,carb:20,fat:3},{date:'2026-10-26',kcal:999}], [{date:'2026-11-03',ml:999},{date:'2026-10-27',ml:200},{date:'2026-10-27',ml:300},{date:'2026-11-02',ml:100},{date:'2026-11-01',ml:NaN}], '2026-11-03');
 assert.equal(result.foodDays,2);assert.equal(result.energyAverage,'200 kcal');assert.equal(result.nutrients[1].text,'10.0 g');assert.match(result.nutrients[1].note,/不完整/);assert.equal(result.incompleteDays,1);assert.equal(result.waterAverage,'300 ml');assert.equal(result.period,'2026-10-27 至 2026-11-02');
});
test('empty summaries and freshness never imply zero intake',()=>{
 const result=state.summaries([],[],'2026-01-03');assert.equal(result.energyAverage,'—');assert.equal(result.waterTotal,'—');assert.equal(result.nutrients[0].text,'—');assert.equal(result.period,'2025-12-27 至 2026-01-02');
 assert.match(state.measurementDate({value:60,date:''},'2026-11-03'),/日期未知/);assert.match(state.measurementDate({value:60,date:'2026-10-03'},'2026-11-03'),/较久/);assert.equal(state.dayNumber('2026-02-30'),null);
});
test('summary reads preserve legacy missing macros without modifying stored records',async()=>{
 const rows=[{id:'1',name:'食物',date:'2026-11-02',kcal:100,createdAt:1}];wx.getStorageSync=()=>rows;
 const store=require('../utils/record-store').createRecordStore({storageKey:'cal_records'});assert.equal((await store.list({preserveMissing:true})).data[0].protein,null);assert.equal(Object.hasOwn(rows[0],'protein'),false);
});
