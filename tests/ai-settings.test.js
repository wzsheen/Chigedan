const test = require('node:test');
const assert = require('node:assert/strict');
const storage = new Map();
global.wx = {
    getStorageSync:key=>structuredClone(storage.get(key)),
    setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),
    removeStorageSync:key=>storage.delete(key),
    showToast() {},
};
const ai=require('../utils/ai-settings');
const config={baseUrl:'https://api.example.com/v1/',model:'vision-model',apiKey:'test-key'};
let definition;
global.Page=value=>{definition=value;};
function settingsPage(){
    delete require.cache[require.resolve('../pages/ai/ai')];require('../pages/ai/ai');
    const instance={...definition,data:structuredClone(definition.data)};
    instance.setData=function(patch){Object.assign(this.data,patch);};instance.onLoad();return instance;
}
const change=(field,value)=>({currentTarget:{dataset:{field}},detail:{value}});

test('AI settings normalize, persist independently, and clear only the selected service',()=>{
    storage.clear();
    assert.deepEqual(ai.read(),{vision:ai.emptyConfig(),speech:ai.emptyConfig(),nutrition:ai.emptyConfig()});
    ai.save('vision',config);ai.save('speech',{...config,model:'speech-model'});
    assert.equal(ai.read().vision.baseUrl,'https://api.example.com/v1');
    assert.equal(ai.read().speech.model,'speech-model');
    ai.clear('vision');assert.equal(ai.read().speech.model,'speech-model');assert.equal(ai.read().vision.apiKey,'');
    ai.clear('speech');assert.equal(storage.has(ai.STORAGE_KEY),false);
});

test('invalid URLs, full inference paths and multiline keys are rejected',()=>{
    for(const baseUrl of ['http://api.example.com/v1','https://key@api.example.com/v1','https://api.example.com?key=abc','https://api.example.com/v1/chat/completions','https://api.example.com/v1/audio/transcriptions','']) assert.ok(ai.validate({...config,baseUrl}));
    assert.ok(ai.validate({...config,model:''}));assert.ok(ai.validate({...config,apiKey:'abc\nxyz'}));
    assert.equal(ai.validate({...config,apiKey:''}),'');
    assert.throws(()=>ai.save('tts',config));
});

test('connection check uses only GET models and never sends media or key in URL',async()=>{
    let request;
    wx.request=options=>{request=options;queueMicrotask(()=>options.success({statusCode:200,data:{data:[{id:'vision-model'}]}}));return {abort(){}};};
    const result=await ai.testConnection(config).promise;
    assert.equal(result.ok,true);assert.equal(result.warning,false);
    assert.equal(request.url,'https://api.example.com/v1/models');assert.equal(request.method,'GET');
    assert.equal(request.header.Authorization,'Bearer test-key');assert.equal(request.data,undefined);
    assert.equal(request.url.includes(config.apiKey),false);
});

test('connection errors are sanitized and model absence is reported without inventing capability',async()=>{
    for(const statusCode of [401,403,404,405,429,500]){
        wx.request=options=>{queueMicrotask(()=>options.success({statusCode,data:{error:'echo test-key'}}));return {};};
        const result=await ai.testConnection(config).promise;assert.equal(result.ok,false);assert.equal(result.message.includes('test-key'),false);
    }
    wx.request=options=>{queueMicrotask(()=>options.success({statusCode:200,data:{data:[{id:'other-model'}]}}));return {};};
    assert.equal((await ai.testConnection(config).promise).warning,true);
    wx.request=options=>{queueMicrotask(()=>options.success({statusCode:200,data:'<html>not a model list</html>'}));return {};};
    assert.equal((await ai.testConnection(config).promise).ok,false);
    wx.request=options=>{queueMicrotask(()=>options.fail({errMsg:'request:fail url not in domain list test-key'}));return {};};
    const denied=await ai.testConnection(config).promise;assert.ok(denied.message.includes('域名'));assert.equal(denied.message.includes('test-key'),false);
});

