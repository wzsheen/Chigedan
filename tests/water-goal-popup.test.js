const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();let definition;
global.wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),showToast(){},hideKeyboard(){},navigateTo(){throw Error('must not navigate');}};
global.Page=value=>{definition=value;};
require('../pages/index/index');
function page(){return {...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch);}};}
test('card edits goal in a popup; cancel and invalid input never alter saved goal or water entries',()=>{
 storage.clear();storage.set('cal_water',[{ts:1,ml:250}]);storage.set('cal_water_goal',1500);const before=JSON.stringify(storage.get('cal_water'));const p=page();
 p.handleOpenWater();assert.equal(p.data.waterGoalOpen,true);assert.equal(p.data.waterGoalDraft,'1500');p.inputWaterGoal({detail:{value:'2000'}});p.closeWaterGoal();assert.equal(storage.get('cal_water_goal'),1500);
 p.handleOpenWater();assert.equal(p.data.waterGoalDraft,'1500');
 for(const value of ['', '0','299','6001','abc','1000.5']){p.inputWaterGoal({detail:{value}});p.saveWaterGoal();assert.equal(p.data.waterGoalOpen,true);assert.ok(p.data.waterGoalError);assert.equal(storage.get('cal_water_goal'),1500);}
 assert.equal(JSON.stringify(storage.get('cal_water')),before);
});
test('save updates home immediately, clamps visual progress and preserves records; failure remains retryable',()=>{
 storage.clear();storage.set('cal_water_goal',1500);const p=page();p.setData({waterTotalText:'500'});p.handleOpenWater();p.inputWaterGoal({detail:{value:'2000'}});p.saveWaterGoal();assert.equal(storage.get('cal_water_goal'),2000);assert.equal(p.data.waterGoalOpen,false);assert.equal(p.data.waterGoalText,'2000');assert.equal(p.data.waterBarStyle,'width: 25%;');
 p.handleOpenWater();p.inputWaterGoal({detail:{value:'300'}});p.saveWaterGoal();assert.equal(p.data.waterBarStyle,'width: 100%;');assert.equal(storage.has('cal_water'),false);
 p.handleOpenWater();const original=wx.setStorageSync;wx.setStorageSync=()=>{throw Error('full');};try{p.inputWaterGoal({detail:{value:'1700'}});p.saveWaterGoal();assert.equal(p.data.waterGoalOpen,true);assert.match(p.data.waterGoalError,/保存失败/);assert.equal(storage.get('cal_water_goal'),300);}finally{wx.setStorageSync=original;}
});
test('step controls respect 300 to 6000 bounds without saving drafts',()=>{
 const p=page();p.setData({waterGoalDraft:'300'});p.stepWaterGoal({currentTarget:{dataset:{delta:-100}}});assert.equal(p.data.waterGoalDraft,'300');p.setData({waterGoalDraft:'6000'});p.stepWaterGoal({currentTarget:{dataset:{delta:100}}});assert.equal(p.data.waterGoalDraft,'6000');
});

test('热区到「2000 ml ▾」字尾为止：图标、标题、数字行可点，＋水 按钮独占自己的区域',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const wxml=fs.readFileSync(path.join(__dirname,'..','pages','index','index.wxml'),'utf8');
 const wxss=fs.readFileSync(path.join(__dirname,'..','pages','index','index.wxss'),'utf8');
 const card=wxml.match(/<view class="water-card">[\s\S]*?<\/view>\s*<view class="insight"/)[0];
 assert.ok(!/water-goal-zone/.test(wxml),'不再用百分比热区层，边界要跟着文字走');
 assert.ok(!/water-goal-zone/.test(wxss),'样式里也要清掉百分比热区');
 assert.match(card,/class="water-symbol"[^>]*bindtap="handleOpenWater"/,'图标区域可点开目标弹窗');
 assert.match(card,/class="water-title"[^>]*bindtap="handleOpenWater"/,'标题「饮水」可点开目标弹窗');
 assert.match(card,/class="water-amount"[^>]*bindtap="handleOpenWater"/,'数字行（含 ▾）整段可点，热区右边界自然停在字尾');
 assert.ok(!/class="water-copy"[^>]*bindtap/.test(card),'整块文案区不能绑点击，否则 ＋水 附近的空白也会弹窗');
 assert.match(card,/class="water-add"[^>]*catchtap="handleWaterAdd"/,'＋水 必须用 catchtap，不能冒泡到数字行');
 assert.match(card,/class="water-amount"[\s\S]*?ml ▾/,'▾ 要在可点区域里');
 const amount=wxss.match(/\.water-amount\{([^}]*)\}/)[1];
 assert.match(amount,/position:relative/,'热区基准是数字行本身');
 assert.match(wxss,/\.water-amount::after\{[^}]*position:absolute/,'用 ::after 把数字行的上下补厚，手指不用点得很准');
 assert.match(wxss,/\.water-add\{[^}]*z-index:3/,'＋水 层级要高于数字行，窄屏也不会被盖住');
});
