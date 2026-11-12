const test=require('node:test'),assert=require('node:assert/strict');
const {festival}=require('../utils/festival');
const dates=require('../utils/festival-dates');
const animation=require('../utils/mascot-animation');
function local(text){const [y,m,d]=text.split('-').map(Number);return new Date(y,m-1,d,12);}
test('2026节日及春节七天边界',()=>{
 for(let i=-1;i<=7;i++){const d=new Date(2026,1,17+i,12);assert.equal(festival(d),i>=0&&i<7?'spring':null);}
 for(const [name,day] of [['lantern','2026-03-03'],['dragonboat','2026-06-19'],['midautumn','2026-09-25'],['halloween','2026-10-31'],['christmas','2026-12-25']]){
  const d=local(day);assert.equal(festival(d),name);d.setDate(d.getDate()+1);assert.equal(festival(d),null);
 }
 assert.equal(festival(new Date(NaN)),null);assert.equal(festival(local('2110-02-01')),null);
});
test('离线农历数据覆盖2020–2100且节日图集帧可循环',()=>{
 for(const [name,list] of Object.entries(dates)){assert.equal(list.length,81);for(const day of list)assert.equal(festival(local(day)),name);}
 for(const key of ['spring','lantern','dragonboat','midautumn','halloween','christmas']){
  assert.equal(animation.assetFor(key),animation.FESTIVAL_ASSET);assert.equal(animation.CLIPS[key].length,6);assert.deepEqual(animation.frameAt(key,animation.duration(key)),animation.frameAt(key,0));
 }
 assert.equal(animation.assetFor('water'),animation.ASSET);
});
test('节日待机只替换空闲状态，保留提醒与夜间状态',t=>{
 let def;const previous=global.Page;t.after(()=>{global.Page=previous});global.Page=v=>{def=v};
 delete require.cache[require.resolve('../pages/index/index')];require('../pages/index/index');
 const original=Date;class FixedDate extends original{constructor(...args){super(...(args.length?args:[2026,9,31,14]));}static now(){return new original(2026,9,31,14).getTime();}}
 t.mock.method(global,'Date',FixedDate);
 const p={...def,homeVisible:true,data:{...structuredClone(def.data),diet:{kind:'neutral'},totalCount:0,waterTotalText:'1500',waterGoalText:'1500'}};p.setData=x=>Object.assign(p.data,x);
 p.updateMascot();assert.equal(p.data.mascotState,'halloween');p.mascotEvent='success';p.updateMascot();assert.equal(p.data.mascotState,'success');p.mascotEvent=null;
});
test('节日与常规动作切换时使用各自图集并等待加载',t=>{
 let def;const old=global.Component;t.after(()=>{global.Component=old});global.Component=v=>{def=v};
 delete require.cache[require.resolve('../mascot-motion/components/egg-animation/egg-animation')];require('../mascot-motion/components/egg-animation/egg-animation');
 const pet={...def.methods,data:structuredClone(def.data),properties:{state:'idle'},alive:true,visible:true};pet.setData=x=>Object.assign(pet.data,x);
 pet.data.ready=true;pet.changeState('spring');assert.equal(pet.data.atlas,animation.FESTIVAL_ASSET);assert.equal(pet.data.ready,false);assert.equal(pet.data.row,animation.ROWS.spring);
 pet.handleAtlasLoad();assert.equal(pet.data.ready,true);pet.changeState('water');assert.equal(pet.data.atlas,animation.ASSET);assert.equal(pet.data.ready,false);assert.equal(pet.data.row,animation.ROWS.water);pet.stop();
});