test('drafts survive tab changes, save explicitly, and keys remain masked on hide',()=>{
    storage.clear();const page=settingsPage();
    page.handleInput(change('baseUrl',config.baseUrl));page.handleInput(change('model',config.model));page.handleInput(change('apiKey',config.apiKey));
    assert.equal(storage.has(ai.STORAGE_KEY),false);
    page.handleTab({currentTarget:{dataset:{kind:'speech'}}});page.handleInput(change('model','speech-draft'));
    page.handleTab({currentTarget:{dataset:{kind:'vision'}}});assert.equal(page.data.draft.apiKey,config.apiKey);
    page.handleSave();assert.equal(page.data.dirty,false);assert.equal(ai.read().vision.model,config.model);
    assert.equal(ai.read().speech.model,'');page.handleKeyVisibility();assert.equal(page.data.showKey,true);page.onHide();assert.equal(page.data.showKey,false);
    page.handleClear();assert.equal(ai.read().vision.model,config.model);page.handleClear();assert.equal(ai.read().vision.model,'');
    page.onUnload();
});

test('changing tabs aborts a request and suppresses late diagnostics',async()=>{
    storage.clear();ai.save('vision',config);
    let request,aborted=false;
    wx.request=options=>{request=options;return {abort(){aborted=true;options.fail({errMsg:'abort'});}};};
    const page=settingsPage();page.handleTest();assert.equal(page.data.busy,true);
    page.handleTab({currentTarget:{dataset:{kind:'speech'}}});assert.equal(aborted,true);
    request.success({statusCode:200,data:{data:[{id:'vision-model'}]}});await Promise.resolve();
    assert.equal(page.data.kind,'speech');assert.equal(page.data.result,'');page.onUnload();
});

test('AI keys are absent from diet JSON backup',()=>{
    storage.clear();ai.save('vision',config);ai.save('speech',{...config,apiKey:'speech-test-key'});
    delete require.cache[require.resolve('../pages/data/data')];require('../pages/data/data');
    const page={...definition};const json=page.buildExportJson([],[],[]);
    assert.equal(json.includes('test-key'),false);assert.equal(json.includes(ai.STORAGE_KEY),false);
});

test('provider presets preserve legacy credentials and custom addresses',()=>{
    const providers = require('../utils/ai-providers');
    for (const id of ['openai','deepseek','modelscope','openrouter','zhipu','aliyun','siliconflow','gemini']) {
        const provider = providers.getProvider(id);
        assert.equal(provider.id,id);
        assert.equal(ai.validate({...config,baseUrl:provider.baseUrl}),'');
        assert.ok(provider.keyUrl.startsWith('https://'));
        const migrated = ai.normalize({...config,baseUrl:provider.baseUrl+'/'});
        assert.equal(migrated.provider,id);
        assert.equal(migrated.apiKey,config.apiKey);
    }
    assert.equal(ai.normalize(config).provider,'custom');
    assert.equal(ai.normalize({...config,provider:'unknown'}).provider,'custom');
    assert.equal(ai.normalize({...config,provider:'custom',baseUrl:'https://api.openai.com/v1'}).provider,'custom');
});

test('provider changes clear credentials, cancel checks, and persist independently',async()=>{
    storage.clear(); ai.save('vision',{...config,provider:'openai',baseUrl:'https://api.openai.com/v1'});
    ai.save('speech',{...config,model:'speech-model'});
    const providers = require('../utils/ai-providers');
    let aborted = false;
    wx.request = options => ({abort(){aborted=true;options.fail({errMsg:'abort'});}});
    const page = settingsPage(); page.handleTest();
    page.handleProvider({detail:{value:providers.PROVIDERS.findIndex(item=>item.id==='zhipu')}});
    await Promise.resolve();
    assert.equal(aborted,true); assert.equal(page.data.busy,false); assert.equal(page.data.result,'');
    assert.equal(page.data.draft.provider,'zhipu'); assert.equal(page.data.draft.apiKey,''); assert.equal(page.data.draft.model,'');
    assert.equal(page.data.hasKeyLink,true); assert.equal(ai.read().vision.provider,'openai');
    page.handleInput(change('model','vision-model')); page.handleSave();
    assert.equal(ai.read().vision.provider,'zhipu'); assert.equal(ai.read().speech.apiKey,config.apiKey);
    page.handleTab({currentTarget:{dataset:{kind:'speech'}}}); assert.equal(page.data.draft.model,'speech-model');
    page.handleTab({currentTarget:{dataset:{kind:'vision'}}}); assert.equal(page.data.draft.provider,'zhipu');
    page.handleProvider({detail:{value:providers.PROVIDERS.findIndex(item=>item.id==='custom')}});
    assert.equal(page.data.hasKeyLink,false); assert.equal(page.data.draft.baseUrl,'');
    page.onUnload();
});

