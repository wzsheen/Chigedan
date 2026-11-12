const test=require('node:test');
const assert=require('node:assert/strict');
const storage=new Map();
global.wx={getStorageSync:key=>structuredClone(storage.get(key)),setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),removeStorageSync:key=>storage.delete(key),showToast(){}};
const settings=require('../utils/ai-settings');
const runtime=require('../utils/ai-runtime');
const config={provider:'zhipu',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.6v-flash',apiKey:'test-secret'};
const food={name:'鸡蛋',unit:'个',qty:2,kcal:140,protein:12,carb:1,fat:10};
function configure(kind,value=config){settings.save(kind,value);settings.setEnabled(kind,true);}

test('saved configurations do not run until enabled; edits and clearing stop only that service',async()=>{
    storage.clear();let calls=0;wx.request=()=>{calls++;};
    settings.save('vision',config);assert.equal(settings.isEnabled('vision'),false);
    await assert.rejects(runtime.photo('/photo.jpg'),/启动视觉/);assert.equal(calls,0);
    configure('vision');configure('speech',{...config,model:'glm-asr-2512'});
    assert.equal(settings.isEnabled('vision'),true);assert.equal(settings.isEnabled('speech'),true);
    settings.save('vision',{...config,apiKey:'changed'});
    assert.equal(settings.isEnabled('vision'),false);assert.equal(settings.isEnabled('speech'),true);
    settings.clear('speech');assert.equal(settings.isEnabled('speech'),false);
});

test('start button saves current draft, survives reopening and can stop without a network call',()=>{
    storage.clear();let definition;global.Page=value=>{definition=value;};
    require('../pages/ai/ai');
    function page(){const instance={...definition,data:structuredClone(definition.data)};instance.setData=patch=>Object.assign(instance.data,patch);instance.onLoad();return instance;}
    const p=page();
    for(const field of ['baseUrl','model','apiKey'])p.handleInput({currentTarget:{dataset:{field}},detail:{value:config[field]}});
    assert.equal(p.data.configured,true);assert.equal(p.data.enabled,false);
    p.handleToggleService();assert.equal(p.data.enabled,true);assert.equal(p.data.dirty,false);
    const reopened=page();assert.equal(reopened.data.enabled,true);assert.equal(reopened.data.statusText,'已启动');
    reopened.handleToggleService();assert.equal(reopened.data.enabled,false);assert.equal(settings.read().vision.apiKey,config.apiKey);
});

test('photo recognition sends base64 image to enabled model and validates structured totals',async()=>{
    storage.clear();configure('vision');let request;
    wx.compressImage=options=>options.success({tempFilePath:'/compressed.jpg'});
    wx.getFileSystemManager=()=>({readFile:options=>options.success({data:'aW1hZ2U='})});
    wx.request=options=>{request=options;options.success({statusCode:200,data:{choices:[{message:{content:JSON.stringify({items:[food]})}}]}});};
    const result=await require('../utils/photo-recognize').recognize('/photo.jpg');
    assert.equal(result.ok,true);assert.deepEqual(result.item,food);
    assert.equal(request.url,config.baseUrl+'/chat/completions');assert.equal(request.data.model,config.model);
    assert.equal(request.data.messages[0].content[1].image_url.url,'data:image/jpeg;base64,aW1hZ2U=');
    assert.equal(request.header.Authorization,'Bearer test-secret');
    assert.deepEqual(runtime.parseItems('{"items":[{"name":"invalid","qty":1}]}'),[]);
    assert.throws(()=>runtime.parseItems('not json'));
});

test('speech uploads recording as multipart, keeps transcript and converts explicit known portions',async()=>{
    storage.clear();configure('speech',{...config,provider:'siliconflow',baseUrl:'https://api.siliconflow.cn/v1',model:'FunAudioLLM/SenseVoiceSmall'});let upload;
    wx.uploadFile=options=>{upload=options;options.success({statusCode:200,data:JSON.stringify({text:'中午吃了一碗米饭、两个鸡蛋和半个苹果，还有神秘菜。'})});};
    const result=await require('../utils/voice-recognize').recognize({path:'/note.mp3',duration:10});
    assert.equal(result.ok,true);assert.ok(result.text.includes('神秘菜'));
    assert.equal(upload.name,'file');assert.equal(upload.filePath,'/note.mp3');
    assert.equal(upload.url,'https://api.siliconflow.cn/v1/audio/transcriptions');
    assert.equal(upload.formData.model,'FunAudioLLM/SenseVoiceSmall');
    assert.equal(upload.header['Content-Type'],undefined);
    assert.equal(result.items.find(item=>item.name==='米饭').qty,1);
    assert.equal(result.items.find(item=>item.name==='鸡蛋').qty,2);
    assert.equal(result.items.find(item=>item.name==='苹果').qty,.5);
    assert.equal(result.items.some(item=>item.name==='神秘菜'),false);
    assert.deepEqual(runtime.transcriptItems('吃了米饭，数量不知道'),[]);
});

test('recognition failures never expose raw service errors and GLM long recordings are rejected',async()=>{
    storage.clear();configure('speech');
    wx.uploadFile=options=>options.success({statusCode:401,data:JSON.stringify({error:{message:'test-secret'}})});
    const failed=await require('../utils/voice-recognize').recognize({path:'/note.mp3',duration:10});
    assert.equal(failed.ok,false);assert.equal(failed.error.includes('test-secret'),false);
    await assert.rejects(runtime.speech({path:'/note.mp3',duration:31}),/30 秒/);
});
