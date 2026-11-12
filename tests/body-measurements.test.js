const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();let pageDefinition,componentDefinition,notifications=0;
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),showToast(){},navigateTo(){}};
global.getApp=()=>({globalData:{},markBodyChanged(){notifications++;}});
global.Page=value=>{pageDefinition=value;};global.Component=value=>{componentDefinition=value;};
const body=require('../utils/body-measurements');
const date=require('../utils/record-store').formatDate(new Date());
function page(name){const file='../pages/'+name+'/'+name;delete require.cache[require.resolve(file)];require(file);return {...pageDefinition,data:structuredClone(pageDefinition.data),setData(patch){Object.assign(this.data,patch);}};}
function editor(mode){delete require.cache[require.resolve('../components/body-editor/body-editor')];require('../components/body-editor/body-editor');const events=[];return {...componentDefinition.methods,properties:{visible:true,mode,theme:'light'},data:structuredClone(componentDefinition.data),setData(patch){Object.assign(this.data,patch);},triggerEvent(name,value){events.push({name,value});},events};}

test('optional measurements keep their own dates and do not create phantom weight records',async()=>{
 storage.clear();storage.set('cal_profile',{height:170,weight:65,age:30,sex:'male'});storage.set('cal_goal',1800);notifications=0;
 const result=await body.save({waistCm:80,hipCm:95});assert.equal(result.error,null);assert.equal(storage.has('cal_weight'),false);
 const current=body.current();assert.equal(current.waistCm.value,80);assert.equal(current.waistCm.date,date);assert.equal(current.kg.measured,false);assert.equal(current.kg.date,'');assert.equal(storage.get('cal_goal'),1800);assert.equal(notifications,1);
 const p=page('weight');p.onShow();assert.equal(p.data.ratioText,'0.47');assert.equal(p.data.bmiText,'22.5');assert.equal(p.data.recent.length,1);assert.equal(p.data.hipText,'95 cm');assert.ok(p.data.weightDate.includes('基础资料'));
});
test('weight and height update shared profile values while keeping goals and legacy records',async()=>{
 storage.clear();const old={ts:Date.now()-86400000,date:require('../utils/record-store').formatDate(new Date(Date.now()-86400000)),kg:64};storage.set('cal_weight',[old]);storage.set('cal_profile',{height:170,activity:'high',goalType:'gain'});storage.set('cal_goal',2300);
 const result=await body.save({kg:63,heightCm:171});assert.equal(result.error,null);assert.equal(storage.get('cal_weight').length,2);assert.equal(storage.get('cal_profile').height,171);assert.equal(storage.get('cal_profile').weight,63);assert.equal(storage.get('cal_profile').activity,'high');assert.equal(storage.get('cal_goal'),2300);assert.equal(body.history().length,2);
});
test('empty or invalid drafts are rejected before any writes and partial storage failure rolls back',async()=>{
 storage.clear();for(const input of [{},{waistCm:0},{kg:'abc'},{heightCm:300},{hipCm:999}])assert.ok((await body.save(input)).error);
 assert.equal(storage.size,0);const old={height:170};storage.set('cal_profile',old);const original=wx.setStorageSync;let failed=false;
 wx.setStorageSync=(key,value)=>{if(key==='cal_weight' && !failed){failed=true;throw Error('quota');}original(key,value);};
 try{assert.ok((await body.save({kg:60,waistCm:80})).error);}finally{wx.setStorageSync=original;}
 assert.equal(storage.has(body.KEY),false);assert.equal(storage.has('cal_weight'),false);assert.deepEqual(storage.get('cal_profile'),old);
});
test('shared editor converts jin, ignores blank optional fields and suppresses repeat saves',async()=>{
 storage.clear();storage.set('cal_weight_unit','jin');storage.set('cal_profile',{weight:60});const e=editor('weight');e.open();assert.equal(e.data.drafts.kg,'120.0');assert.equal(e.data.fields.length,1);e.input({currentTarget:{dataset:{key:'kg'}},detail:{value:'124'}});const pending=e.save();await e.save();await pending;
 assert.equal(storage.get('cal_weight').length,1);assert.equal(storage.get('cal_weight')[0].kg,62);assert.equal(e.events.filter(row=>row.name==='saved').length,1);
 const all=editor('all');all.open();assert.equal(all.data.drafts.kg,'');all.input({currentTarget:{dataset:{key:'waistCm'}},detail:{value:'82'}});await all.save();assert.equal(storage.get('cal_weight').length,1);assert.equal(body.list()[0].waistCm,82);
});
test('body backup strips unrelated fields and JSON/text exports restore optional measurements',async()=>{
 storage.clear();await body.save({waistCm:82,hipCm:96,heightCm:170});const data=page('data');const json=data.buildExportJson([],[],[]);const parsed=require('../utils/importer').parseImport(json);assert.equal(parsed.measurements.length,1);assert.equal(parsed.measurements[0].waistCm,82);
 const text=data.buildExportText([],[],[]);const parsedText=require('../utils/importer').parseImport(text);assert.equal(parsedText.measurements[0].hipCm,96);
 const bad=body.sanitize([{date,waistCm:82,apiKey:'secret',kg:-1},{date:'2099-01-01',waistCm:82}]);assert.equal(bad.length,1);assert.equal(bad[0].apiKey,undefined);assert.equal(bad[0].kg,undefined);
 storage.clear();data.writeImport(parsed,true);assert.equal(body.list()[0].hipCm,96);assert.equal(storage.get('cal_profile').height,170);data.writeImport(parsed,false);assert.equal(body.list().length,1);
});

test('记变化只列体重/腰围/臀围三项，身高不进这一栏且留空项不写入',async()=>{
 storage.clear();storage.set('cal_profile',{height:170,weight:60});storage.set('cal_weight',[{ts:Date.now()-86400000,date:'2026-11-01',kg:60.5}]);
 const e=editor('change');e.open();
 assert.deepEqual(e.data.fields.map(row=>row.key),['kg','waistCm','hipCm']);
 assert.equal(e.data.fields.some(row=>row.key==='heightCm'),false,'身高是固定资料，不该混进「记变化」');
 assert.equal(e.data.drafts.kg,'','不预填旧体重，否则只改腰围时会把上次数值记到今天');
 e.input({currentTarget:{dataset:{key:'waistCm'}},detail:{value:'82'}});
 await e.save();
 const saved=body.list()[0];
 assert.equal(saved.waistCm,82);
 assert.equal(saved.kg,undefined,'没填的体重不写入');
 assert.equal(storage.get('cal_profile').height,170);
});