test('key acquisition links never include credentials and webview rejects arbitrary URLs',()=>{
    storage.clear(); ai.save('vision',{...config,baseUrl:'https://api.openai.com/v1'});
    let menu,navigation,copied;
    wx.showActionSheet=options=>{menu=options;}; wx.navigateTo=options=>{navigation=options.url;};
    wx.setClipboardData=options=>{copied=options.data;};
    const page=settingsPage(); page.handleKeyVisibility(); page.handleGetApiKey();
    assert.equal(page.data.showKey,false);
    menu.success({tapIndex:0}); assert.equal(navigation,'/pages/ai-provider/ai-provider?provider=openai');
    assert.equal(navigation.includes(config.apiKey),false);
    menu.success({tapIndex:1}); assert.equal(copied,'https://platform.openai.com/api-keys');
    delete require.cache[require.resolve('../pages/ai-provider/ai-provider')]; require('../pages/ai-provider/ai-provider');
    const web={...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch);}};
    web.onLoad({provider:'https://untrusted.example',url:'https://untrusted.example'});
    assert.equal(web.data.url,''); assert.equal(web.data.failed,true);
    web.onLoad({provider:'openai'}); assert.equal(web.data.url,copied);
    web.handleError(); assert.equal(web.data.url,''); assert.equal(web.data.failed,true);
    web.handleCopy(); assert.equal(copied,'https://platform.openai.com/api-keys');
    page.onUnload();
});

test('model discovery works without a model ID and sanitizes the returned list',async()=>{
    let request;
    wx.request=options=>{request=options;queueMicrotask(()=>options.success({statusCode:200,data:{data:[{id:'model-b'},{id:'model-a'},{id:'model-b'},{id:' '}]}}));return {};};
    const result=await ai.fetchModels({...config,model:''}).promise;
    assert.equal(result.ok,true);assert.deepEqual(result.models,['model-a','model-b']);
    assert.equal(request.url,'https://api.example.com/v1/models');assert.equal(request.header.Authorization,'Bearer test-key');
    assert.equal(ai.validate({...config,model:''}).length>0,true);
    assert.equal((await ai.fetchModels({...config,baseUrl:'http://bad',model:''}).promise).ok,false);
    wx.request=options=>{queueMicrotask(()=>options.success({statusCode:200,data:{data:[]}}));return {};};
    const empty=await ai.fetchModels({...config,model:''}).promise;
    assert.equal(empty.ok,true);assert.deepEqual(empty.models,[]);assert.ok(empty.message.includes('为空'));
});

test('model list supports searching, explicit selection and saving without auto-saving',async()=>{
    storage.clear();
    wx.request=options=>{queueMicrotask(()=>options.success({statusCode:200,data:{data:[{id:'vision-model'},{id:'speech-model'}]}}));return {};};
    const page=settingsPage();page.handleInput(change('baseUrl',config.baseUrl));page.handleInput(change('apiKey',config.apiKey));
    page.handleFetchModels();assert.equal(page.data.modelsLoading,true);await Promise.resolve();await Promise.resolve();
    assert.equal(page.data.modelsOpen,true);assert.equal(page.data.modelsLoading,false);assert.equal(storage.has(ai.STORAGE_KEY),false);
    page.handleModelSearch({detail:{value:'VISION'}});assert.deepEqual(page.data.visibleModels,['vision-model']);
    page.handleChooseModel({currentTarget:{dataset:{model:'not-in-list'}}});assert.equal(page.data.draft.model,'');
    page.handleChooseModel({currentTarget:{dataset:{model:'vision-model'}}});
    assert.equal(page.data.draft.model,'vision-model');assert.equal(page.data.modelsOpen,false);assert.equal(storage.has(ai.STORAGE_KEY),false);
    page.handleSave();assert.equal(ai.read().vision.model,'vision-model');
    page.handleInput(change('apiKey','another-key'));assert.deepEqual(page.data.models,[]);
    page.onUnload();
});

test('model discovery aborts and ignores stale responses after configuration edits or hiding',async()=>{
    storage.clear();let request,aborted=false;
    wx.request=options=>{request=options;return {abort(){aborted=true;}};};
    const page=settingsPage();page.handleInput(change('baseUrl',config.baseUrl));page.handleFetchModels();
    page.handleInput(change('baseUrl','https://other.example.com/v1'));assert.equal(aborted,true);
    request.success({statusCode:200,data:{data:[{id:'stale-model'}]}});await Promise.resolve();
    assert.deepEqual(page.data.models,[]);assert.equal(page.data.modelsLoading,false);
    page.handleFetchModels();page.onHide();request.success({statusCode:200,data:{data:[{id:'hidden-model'}]}});await Promise.resolve();
    assert.deepEqual(page.data.models,[]);assert.equal(page.data.modelsOpen,false);
    page.onUnload();
});

