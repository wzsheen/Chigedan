// Provider: async ({path,duration}) => {ok,text?,items:[{name,unit,qty,kcal,protein,carb,fat}]}.
// Nutrients and kcal describe each item's total quantity. API secrets belong on a server.
let provider = null;
function setProvider(fn) { provider = typeof fn === 'function' ? fn : null; }
function recognize(note) {
    if (!provider) {
        const settings=require('./ai-settings');
        if(settings.isEnabled('speech')) return require('./ai-runtime').speech(note).catch(error=>({ok:false,items:[],error:error.message || '语音识别失败，录音已保留'}));
        return Promise.resolve({ ok: false, source: 'unconfigured', items: [], error: '请先在 AI 服务中启动语音识别；录音已保留，可手动添加食物' });
    }
    return Promise.resolve().then(() => provider(note)).then(result => {
        if (!result || !result.ok || !Array.isArray(result.items)) return { ok: false, items: [], error: result && result.error || '没有识别出食物，请重试或手动填写' };
        return Object.assign({}, result, { ok: true, source: 'ai', text: result.text || '', items: result.items });
    }).catch(() => ({ ok: false, items: [], error: '语音识别失败，录音已保留，可先手动填写' }));
}
module.exports = { setProvider, recognize };
