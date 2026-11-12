const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const animation=require('../utils/mascot-animation');
const {resolve}=require('../utils/mascot-state');

test('action rows share the standing body size and floor while airborne success frames stay raised',()=>{
    for(const [state,geometry] of Object.entries(animation.GEOMETRY)){
        const pose=animation.presentation(state);
        assert.ok(Math.abs(geometry.height*pose.scale*.75-144)<.001,state+' body size');
        const translation=(200-geometry.floor)*.75*pose.scale;
        const floor=150+(geometry.floor*.75-150)*pose.scale+translation;
        assert.ok(Math.abs(floor-150)<.001,state+' floor');
    }
    assert.equal(animation.presentation('rest').style,animation.presentation('idle').style);
    assert.ok(150+(165*.75-150)*animation.presentation('success').scale<125,'jump frame retains intentional lift');
});

test('state priorities preserve health rules and transient actions',()=>{
    const base={kind:'good',count:2,hour:14,water:1500,waterGoal:1500};
    assert.equal(resolve(base),'balanced');
    assert.equal(resolve({...base,kind:'adjust',water:0}),'adjust');
    assert.equal(resolve({...base,water:0}),'balanced');
    assert.equal(resolve({...base,hour:22}),'sleep');
    assert.equal(resolve({...base,hour:22,event:'water'}),'water');
    assert.equal(resolve({...base,hour:22,event:'success'}),'success');
    assert.equal(resolve({...base,hour:8,count:0}),'idle');
});

test('home reminders play three rounds then idle, rotate after 30 seconds and preserve cooldown across navigation',t=>{
    let definition,now=1000,seq=0;
    const timers=new Map();
    t.mock.method(Date,'now',()=>now);
    t.mock.method(Date.prototype,'getHours',()=>14);
    t.mock.method(global,'setTimeout',(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;});
    t.mock.method(global,'clearTimeout',id=>timers.delete(id));
    const previous=global.Page;t.after(()=>{global.Page=previous;});
    global.Page=value=>{definition=value;};
    delete require.cache[require.resolve('../pages/index/index')];require('../pages/index/index');
    function home(){
        const instance={...definition,homeVisible:true,data:{...structuredClone(definition.data),diet:{kind:'adjust'},totalCount:1,waterTotalText:'0',waterGoalText:'1500'}};
        instance.setData=patch=>Object.assign(instance.data,patch);return instance;
    }
    function expire(instance){const timer=timers.get(instance.mascotTimer);timers.delete(instance.mascotTimer);now+=timer.ms;timer.fn();}
    const first=home();first.updateMascot();
    assert.equal(first.data.mascotState,'water');
    assert.equal(timers.get(first.mascotTimer).ms,animation.duration('water')*3);
    expire(first);assert.equal(first.data.mascotState,'idle');
    assert.equal(timers.get(first.mascotTimer).ms,30000);
    first.updateMascot();assert.equal(first.data.mascotState,'idle');
    expire(first);assert.equal(first.data.mascotState,'adjust');
    assert.equal(timers.get(first.mascotTimer).ms,animation.duration('adjust')*3);
    first.playMascot('success');assert.equal(first.data.mascotState,'success');
    assert.equal(timers.get(first.mascotTimer).ms,animation.duration('success')*3);
    expire(first);expire(first);assert.equal(first.data.mascotState,'idle');
    const reopened=home();reopened.updateMascot();assert.equal(reopened.data.mascotState,'idle');
    now=1000+20*60000;reopened.updateMascot();assert.equal(reopened.data.mascotState,'water');
    reopened.playMascot('water');assert.equal(reopened.data.mascotEventToken,2,'manual water action bypasses cooldown');
    reopened.onHide();assert.equal(timers.size,0);
    now+=30*60000;reopened.updateMascot();assert.equal(timers.size,0,'hidden pages cannot start reminders');
});

test('water reminder eligibility excludes night, achieved goals and missing data',()=>{
    const {shouldRemindWater}=require('../utils/mascot-state');
    const base={kind:'good',count:1,hour:14,water:0,waterGoal:1500};
    assert.equal(shouldRemindWater(base),true);
    for(const patch of [{hour:8},{hour:22},{water:1500},{water:NaN},{waterGoal:0}])assert.equal(shouldRemindWater({...base,...patch}),false);
});

test('every clip selects valid atlas cells and loops at its exact duration',()=>{
    for(const state of Object.keys(animation.CLIPS)){
        const length=animation.duration(state);
        let elapsed=0;
        for(const pose of animation.CLIPS[state]){
            const actual=animation.frameAt(state,elapsed);
            assert.equal(actual.row,pose.row);assert.equal(actual.column,pose.column);
            assert.equal(actual.remaining,pose.ms);
            const row=Object.keys(animation.ROWS).find(key=>animation.ROWS[key]===actual.row);
            assert.ok(actual.column<animation.COUNTS[row]);
            elapsed+=pose.ms;
        }
        assert.equal(elapsed,length);
        assert.deepEqual(animation.frameAt(state,length),animation.frameAt(state,0));
    }
    assert.deepEqual(animation.frameAt('__proto__',0),animation.frameAt('idle',0));
    assert.deepEqual(animation.frameAt('idle',NaN),animation.frameAt('idle',0));
    assert.equal(animation.CLIPS.idle.some(f=>f.row===animation.ROWS.waving),true);
});

