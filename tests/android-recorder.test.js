const test=require('node:test');
const assert=require('node:assert/strict');
function setup(t,auth){
    const previous=global.wx; t.after(()=>{global.wx=previous;});
    const events={};let starts=0;
    global.wx={...auth,getRecorderManager:()=>({
        onStart:fn=>{events.start=fn;},onStop:fn=>{events.stop=fn;},onError:fn=>{events.error=fn;},
        start(){starts++;queueMicrotask(()=>events.start());},
        stop(){queueMicrotask(()=>events.stop({tempFilePath:'/native-record.mp3',duration:1200}));},
    }),showModal(){}};
    delete require.cache[require.resolve('../utils/recorder')];
    const recorder=require('../utils/recorder');
    t.after(()=>recorder.stop(true));
    return {recorder,starts:()=>starts};
}
test('Android unavailable WeChat scope API falls through to native recorder; temporary audio remains usable',async t=>{
    const {recorder,starts}=setup(t,{getSetting:options=>options.fail({errMsg:'getSetting:fail not supported'})});
    let result;
    assert.equal(await recorder.start(value=>{result=value;}),true);
    await recorder.stop(false);
    assert.equal(starts(),1);assert.equal(result.ok,true);
    assert.equal(result.path,'/native-record.mp3');assert.equal(result.temp,true);
});
test('Android without scope authorization APIs can use the native permission flow',async t=>{
    const {recorder}=setup(t,{});
    assert.equal(await recorder.start(()=>{}),true);
    await recorder.stop(true);
    assert.equal(recorder.isActive(),false);
});
test('explicit microphone denial is not bypassed and clears the recording session',async t=>{
    const {recorder,starts}=setup(t,{
        getSetting:options=>options.success({authSetting:{'scope.record':false}}),
        authorize:options=>options.fail({errMsg:'authorize:fail auth deny'}),
    });
    let result;
    assert.equal(await recorder.start(value=>{result=value;}),false);
    assert.equal(starts(),0);assert.equal(recorder.isActive(),false);
    assert.equal(result.ok,false);assert.match(result.error,/麦克风权限/);
});
