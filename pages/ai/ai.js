const {withTheme}=require('../../utils/theme');
let ai;
let providers;
const builtin=require('../../utils/builtin-ai');
const modelInfo=require('../../utils/ai-model-info');
const LABELS = { vision: '视觉识别', speech: '语音识别', nutrition:'营养估算' };
Page(withTheme({
    data: {
        kind: 'vision',
        drafts: {vision:{provider:'custom',baseUrl:'',model:'',apiKey:''},speech:{provider:'custom',baseUrl:'',model:'',apiKey:''},nutrition:{provider:'custom',baseUrl:'',model:'',apiKey:''}},
        draft: {provider:'custom',baseUrl:'',model:'',apiKey:''},
        providerItems:[],providerOpen:false,providerIcon:'/assets/ai/custom.png',modelRows:[],selectedModel:{capabilities:[],icon:'/assets/ai/custom.png'},modelMetadata:{},
        providerOptions: [], providerIndex: 0, providerName:'自定义', providerNote:'填写服务商提供的接口信息。', hasKeyLink:false,
        showKey: false, busy: false, dirty: false, statusText: '未配置',
        error: '', result: '', resultTone: '', confirmClear: false,
        modelsLoading:false, modelsOpen:false, models:[], visibleModels:[], modelQuery:'',
        configured:false, enabled:false, serviceLabel:'视觉识别',
        // 内置服务是一个总开关，三项全开才算「已全部启动」
        builtinAll:false, builtinPartial:false,
        // 内置服务当日剩余次数：来自服务端实际计数，避免界面写的和真实可调用次数不一致
        builtinQuota:null, quotaText:'',
    },
    onLoad() {
        // Register the page before loading storage helpers, so initialization
        // failures cannot prevent the settings form from rendering.
        ai = null; providers = null;
        try {
            ai = require('../../utils/ai-settings.js');
            providers = require('../../utils/ai-providers.js');
            this.setData({providerOptions:providers.PROVIDERS.map(item => item.name),providerItems:providers.PROVIDERS.map(item=>({id:item.id,name:item.name,icon:'/assets/ai/'+item.id+'.png'}))});
            this.saved = ai.read(); this.setData({drafts:this.saved}); this.select('vision');
        } catch (error) {
            this.saved = this.data.drafts;
            this.setData({error:ai ? '暂时无法读取本机配置，请稍后重试' : '配置模块加载失败，请重新编译小程序后打开本页'});
        }
    },
    onShow() { this.loadQuota(); },
    // 内置服务全关时不打扰服务端，保持默认说明文案。
    loadQuota() {
        if (!this.builtinKinds().some(kind => builtin.enabled(kind))) { this.setData({builtinQuota:null,quotaText:''}); return; }
        const show = quota => {
            if (this.disposed || !quota) return;
            const left = quota.remaining || {}, n = value => Number.isFinite(value) ? value : '—';
            this.setData({builtinQuota:quota,quotaText:'今日剩余：视觉 '+n(left.vision)+' · 语音 '+n(left.speech)+' · 营养 '+n(left.nutrition)+'（每项每天 '+quota.limit+' 次）'});
        };
        builtin.quota().then(show).catch(() => { if (!this.disposed) this.setData({builtinQuota:null,quotaText:''}); });
    },
    onUnload() { this.disposed = true; this.cancelTest(); this.cancelModels(); clearTimeout(this.clearTimer); },
    onHide() { this.cancelTest(); this.cancelModels(); this.setData({showKey:false,modelsOpen:false,providerOpen:false}); },
    select(kind) {
        const draft = this.data.drafts[kind];
        const dirty = JSON.stringify(ai.normalize(draft)) !== JSON.stringify((this.saved || {})[kind] || ai.emptyConfig());
        this.setData({modelMetadata:{},providerOpen:false,kind,draft,dirty,showKey:false,confirmClear:false,error:'',result:'',models:[],visibleModels:[],modelQuery:'',modelsOpen:false,statusText:dirty ? '有未保存的修改' : draft.baseUrl ? '已保存 · 尚未接入识别' : '未配置'});
        this.syncProvider();
        this.syncService();
    },
    syncModelDisplay(){
        const provider=this.data.draft.provider,meta=this.data.modelMetadata || {};
        this.setData({modelRows:this.data.visibleModels.map(id=>modelInfo.describe(id,provider,meta[id])),selectedModel:modelInfo.describe(this.data.draft.model,provider,meta[this.data.draft.model])});
    },
    syncService() {
        this.syncModelDisplay();
        const kinds = this.builtinKinds();
        const builtinOn = kinds.filter(kind => builtin.enabled(kind)).length;
        const builtinAll = builtinOn === kinds.length;
        const builtinPartial = builtinOn > 0 && !builtinAll;
        const builtinEnabled = builtin.enabled(this.data.kind);
        const enabled = !builtinEnabled && ai.isEnabled(this.data.kind);
        const configured = !ai.validate(this.data.draft);
        this.setData({configured,enabled,builtinEnabled,builtinAll,builtinPartial,serviceLabel:LABELS[this.data.kind],statusText:this.data.dirty ? '有未保存的修改' : enabled ? '已启动' : configured ? 'API 已配置 · 未启动' : '未配置'});
    },
    // 内置服务不分视觉/语音：一个开关同时管三项，这里统一取三种服务的键
    builtinKinds() {
        return ai && Array.isArray(ai.KINDS) ? ai.KINDS : Object.keys(LABELS);
    },
    handleBuiltin() {
        if(this.data.busy || this.data.modelsLoading) return;
        const next = !this.data.builtinAll;
        try {
            this.builtinKinds().forEach(kind => builtin.setEnabled(kind,next));
            this.syncService();
            if (next) this.loadQuota(); else this.setData({builtinQuota:null,quotaText:''});
            wx.showToast({title:next ? '内置服务已全部启动' : '内置服务已全部停止',icon:'none'});
        } catch (_) {
            this.setData({error:'无法保存内置服务选项'});
        }
    },
    handleToggleService() {
        if(this.data.busy || this.data.modelsLoading) return;
        this.cancelTest();this.cancelModels();
        try {
            if(this.data.enabled && !this.data.dirty) {
                ai.setEnabled(this.data.kind,false);
            } else {
                const error=ai.validate(this.data.draft);
                if(error) {this.setData({error});return;}
                this.saved=ai.save(this.data.kind,this.data.draft);
                ai.setEnabled(this.data.kind,true);
                builtin.setEnabled(this.data.kind,false);
                const draft=this.saved[this.data.kind];
                this.setData({draft,drafts:Object.assign({},this.data.drafts,{[this.data.kind]:draft}),dirty:false,showKey:false});
            }
            this.setData({error:'',result:''});this.syncService();
            wx.showToast({title:this.data.enabled ? '服务已启动' : '服务已停止',icon:'none'});
        } catch(error) {this.setData({error:'无法更新服务状态，请检查配置及本机存储'});}
    },
    syncProvider() {
        const provider = providers.getProvider(this.data.draft.provider);
        this.setData({providerIcon:'/assets/ai/'+provider.id+'.png',providerIndex:providers.PROVIDERS.indexOf(provider),providerName:provider.name,providerNote:provider.note,hasKeyLink:!!provider.keyUrl});
    },
    toggleProviders(){this.setData({providerOpen:!this.data.providerOpen,modelsOpen:false});},
    chooseProvider(event){this.setData({providerOpen:false});this.handleProvider({detail:{value:event.currentTarget.dataset.index}});},
    handleCapability(event){
        const key=event.currentTarget.dataset.key;
        const labels={vision:'视觉：支持图片输入',tools:'工具：模型支持工具调用，不代表本应用已接入外部工具',audio:'音频：支持音频输入，转写接口需另行确认',reasoning:'推理：支持思考或推理模式',video:'视频：支持视频输入',file:'文件：支持文件输入',text:'文字：支持文本输入，不等于适用于所有对话接口',embedding:'向量：将文本转换为检索向量，不适合直接记餐对话',rerank:'重排：按相关性排序检索结果，不适合直接记餐对话'};
        if(labels[key])wx.showToast({title:labels[key],icon:'none',duration:3000});
    },
    handleProvider(event) {
        const provider = providers.PROVIDERS[Number(event.detail.value)];
        if (!provider || provider.id === this.data.draft.provider) return;
        this.cancelTest(); this.cancelModels(); clearTimeout(this.clearTimer);
        // Never carry credentials across providers, even before saving.
        const draft = {provider:provider.id,baseUrl:provider.baseUrl,model:'',apiKey:''};
        const drafts = Object.assign({},this.data.drafts,{[this.data.kind]:draft});
        this.setData({drafts}); this.select(this.data.kind);
    },
    handleGetApiKey() {
        const provider = providers.getProvider(this.data.draft.provider);
        if (!provider.keyUrl) return;
        this.setData({showKey:false});
        wx.showActionSheet({itemList:['打开官方获取页面','复制官方页面地址'],success:result => {
            if (result.tapIndex === 0) wx.navigateTo({url:'/pages/ai-provider/ai-provider?provider='+provider.id,fail:() => {
                this.setData({error:'暂时无法打开官方页面，请再次点击获取 API Key，选择复制官方页面地址'});
            }});
            if (result.tapIndex === 1) wx.setClipboardData({data:provider.keyUrl,success:() => wx.showToast({title:'已复制，请在浏览器打开',icon:'none'})});
        }});
    },
    handleTab(event) { const kind = event.currentTarget.dataset.kind; if (!ai.KINDS.includes(kind) || kind === this.data.kind) return; this.cancelTest(); this.cancelModels(); clearTimeout(this.clearTimer); this.select(kind); },
    handleInput(event) {
        const field = event.currentTarget.dataset.field;
        if (!['baseUrl','model','apiKey'].includes(field)) return;
        this.cancelTest();clearTimeout(this.clearTimer);
        if (field !== 'model') {
            this.cancelModels();
            this.setData({modelMetadata:{},models:[],visibleModels:[],modelsOpen:false,modelQuery:''});
        }
        const draft = Object.assign({},this.data.draft,{[field]:event.detail.value});
        const drafts = Object.assign({},this.data.drafts,{[this.data.kind]:draft});
        this.setData({draft,drafts,confirmClear:false,error:'',result:''});
        if (field === 'model' && this.data.models.length) {
            this.handleModelSearch({detail:{value:event.detail.value}});
            this.setData({modelsOpen:true});
        }
        const dirty = JSON.stringify(ai.normalize(draft)) !== JSON.stringify((this.saved || {})[this.data.kind] || ai.emptyConfig());
        this.setData({dirty,statusText:dirty ? '有未保存的修改' : draft.baseUrl ? '已保存 · 尚未接入识别' : '未配置'});
        this.syncService();
    },
    handleKeyVisibility() { this.setData({showKey:!this.data.showKey}); },
    handleFetchModels() {
        if (this.data.modelsLoading || this.data.busy) return;
        const error = ai.validateConnection(this.data.draft);
        if (error) { this.setData({error}); return; }
        clearTimeout(this.clearTimer);
        const token = {};
        this.modelsToken = token;
        this.setData({modelMetadata:{},providerOpen:false,modelsLoading:true,modelsOpen:false,models:[],visibleModels:[],modelQuery:'',showKey:false,confirmClear:false,error:'',result:''});
        this.modelsRequest = ai.fetchModels(this.data.draft);
        this.modelsRequest.promise.then(result => {
            if (this.disposed || this.modelsToken !== token) return;
            this.modelsRequest = null;
            if (!result.ok) { this.setData({modelsLoading:false,error:result.message}); return; }
            this.setData({modelMetadata:result.modelMetadata || {},modelsLoading:false,models:result.models,visibleModels:result.models,modelsOpen:result.models.length>0,result:result.message,resultTone:result.models.length ? 'success' : 'warning'});this.syncModelDisplay();
        });
    },
    cancelModels() {
        this.modelsToken = null;
        if (this.modelsRequest) this.modelsRequest.cancel();
        this.modelsRequest = null;
        if (!this.disposed && this.data.modelsLoading) this.setData({modelsLoading:false});
    },
    handleModelSearch(event) {
        const modelQuery = event.detail.value;
        const query = modelQuery.trim().toLowerCase();
        this.setData({modelQuery,visibleModels:this.data.models.filter(id => id.toLowerCase().includes(query))});this.syncModelDisplay();
    },
    handleChooseModel(event) {
        const model = event.currentTarget.dataset.model;
        if (!this.data.models.includes(model)) return;
        this.handleInput({currentTarget:{dataset:{field:'model'}},detail:{value:model}});
        this.setData({modelsOpen:false});
    },
    handleModelFocus() {
        if (this.data.models.length) this.setData({providerOpen:false,modelsOpen:true,modelQuery:'',visibleModels:this.data.models});this.syncModelDisplay();
    },
    handleModelFieldTap() {},
    handleCloseModels() { this.setData({modelsOpen:false,providerOpen:false}); },
    handleToggleModels() {
        const modelsOpen = !this.data.modelsOpen;
        this.setData({providerOpen:false,modelsOpen,modelQuery:'',visibleModels:this.data.models});this.syncModelDisplay();
    },
    handleSave() {
        const error = ai.validate(this.data.draft);
        if (error) { this.setData({error}); return; }
        try {
            this.saved = ai.save(this.data.kind,this.data.draft);
            const draft = this.saved[this.data.kind];
            this.setData({draft,drafts:Object.assign({},this.data.drafts,{[this.data.kind]:draft}),dirty:false,showKey:false,error:'',statusText:'已保存 · 尚未接入识别'});
            this.syncService();
            wx.showToast({title:'配置已保存到本机',icon:'none'});
        } catch (error) { this.setData({error:'保存失败，请检查本机存储后重试'}); }
    },
    handleTest() {
        if (this.data.busy || this.data.modelsLoading) return;
        const error = ai.validate(this.data.draft); if (error) { this.setData({error}); return; }
        const token = {};
        this.testToken = token;
        const vision = this.data.kind !== 'speech';
        this.setData({busy:true,error:'',result:vision ? '正在调用所填模型…' : '正在检查接口与模型列表…',resultTone:''});
        this.activeTest = vision ? ai.testModel(this.data.draft) : ai.testConnection(this.data.draft);
        this.activeTest.promise.then(result => {
            if (this.disposed || this.testToken !== token) return;
            this.activeTest = null;
            this.setData({busy:false,result:result.message,resultTone:result.ok ? (result.warning ? 'warning' : 'success') : 'error'});
        });
    },
    cancelTest() {
        this.testToken = null;
        if (this.activeTest) this.activeTest.cancel();
        this.activeTest = null;
        if (!this.disposed && this.data.busy) this.setData({busy:false,result:''});
    },
    handleClear() {
        this.cancelTest();
        this.cancelModels();
        if (!this.data.confirmClear) {
            this.setData({confirmClear:true,error:'',result:''});
            this.clearTimer = setTimeout(() => { this.setData({confirmClear:false}); },4000);
            return;
        }
        clearTimeout(this.clearTimer);
        try {
            this.saved = ai.clear(this.data.kind);
            const drafts = Object.assign({},this.data.drafts,{[this.data.kind]:ai.emptyConfig()});
            this.setData({drafts});this.select(this.data.kind);
            wx.showToast({title:LABELS[this.data.kind]+'配置已清除',icon:'none'});
        } catch (error) { this.setData({error:'清除失败，请稍后重试',confirmClear:false}); }
    },
}));
