// One pair of recorder listeners serves every recording session.
const MAX_DURATION = 60000;
let manager;
let session = null;
function ensureAuth() {
    return new Promise(resolve => {
        // Native runtimes may use Android permission prompts rather than WeChat scopes.
        // Only fall through on an unavailable API; an explicit denial is respected.
        const unsupported=error=>/not.?support|not.?implement|unsupported|不支持|未实现/i.test(String(error && error.errMsg || ''));
        const authorize=()=>{
            if(typeof wx.authorize!=='function'){resolve(true);return;}
            try {wx.authorize({scope:'scope.record',success:()=>resolve(true),fail:error=>{
                if(unsupported(error)){resolve(true);return;}
                resolve(false);
                if(typeof wx.showModal==='function')wx.showModal({title:'需要麦克风权限',content:'请在微信或系统应用设置中允许麦克风权限，再长按添加按钮。',confirmText:'去设置',success:result=>{if(result.confirm && typeof wx.openSetting==='function')wx.openSetting({});}});
            }});}catch(error){resolve(false);}
        };
        if(typeof wx.getSetting!=='function'){authorize();return;}
        try {wx.getSetting({success:res=>{
            if(res && res.authSetting && res.authSetting['scope.record'])resolve(true);
            else authorize();
        },fail:error=>{if(unsupported(error))resolve(true);else authorize();}});}catch(error){authorize();}
    });
}
function finish(current, result) {
    if (current.done) return;
    if (current.cancel && result.ok) result={ok:false,canceled:true};
    current.done = true;
    clearTimeout(current.timeout);
    clearTimeout(current.startTimeout);
    clearTimeout(current.authTimeout);
    if (session === current) session = null;
    current.resolveStart(false);
    current.resolveStop(result);
    if (current.callback) current.callback(result);
}
function getManager() {
    if (manager) return manager;
    manager = wx.getRecorderManager();
    manager.onStart(() => {
        if (!session) return;
        session.started = true;
        clearTimeout(session.startTimeout);
        session.resolveStart(true);
        if (session.stopping) manager.stop();
    });
    manager.onStop(res => {
        const current = session;
        if (!current) return;
        if (current.cancel || !res.tempFilePath) { finish(current, { ok: false, canceled: true }); return; }
        // 低于 1 秒的录音语音模型基本出不了字，提前拦下比让它静默失败更好。
        if (res.duration < 1000) { finish(current,{ok:false,canceled:false,error:'录音太短，请按住说完一整句'}); return; }
        const result = { ok: true, path: res.tempFilePath, duration: Math.max(1, Math.round(res.duration / 1000)) };
        const temporary=()=>finish(current,Object.assign({},result,{temp:true}));
        try {
            const fs=typeof wx.getFileSystemManager==='function' ? wx.getFileSystemManager() : null;
            if(!fs || typeof fs.saveFile!=='function'){temporary();return;}
            fs.saveFile({tempFilePath:res.tempFilePath,
                success(saved){finish(current,Object.assign({},result,{path:saved.savedFilePath}));},fail:temporary});
        }catch(error){temporary();}
    });
    manager.onError(() => { if (session) finish(session, { ok: false, canceled: false, error: '录音失败，请重试' }); });
    if(manager.onInterruptionBegin) manager.onInterruptionBegin(()=>{if(session) stop(true);});
    return manager;
}
function start(callback) {
    if (session) return Promise.resolve(false);
    // Reserve the session before requesting permission: stop/cancel must work
    // even while permission or the native recorder's onStart is pending.
    const current = { callback, started: false, cancel: false, stopping: false, done: false };
    current.result = new Promise(resolve => { current.resolveStop = resolve; });
    const started = new Promise(resolve => { current.resolveStart = resolve; });
    session = current;
    current.authTimeout=setTimeout(()=>{
        if(session===current && !current.startRequested)finish(current,{ok:false,canceled:false,error:'录音授权检查超时，请检查系统权限后重试'});
    },8000);
    return ensureAuth().then(granted => {
        if (session !== current || current.done) return false;
        clearTimeout(current.authTimeout);
        if (current.cancel) { finish(current,{ok:false,canceled:true}); return false; }
        if (!granted) { finish(current,{ok:false,canceled:false,error:'未获得麦克风权限，请检查应用设置'}); return false; }
        current.startRequested = true;
        current.startTimeout=setTimeout(()=>{
            if(session!==current || current.started)return;
            finish(current,{ok:false,canceled:false,error:'录音未能启动，请检查媒体 SDK 与麦克风权限'});
            try {getManager().stop();}catch(error){}
        },8000);
        current.timeout = setTimeout(() => {
            if (session !== current) return;
            current.cancel = true;
            try { getManager().stop(); } catch (error) { /* complete below */ }
            finish(current, { ok: false, canceled: false, error: '录音超时，请重试' });
        }, MAX_DURATION + 10000);
        try { getManager().start({ format: 'mp3', duration: MAX_DURATION, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 96000 }); }
        catch (error) { finish(current, { ok: false, canceled: false, error: '无法启动录音' }); }
        return started;
    });
}
function stop(cancel) {
    if (!session) return Promise.resolve({ ok: false, canceled: true });
    const current = session;
    current.cancel = current.cancel || !!cancel;
    if (!current.startRequested) { finish(current,{ok:false,canceled:true}); return current.result; }
    if (!current.stopping) { current.stopping = true; if (current.started) getManager().stop(); }
    return current.result;
}
module.exports = { start, stop, isActive: () => !!session, MAX_DURATION };