test('vision model test calls a manually entered GLM model without querying the catalogue',async()=>{
    storage.clear();let request;
    wx.request=options=>{request=options;queueMicrotask(()=>options.success({statusCode:200,data:{choices:[{message:{content:'OK'}}]}}));return {};};
    const raw={provider:'zhipu',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.6v-flash',apiKey:'test-key'};
    const page=settingsPage();
    page.handleProvider({detail:{value:require('../utils/ai-providers').PROVIDERS.findIndex(item=>item.id==='zhipu')}});
    page.handleInput(change('model',raw.model));page.handleInput(change('apiKey',raw.apiKey));
    assert.deepEqual(page.data.models,[]);page.handleTest();await Promise.resolve();await Promise.resolve();
    assert.equal(request.method,'POST');assert.equal(request.url,raw.baseUrl+'/chat/completions');
    assert.equal(request.data.model,raw.model);assert.deepEqual(request.data.thinking,{type:'disabled'});
    assert.deepEqual(request.data.messages,[{role:'user',content:'请只回复 OK。'}]);
    assert.equal(request.data.stream,false);assert.equal(request.header.Authorization,'Bearer test-key');
    assert.equal(page.data.resultTone,'success');assert.ok(page.data.result.includes('尚未验证图片'));
    assert.equal(storage.has(ai.STORAGE_KEY),false);page.onUnload();
});

test('actual model test rejects service errors, malformed successes and honors cancellation',async()=>{
    for(const response of [
        {statusCode:401,data:{error:{message:'test-key'}}},
        {statusCode:404,data:{}}, {statusCode:429,data:{}},
        {statusCode:200,data:{error:{code:'1211',message:'test-key'}}},
        {statusCode:200,data:{choices:[]}}, {statusCode:200,data:{choices:[{message:{content:''}}]}},
    ]){
        wx.request=options=>{queueMicrotask(()=>options.success(response));return {};};
        const result=await ai.testModel(config).promise;
        assert.equal(result.ok,false);assert.equal(result.message.includes('test-key'),false);
    }
    let options,aborted=false;
    wx.request=value=>{options=value;return {abort(){aborted=true;}};};
    const request=ai.testModel(config);request.cancel();
    options.success({statusCode:200,data:{choices:[{message:{content:'OK'}}]}});
    const canceled=await request.promise;assert.equal(aborted,true);assert.equal(canceled.canceled,true);assert.equal(canceled.ok,false);
});

test('provider popover and model capability presentation preserve explicit selection and credential isolation',async()=>{
    storage.clear();
    wx.request=options=>{queueMicrotask(()=>options.success({statusCode:200,data:{data:[{id:'new-model',architecture:{input_modalities:['text','image']},supported_parameters:['tools'],apiKey:'never-copy'}]}}));return {};};
    const p=settingsPage();p.handleInput(change('baseUrl',config.baseUrl));p.handleInput(change('apiKey',config.apiKey));
    p.toggleProviders();assert.equal(p.data.providerOpen,true);assert.equal(p.data.modelsOpen,false);
    p.handleFetchModels();await Promise.resolve();await Promise.resolve();
    assert.equal(p.data.providerOpen,false);assert.equal(p.data.modelRows.length,1);
    assert.deepEqual(p.data.modelRows[0].capabilities.map(row=>row.key),['vision','tools','text']);
    assert.equal(p.data.modelMetadata['new-model'].apiKey,undefined);
    p.handleChooseModel({currentTarget:{dataset:{model:'new-model'}}});
    assert.equal(p.data.selectedModel.id,'new-model');assert.equal(p.data.selectedModel.capabilities.length,3);
    p.toggleProviders();p.handleCloseModels();assert.equal(p.data.providerOpen,false);
    p.chooseProvider({currentTarget:{dataset:{index:0}}});assert.equal(p.data.draft.provider,'openai');assert.equal(p.data.draft.apiKey,'');assert.equal(p.data.draft.model,'');assert.equal(p.data.modelRows.length,0);
    assert.equal(storage.has(ai.STORAGE_KEY),false);p.onUnload();
});
