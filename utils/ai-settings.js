// User-owned credentials are local only; excluded from the explicit data export schema.
// Local storage is not a secure secret vault. Never log or place keys in request URLs.
const STORAGE_KEY = 'cal_ai_services';
const ENABLED_KEY = 'cal_ai_enabled';
const KINDS = ['vision', 'speech', 'nutrition'];
const providers = require('./ai-providers.js');
function emptyConfig() { return { provider: 'custom', baseUrl: '', model: '', apiKey: '' }; }
function normalize(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim().replace(/\/+$/, '') : '';
    return {
        provider: input.provider ? providers.getProvider(input.provider).id : providers.inferProvider(baseUrl),
        baseUrl,
        model: typeof input.model === 'string' ? input.model.trim() : '',
        apiKey: typeof input.apiKey === 'string' ? input.apiKey.trim() : '',
    };
}
function read() {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return { vision: normalize(raw && raw.vision), speech: normalize(raw && raw.speech), nutrition:normalize(raw && raw.nutrition) };
}
function validateConnection(raw) {
    const config = normalize(raw);
    if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:\/[a-z0-9._~!$&'()*+,;=:@%/-]*)?$/i.test(config.baseUrl)) return '请填写有效的 HTTPS 基础地址，不包含密钥、查询参数或片段';
    if (/\/(?:chat\/completions|audio\/transcriptions|models)$/i.test(config.baseUrl)) return '请填写 API 基础地址，不要包含具体识别或 models 路径';
    if (/[\r\n]/.test(config.apiKey)) return 'API Key 不能包含换行';
    return '';
}
function validate(raw) {
    const error = validateConnection(raw);
    if (error) return error;
    const config = normalize(raw);
    if (!config.model || config.model.length > 200 || /[\r\n]/.test(config.model)) return '请填写有效的模型名称';
    return '';
}
function save(kind, raw) {
    if (!KINDS.includes(kind)) throw new Error('未知的 AI 服务类型');
    const error = validate(raw);
    if (error) throw new Error(error);
    const all = read();
    const next = normalize(raw);
    if (JSON.stringify(all[kind]) !== JSON.stringify(next)) setEnabled(kind,false);
    all[kind] = next;
    wx.setStorageSync(STORAGE_KEY, all);
    return all;
}
function clear(kind) {
    if (!KINDS.includes(kind)) throw new Error('未知的 AI 服务类型');
    const all = read(); all[kind] = emptyConfig(); setEnabled(kind,false);
    if (KINDS.every(key => !all[key].baseUrl && !all[key].model && !all[key].apiKey)) wx.removeStorageSync(STORAGE_KEY);
    else wx.setStorageSync(STORAGE_KEY, all);
    return all;
}
function status() {
    const all = read();
    const count = KINDS.filter(kind => all[kind].baseUrl && all[kind].model).length;
    const active = KINDS.filter(kind => isEnabled(kind)).length;
    return count ? count + ' 项已配置 · '+active+' 项已启动' : '视觉 · 语音 · 营养估算';
}
function setEnabled(kind,enabled) {
    if (!KINDS.includes(kind)) throw new Error('未知的 AI 服务类型');
    if (enabled && validate(read()[kind])) throw new Error('请先保存完整的服务配置');
    const flags = wx.getStorageSync(ENABLED_KEY) || {};
    wx.setStorageSync(ENABLED_KEY,Object.assign({},flags,{[kind]:!!enabled}));
}
function isEnabled(kind) {
    if (require('./builtin-ai').enabled(kind)) return true;
    const flags = wx.getStorageSync(ENABLED_KEY) || {};
    return flags[kind] === true && !validate(read()[kind]);
}

// Read-only diagnostics for compatible /models endpoints. No media or inference request.
function fetchModels(raw) {
    const config = normalize(raw);
    const error = validateConnection(config);
    if (error) return { promise: Promise.resolve({ok:false,message:error}), cancel() {} };
    let task;
    let canceled = false;
    let finish;
    const promise = new Promise(resolve => {
        const done = result => resolve(canceled ? {ok:false,canceled:true,message:'已取消检查'} : result);
        finish = done;
        try {
            task = wx.request({
                url: config.baseUrl + '/models', method: 'GET', timeout: 12000,
                header: config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {},
                success(response) {
                    const code = response.statusCode;
                    if (code === 401 || code === 403) { done({ok:false,message:'接口拒绝访问，请检查 API Key 和权限'}); return; }
                    if (code === 404 || code === 405) { done({ok:false,message:'接口不支持模型列表检查，请核对基础地址；这不代表识别服务一定不可用'}); return; }
                    if (code === 429) { done({ok:false,message:'服务当前限流或额度不足，请稍后再试'}); return; }
                    if (code < 200 || code >= 300) { done({ok:false,message:'接口检查失败（HTTP ' + code + '）'}); return; }
                    const rows = response.data && response.data.data;
                    if (!Array.isArray(rows) || !rows.every(row => row && typeof row.id === 'string')) { done({ok:false,message:'已收到响应，但不是兼容的模型列表格式'}); return; }
                    const seen = Object.create(null);
                    const models = rows.map(row => row.id.trim()).filter(id => {
                        if (!id || id.length > 200 || /[\r\n]/.test(id) || seen[id]) return false;
                        seen[id] = true; return true;
                    }).sort();
                    const modelMetadata={};
                    for(const row of rows){const id=row.id.trim();if(models.includes(id) && !Object.prototype.hasOwnProperty.call(modelMetadata,id))Object.defineProperty(modelMetadata,id,{value:require('./ai-model-info').metadata(row),enumerable:true});}
                    done({ok:true,models,modelMetadata,message:models.length ? '已获取 '+models.length+' 个模型，请选择' : '接口返回的模型列表为空，可手动填写模型 ID'});
                },
                fail(result) {
                    const reason = String(result && result.errMsg || '');
                    done({ok:false,message:/domain|域名/i.test(reason) ? '请求域名未获允许，请在小程序后台配置 request 合法域名' : /timeout/i.test(reason) ? '连接超时，请检查网络或接口地址' : '无法连接，请检查网络、HTTPS 证书及小程序合法域名配置'});
                },
            });
        } catch (error) { done({ok:false,message:'当前环境无法发起连接检查'}); }
    });
    return { promise, cancel() { canceled = true; finish({}); if (task && task.abort) task.abort(); } };
}
function testConnection(raw) {
    const error = validate(raw);
    if (error) return {promise:Promise.resolve({ok:false,message:error}),cancel(){}};
    const request = fetchModels(raw);
    const config = normalize(raw);
    return {cancel:request.cancel,promise:request.promise.then(result => {
        if (!result.ok) return result;
        const found = result.models.includes(config.model);
        return {ok:true,warning:!found,message:found ? '接口可访问，模型在列表中；尚未验证识别能力' : '接口可访问，但列表中未找到填写的模型；请核对名称'};
    })};
}
// A minimal text call verifies the selected vision/chat model independently
// of the provider's model catalogue. Never sends dietary data or photographs.
function testModel(raw) {
    const config = normalize(raw);
    const error = validate(config);
    if (error) return {promise:Promise.resolve({ok:false,message:error}),cancel(){}};
    let task, finish;
    let canceled = false;
    const promise = new Promise(resolve => {
        const done = result => resolve(canceled ? {ok:false,canceled:true,message:'已取消测试'} : result);
        finish = done;
        const data = {model:config.model,messages:[{role:'user',content:'请只回复 OK。'}],stream:false,max_tokens:64};
        if (config.provider === 'zhipu') data.thinking = {type:'disabled'};
        try {
            task = wx.request({
                url:config.baseUrl+'/chat/completions',method:'POST',timeout:30000,
                header:Object.assign({'Content-Type':'application/json'},config.apiKey ? {Authorization:'Bearer '+config.apiKey} : {}),
                data,
                success(response) {
                    const code = response.statusCode;
                    const body = response.data;
                    const serviceCode = String(body && body.error && body.error.code || '');
                    if (code === 401 || code === 403) { done({ok:false,message:'模型调用被拒绝，请检查 API Key、模型权限和接口地址'}); return; }
                    if (code === 429) { done({ok:false,message:'模型调用受到限流或额度限制，请检查控制台后重试'}); return; }
                    if (code === 404) { done({ok:false,message:'模型或调用接口不存在，请核对模型 ID 和 API 基础地址；与模型是否在列表中无关'}); return; }
                    if (code < 200 || code >= 300 || (body && body.error)) {
                        // Only display known categories, never provider messages that may echo keys.
                        const message = serviceCode === '1211' ? '服务商不支持所填模型，请核对模型 ID 和开放平台地址' : serviceCode === '1113' ? '服务商提示余额不足，请检查账户及所选模型的计费规则' : '模型调用失败（HTTP '+code+'），请检查模型权限、参数和服务商控制台';
                        done({ok:false,message}); return;
                    }
                    const choices = body && body.choices;
                    const message = Array.isArray(choices) && choices[0] && choices[0].message;
                    if (!message || typeof message.content !== 'string' || !message.content.trim()) {
                        done({ok:false,message:'接口已响应，但未返回有效文字结果；尚不能确认模型调用成功'}); return;
                    }
                    done({ok:true,message:'所填模型调用成功；已验证文字请求，尚未验证图片识别效果'});
                },
                fail(result) {
                    const reason = String(result && result.errMsg || '');
                    done({ok:false,message:/domain|域名/i.test(reason) ? '请求域名未获允许，请在小程序后台配置 request 合法域名' : /timeout/i.test(reason) ? '模型响应超时，请稍后重试' : '无法连接，请检查网络、接口地址及小程序合法域名配置'});
                },
            });
        } catch (error) { done({ok:false,message:'当前环境无法发起模型测试'}); }
    });
    return {promise,cancel(){canceled=true;finish({});if(task && task.abort) task.abort();}};
}
module.exports = { STORAGE_KEY, KINDS, emptyConfig, normalize, validateConnection, validate, read, save, clear, status, fetchModels, testConnection, testModel, setEnabled, isEnabled };
