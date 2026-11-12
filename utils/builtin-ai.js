const base = 'https://phbxzuvfkifawvvnzwdn.supabase.co';
const apikey = 'sb_publishable_AAGY2q8V1Jq8aWbnDqKm2w_AYGHX6UV';
const flag = 'cal_builtin_ai';
const sessionKey = 'cal_builtin_ai_session';
let pending;
// 模型正常响应但没有内容时，按服务类型给不同说法：语音多是没听清，拍照多是画面里没食物。
const EMPTY = {
    speech: '没听清，请靠近麦克风再说一次',
    vision: '没有识别出食物，换个角度重拍',
    nutrition: '没能估算出营养，请手动填写',
};
// 服务端错误码 → 用户能看懂的说法。额度、录音、网络要分开说，否则用户以为服务坏了。
function message(code, data, kind) {
    const error = data && data.error;
    if (code === 429) {
        if (error === 'user_limit') return '今日 AI 次数已用完，明天再来，或在 AI 服务里配置自己的 API';
        if (error === 'global_limit') return '今日内置 AI 总量已用完，请明天再试';
        return '服务繁忙，请稍后重试';
    }
    if (code === 502 || code === 503) {
        if (error === 'empty') return EMPTY[kind] || '没有识别出结果，请重试';
        if (error === 'provider') return '识别服务暂时不可用，请稍后重试';
        if (error === 'disabled') return '内置 AI 已暂停服务，请稍后再试';
        return '内置 AI 暂不可用，请稍后再试';
    }
    if (code === 413) return '文件太大，请压缩后重试';
    if (code === 400) {
        if (error === 'audio') return '录音文件不可用，请重新录制';
        if (error === 'image') return '照片格式不支持，请重新拍摄';
        if (error === 'items') return '食物信息不完整，请手动填写';
        if (error === 'size') return '文件太大，请压缩后重试';
        return '请求有误，请重试';
    }
    return '内置 AI 暂不可用，请稍后再试';
}
function request(options, upload) {
    return new Promise((resolve,reject)=>{
        const kind = options.header && options.header['x-ai-kind'];
        const config = Object.assign({},options,{
            timeout: options.timeout || 60000,
            success(r){
                let data=r.data;
                try { if(typeof data==='string') data=JSON.parse(data); } catch (_) { data=null; }
                if(r.statusCode>=200 && r.statusCode<300 && data) return resolve(data);
                reject(new Error(message(r.statusCode, data, kind)));
            },
            fail(){reject(new Error('无法连接内置 AI，请检查网络'));}
        });
        if(upload) wx.uploadFile(config); else wx.request(config);
    });
}
async function session() {
    const saved=wx.getStorageSync(sessionKey);
    if(saved && saved.expiresAt>Date.now()+60000) return saved;
    if(!pending) pending=(async()=>{
        const refresh=!!(saved && saved.refresh_token);
        const data=await request({
            url:base+'/auth/v1/'+(refresh?'token?grant_type=refresh_token':'signup'),
            method:'POST',header:{apikey,'content-type':'application/json'},
            data:refresh?{refresh_token:saved.refresh_token}:{}
        });
        if(!data.access_token || !data.refresh_token || !Number.isFinite(data.expires_in)) throw new Error('无法建立匿名会话');
        const next={access_token:data.access_token,refresh_token:data.refresh_token,expiresAt:Date.now()+data.expires_in*1000};
        wx.setStorageSync(sessionKey,next);
        return next;
    })().finally(()=>{pending=null;});
    return pending;
}
async function invoke(kind,data,filePath) {
    const started=Date.now();
    const auth=await session();
    const sessionMs=Date.now()-started;
    if(!enabled(kind)) throw new Error('内置 AI 已关闭');
    const header={apikey,Authorization:'Bearer '+auth.access_token,'x-ai-kind':kind};
    const url=base+'/functions/v1/chigedan-ai';
    const result=await request(filePath?{url,header,filePath,name:'file'}:{url,header,method:'POST',data},!!filePath);
    console.info('builtin_ai_timing', {kind,session_ms:sessionMs,request_ms:Date.now()-started-sessionMs,total_ms:Date.now()-started});
    if(typeof result.text!=='string' || !result.text.trim()) throw new Error(EMPTY[kind] || '内置 AI 未返回可用结果');
    return result.text;
}
async function lookup(name,unit) {
    const auth=await session();
    const result=await request({url:base+'/functions/v1/chigedan-ai',method:'POST',header:{apikey,Authorization:'Bearer '+auth.access_token,'x-ai-kind':'food_lookup'},data:{name,unit}});
    return Array.isArray(result.foods)?result.foods[0]||null:null;
}
async function searchFoods(name) {
    const auth=await session();
    const result=await request({url:base+'/functions/v1/chigedan-ai',method:'POST',header:{apikey,Authorization:'Bearer '+auth.access_token,'x-ai-kind':'food_search'},data:{name}});
    return Array.isArray(result.foods)?result.foods:[];
}
// 今日各服务剩余次数：服务端按匿名会话统计，和实际能否调用始终一致。
async function quota() {
    const auth=await session();
    const result=await request({url:base+'/functions/v1/chigedan-ai',method:'POST',timeout:20000,
        header:{apikey,Authorization:'Bearer '+auth.access_token,'x-ai-kind':'quota'},data:{}});
    return result && result.quota ? result.quota : null;
}
function enabled(kind){return (wx.getStorageSync(flag)||{})[kind]===true;}
function setEnabled(kind,value){wx.setStorageSync(flag,Object.assign({},wx.getStorageSync(flag)||{},{[kind]:!!value}));}
module.exports={enabled,setEnabled,invoke,lookup,searchFoods,quota};
