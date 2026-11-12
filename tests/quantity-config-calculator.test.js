const test=require('node:test');const assert=require('node:assert/strict');
const storage=new Map();let definition;
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),showToast(){},navigateBack(){}};
global.Page=value=>{definition=value;};global.getApp=()=>({globalData:{}});
function page(name){const file='../pages/'+name+'/'+name;delete require.cache[require.resolve(file)];require(file);return {...definition,data:structuredClone(definition.data),setData(patch,callback){Object.assign(this.data,patch);if(callback)callback();}};}
const parser=require('../utils/voice-parser');const {calculate}=require('../utils/calculator');
test('small buns use a separate 32.5g reference and per100g nutrition, personal confirmation wins',()=>{
 storage.clear();const item=parser.parse('早上吃了四个小笼包。').items[0];assert.equal(item.qty,4);assert.equal(item.weightBasis.gramsPerUnit,32.5);assert.ok(Math.abs(item.kcal-303.42)<1e-8);assert.equal(item.totalGrams,130);assert.match(item.note,/233.4kcal\/100g/);
 const grams=parser.parse('150克小笼包').items[0];assert.ok(Math.abs(grams.kcal-350.1)<1e-8);
 storage.set('cal_foods',[{name:'小笼包',unit:'个',kcal:80,nutrition:{p:3,c:10,f:3}}]);assert.equal(parser.parse('四个小笼包').items[0].kcal,320);
});
test('editing reference unit weight recomputes a draft without writing or rewriting history',()=>{
 storage.clear();const p=page('add'),item=parser.parse('四个小笼包').items[0];p.setData({items:[{...item,perUnit:item.kcal/item.qty,manual:{carb:true,protein:true,fat:true}}]});p.handleEditItem({currentTarget:{dataset:{index:0}}});assert.equal(p.data.formGramsPerUnit,'32.5');p.commitField('formGramsPerUnit','35');assert.ok(Math.abs(Number(p.data.formKcal)-81.69)<.001);
 const built=p.buildItemFromForm();assert.equal(built.error,'');assert.equal(built.item.weightBasis.gramsPerUnit,35);assert.equal(built.item.kcal,326.8);assert.equal(storage.has('cal_records'),false);
});
test('calculator obeys precedence, rejects execution, incomplete input and division by zero',()=>{
 assert.equal(calculate('4×32.5÷100×233.4'),303.42);assert.equal(calculate('10+2×3'),16);assert.equal(calculate('10−3÷2'),8.5);
 for(const value of ['1÷0','1+','1..2','process.exit()','2(3)',''])assert.throws(()=>calculate(value));
 const p=page('add');p.setData({activeField:'formQty',formQty:'4',keypadValue:'4'});for(const key of ['multiply','3','equals'])p.keypadTap({currentTarget:{dataset:{key}}});assert.equal(p.data.formQty,'12');
 p.keypadTap({currentTarget:{dataset:{key:'divide'}}});p.keypadTap({currentTarget:{dataset:{key:'0'}}});p.keypadTap({currentTarget:{dataset:{key:'equals'}}});assert.equal(p.data.formQty,'12');assert.match(p.data.formError,/除以0/);
});
test('JSON and text backups carry portable config, omit credentials and restore only on replace',()=>{
 storage.clear();storage.set('cal_theme','dark');storage.set('cal_weight_unit','jin');storage.set('cal_custom_units',['笼']);storage.set('cal_home_display',{scienceAutoplay:false,mascotAnimation:true,apiKey:'secret'});storage.set('cal_profile',{sex:'male',age:30,height:170.25,weight:65,apiKey:'secret'});
 storage.set('cal_ai_services',{nutrition:{provider:'custom',baseUrl:'https://example.invalid/v1',model:'test-model',apiKey:'secret'}});storage.set('cal_ai_enabled',{nutrition:true});
 const p=page('data'),json=p.buildExportJson([],[],[]),text=p.buildExportText([],[],[]);for(const value of [json,text]){assert.ok(!value.includes('secret'));assert.ok(!value.includes('apiKey'));}
 const importer=require('../utils/importer'),parsed=importer.parseImport(json),parsedText=importer.parseImport(text);assert.equal(parsed.configuration.cal_theme,'dark');assert.equal(parsedText.configuration.cal_weight_unit,'jin');assert.equal(parsedText.profile.height,170.25);assert.equal(parsed.configuration.aiServices.nutrition.model,'test-model');
 p.parsePreview(json);assert.ok(p.importCandidate);
 storage.clear();storage.set('cal_theme','simple');p.writeImport(parsed,false);assert.equal(storage.get('cal_theme'),'simple');p.writeImport(parsed,true);assert.equal(storage.get('cal_theme'),'dark');assert.deepEqual(storage.get('cal_custom_units'),['笼']);assert.equal(storage.get('cal_ai_services').nutrition.apiKey,'');assert.equal(storage.get('cal_ai_enabled').nutrition,false);
});
test('import restores records and config together when a preference write fails',()=>{
 storage.clear();storage.set('cal_theme','simple');storage.set('cal_profile',{height:170});storage.set('cal_records',[]);const p=page('data'),before=JSON.stringify([...storage.entries()]);
 const parsed=require('../utils/importer').parseImport(JSON.stringify({version:3,configuration:{cal_theme:'dark'},records:[],profile:{height:180}}));const original=wx.setStorageSync;let failed=false;wx.setStorageSync=(key,value)=>{if(key==='cal_theme'&&!failed){failed=true;throw Error('quota');}original(key,value);};try{assert.throws(()=>p.writeImport(parsed,true));}finally{wx.setStorageSync=original;}assert.equal(JSON.stringify([...storage.entries()]),before);
});
test('AI estimates require explicit unit weight plus per100g basis and reject legacy unit totals',async()=>{
 storage.clear();const settings=require('../utils/ai-settings');settings.save('nutrition',{provider:'custom',baseUrl:'https://example.invalid/v1',model:'mock',apiKey:'test'});settings.setEnabled('nutrition',true);
 let body={items:[{name:'自制小吃',unit:'份',gramsPerUnit:50,per100g:{kcal:200,protein:10,carb:20,fat:8}}]};wx.request=r=>r.success({statusCode:200,data:{choices:[{message:{content:JSON.stringify(body)}}]}});
 const runtime=require('../utils/ai-runtime');const value=await runtime.estimateFood('自制小吃','份');assert.equal(value.kcal,100);assert.equal(value.totalGrams,50);
 body={items:[{name:'自制小吃',unit:'份',qty:1,kcal:200,protein:10,carb:20,fat:8}]};await assert.rejects(runtime.estimateFood('自制小吃','份'));
 body={items:[{name:'自制小吃',unit:'份',gramsPerUnit:50,per100g:{kcal:600,protein:10,carb:20,fat:8}}]};await assert.rejects(runtime.estimateFood('自制小吃','份'));
});