test('animation timers restart on state/events and stop on hide or detach',t=>{
    let definition,now=1000,seq=0;
    const timers=new Map();
    t.mock.method(Date,'now',()=>now);
    t.mock.method(global,'setTimeout',(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;});
    t.mock.method(global,'clearTimeout',id=>timers.delete(id));
    const previous=global.Component;
    global.Component=value=>{definition=value;};
    t.after(()=>{global.Component=previous;});
    const filename='../mascot-motion/components/egg-animation/egg-animation';
    delete require.cache[require.resolve(filename)];require(filename);
    const pet={...definition.methods,data:structuredClone(definition.data),properties:{state:'idle'}};
    pet.setData=patch=>Object.assign(pet.data,patch);
    definition.lifetimes.attached.call(pet);
    assert.equal(timers.size,0,'wait for image load');
    pet.handleAtlasLoad();assert.equal(timers.size,1);
    now+=100;pet.changeState('water');
    assert.equal(pet.data.row,animation.ROWS.water);assert.equal(pet.data.column,0);assert.equal(timers.size,1);
    now+=500;const timer=timers.get(pet.frameTimer);timers.delete(pet.frameTimer);timer.fn();
    assert.equal(pet.data.column,1);
    now+=100;definition.properties.eventToken.observer.call(pet);
    assert.equal(pet.data.column,0,'repeat water event restarts the gesture');assert.equal(timers.size,1);
    definition.pageLifetimes.hide.call(pet);assert.equal(timers.size,0);
    now+=10000;definition.pageLifetimes.show.call(pet);assert.equal(timers.size,1);assert.equal(pet.data.column,0);
    definition.lifetimes.detached.call(pet);assert.equal(timers.size,0);
    pet.handleAtlasLoad();assert.equal(timers.size,0,'late load cannot resurrect a detached player');
});

test('home transient events expire after a complete clip and repeated events restart',t=>{
    let definition,seq=0;
    const timers=new Map();
    t.mock.method(global,'setTimeout',(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;});
    t.mock.method(global,'clearTimeout',id=>timers.delete(id));
    global.wx={getStorageSync(){},setStorageSync(){}};
    global.getApp=()=>({globalData:{}});
    const previous=global.Page;
    global.Page=value=>{definition=value;};t.after(()=>{global.Page=previous;});
    delete require.cache[require.resolve('../pages/index/index')];require('../pages/index/index');
    const home={...definition,data:structuredClone(definition.data)};
    home.setData=patch=>Object.assign(home.data,patch);
    home.playMascot('success');assert.equal(home.data.mascotState,'success');
    assert.equal(timers.get(home.mascotTimer).ms,animation.duration('success')*3);
    home.playMascot('water');home.playMascot('water');
    assert.equal(home.data.mascotEventToken,3);assert.equal(timers.size,1);
    const end=timers.get(home.mascotTimer);timers.delete(home.mascotTimer);end.fn();
    assert.equal(home.mascotEvent,null);assert.notEqual(home.data.mascotState,'success');
    home.onUnload();assert.equal(timers.size,0);
});

test('packaged atlas dimensions, clip metadata, and async placeholder are complete',()=>{
    const meta=JSON.parse(fs.readFileSync(path.join(root,'mascot-motion/assets/egg-atlas.json'),'utf8'));
    const png=fs.readFileSync(path.join(root,animation.ASSET.slice(1)));
    assert.equal(png.readUInt32BE(16),meta.width);assert.equal(png.readUInt32BE(20),meta.height);
    for(const row of meta.rows){assert.equal(animation.ROWS[row.state],row.row);assert.equal(animation.COUNTS[row.state],row.count);}
    const wrapper=JSON.parse(fs.readFileSync(path.join(root,'components/egg-mascot/egg-mascot.json'),'utf8'));
    assert.equal(wrapper.componentPlaceholder['egg-animation'],'egg-static');
    const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
    assert.equal(app.subPackages.some(p=>p.name==='mascot-motion'),true);
    assert.ok(png.byteLength<2*1024*1024);
});

test('home clock is cleared on hide and late refresh cannot start a hidden animation',async t=>{
    let definition,finish,seq=0;
    const clocks=new Map(),events={globalData:{mascotEvent:{kind:'success',time:Date.now()}}};
    t.mock.method(global,'setInterval',(fn,ms)=>{const id=++seq;clocks.set(id,{fn,ms});return id;});
    t.mock.method(global,'clearInterval',id=>clocks.delete(id));
    global.wx={getStorageSync(){},setStorageSync(){}};global.getApp=()=>events;
    const previous=global.Page;global.Page=value=>{definition=value;};t.after(()=>{global.Page=previous;});
    delete require.cache[require.resolve('../pages/index/index')];require('../pages/index/index');
    const home={...definition,data:structuredClone(definition.data)};
    home.setData=patch=>Object.assign(home.data,patch);
    home.readBodyRevision=()=>0;
    home.refresh=()=>new Promise(resolve=>{finish=resolve;});
    home.onShow();assert.equal(clocks.size,1);assert.equal(clocks.get(home.mascotClock).ms,60000);
    home.onHide();assert.equal(clocks.size,0);
    finish();await Promise.resolve();
    assert.equal(home.data.mascotEventToken,0);
    assert.equal(events.globalData.mascotEvent.kind,'success');
    home.refresh=()=>Promise.resolve();home.onShow();await Promise.resolve();
    assert.equal(home.data.mascotState,'success');assert.equal(home.data.mascotEventToken,1);
    home.onUnload();assert.equal(clocks.size,0);
});
