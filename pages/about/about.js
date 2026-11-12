const {withTheme}=require('../../utils/theme');
const {CONTACT}=require('../../utils/privacy-content');
const update=require('../../utils/app-update');
const appDelta=require('../../utils/app-delta');
const settings=require('../../utils/settings');
const FEEDBACK_EMAIL = CONTACT.email;
// 安装包 60 MB 出头，2 分钟的超时等于要求全程 550KB/s：网稍慢就整包作废，
// 而且 wx.downloadFile 不支持断点续传，重来还是从 0 开始。放到 10 分钟留足余量。
const DOWNLOAD_TIMEOUT = 600000;

// 下载进度里带上网速感更强的「12.4 / 63.4 MB」，光一个百分比看不出还要多久
function bytesText(written, total) {
    const left = Number(written) || 0;
    const right = Number(total) || 0;
    if (left <= 0 || right <= 0) {
        return '';
    }
    return update.formatSize(left) + ' / ' + update.formatSize(right);
}

function errorText(err) {
    const raw = (err && (err.errMsg || err.message)) || '';
    return String(raw).replace(/^.*?:\s*fail\s*/i, '').replace(/^fail\s*/i, '').trim();
}

function describeDownloadError(err) {
    const raw = errorText(err);
    if(/domain list|not in domain|合法域名/i.test(raw)){
        return '下载域名没加白名单';
    }
    if(/timeout|timed out/i.test(raw)){
        return '下载超时';
    }
    if(/abort/i.test(raw)){
        return '已取消下载';
    }
    return '下载失败' + (raw ? '：' + raw : '');
}

function describeInstallError(err) {
    const raw = errorText(err);
    // 这三个是 installApp 最典型的失败原因，原样抛给用户看不懂
    if(/signatures?/i.test(raw)){
        return '签名和旧版不一致，需要先卸载旧版再装';
    }
    if(/package/i.test(raw)){
        return '包名和当前应用不一致，这个安装包装不上';
    }
    if(/version/i.test(raw)){
        return '安装包版本不高于当前版本';
    }
    return '安装程序没打开' + (raw ? '：' + raw : '');
}

Page(withTheme({
    data: {
        version: update.appVersion(),
        versionChannel: {development: '开发版', stable: '稳定版', beta: 'beta版'}[update.BUILD_CHANNEL] || '开发版',
        email: FEEDBACK_EMAIL,
        copyHint: '',
        // 检查更新：idle / checking / latest / new / error / unconfigured
        updateState: 'idle',
        updateLabel: '检查更新',
        updateNote: '',
        updateSheetOpen: false,
        updateInfo: null,
        sheetCopyHint: '',
        // 应用内更新的两个阶段：idle / downloading / installing
        installStage: 'idle',
        installPercent: 0,
        installBytesText: '',
    },

    onShow() {
        // 只回显上次检查结果，进页面不自动发请求
        const cached = update.readCache();
        // 只回显成功的结果，失败不留痕，避免下次进来还挂着旧错误
        if(!cached || !cached.result || cached.result.ok !== true)return;
        this.applyUpdateResult(cached.result, true, cached.checkedAt);
    },

    onLoad(options) {
        if(!options || options.autoUpdate!=='1')return;
        const app=getApp();
        const info=app.globalData.pendingUpdateInfo;
        if(!info)return;
        app.globalData.pendingUpdateInfo=null;
        this.applyUpdateResult({
            status:'new',remoteVersion:info.version,notes:info.notes,downloadUrl:info.downloadUrl,
            releaseUrl:info.releaseUrl,sizeText:info.sizeText,dateText:info.dateText,
            delta:info.delta,
            assetName:info.assetName
        },false,Date.now());
    },

    handlePrivacy() { wx.navigateTo({url:'/pages/privacy/privacy'}); },

    handleCopyEmail() {
        if(!FEEDBACK_EMAIL)return;
        const that = this;
        wx.setClipboardData({
            data: FEEDBACK_EMAIL,
            success() {
                that.setData({ copyHint: '邮箱已复制' });
            },
            fail() {
                that.setData({ copyHint: '复制失败，可长按上面的邮箱手动复制' });
            },
        });
    },

    // 把一次检查结果落到界面状态：fromCache 时不自动弹窗，只在版本号下面回显一行
    applyUpdateResult(result, fromCache, checkedAt) {
        if(!result)return;
        const at = update.formatCheckedAt(checkedAt);
        const suffix = at ? ' · ' + at : '';
        if(result.status === 'latest'){
            this.setData({updateState: 'latest', updateLabel: '检查更新', updateNote: '已是最新版本' + suffix});
            return;
        }
        if(result.status === 'new'){
            const info = {
                version: result.remoteVersion || '',
                dateText: result.dateText || update.formatDate(result.publishedAt),
                notes: (result.notes || '').trim() || '这次更新没有写说明。',
                downloadUrl: result.downloadUrl || '',
                delta: result.delta,
                releaseUrl: result.releaseUrl || '',
                // 安装包信息：App 的更新产物是 APK，下载前先告诉用户多大
                assetName: result.assetName || '',
                sizeText: result.sizeText || update.formatSize(result.assetSize),
            };
            const patch = {
                updateState: 'new',
                updateLabel: '检查更新',
                updateNote: '发现新版本 v' + info.version + ' · 查看更新说明',
                updateInfo: info,
                sheetCopyHint: '',
            };
            if(!fromCache){
                // 弹窗真要显示了才算用掉「24 小时一次」的额度：
                // 之后用户点稍后、点更新没装成、还是按返回键退出，都不会再弹第二次。
                update.markPrompted(info.version);
                patch.updateSheetOpen = true;
            }
            this.setData(patch);
            return;
        }
        if(result.status === 'unconfigured'){
            this.setData({updateState: 'unconfigured', updateLabel: '检查更新', updateNote: '更新服务还没配置，暂时无法检查'});
            return;
        }
        this.setData({updateState: 'error', updateLabel: '检查更新', updateNote: result.message || '检查失败，稍后再试'});
    },

    handleCheckUpdate() {
        // 已知有新版本就不再重复请求，直接打开说明
        if(this.data.updateState === 'new' && this.data.updateInfo){
            this.setData({updateSheetOpen: true, sheetCopyHint: '', installStage: 'idle', installPercent: 0, installBytesText: ''});
            return;
        }
        if(this.data.updateState === 'checking')return;
        this.setData({updateState: 'checking', updateLabel: '正在检查…', updateNote: ''});
        const that = this;
        update.check().then(result => {
            const cached = update.readCache();
            that.applyUpdateResult(result, false, cached ? cached.checkedAt : 0);
        }).catch(() => {
            that.setData({updateState: 'error', updateLabel: '检查更新', updateNote: '检查失败，稍后再试'});
        });
    },

    handleCloseUpdate() {
        this._deltaAttempt = null;
        // 下载中途关掉弹窗：把请求停掉，别在后台白耗流量
        if(this._downloadTask && typeof this._downloadTask.abort === 'function'){
            try{ this._downloadTask.abort(); }catch(error){}
            this._downloadTask = null;
        }
        // 点过「现在更新」却没装成（取消下载 / 网络失败 / 安装器报错）时不写「稍后」记录：
        // 用户本来就想要新版，24 小时冷却一过还得提醒，否则只能自己去关于页翻。
        // 这一次的 24 小时安静由 markPrompted 记录负责，不靠这里。
        if(this.data.updateInfo && !this._installAttempted && settings.getHomeDisplay().autoUpdate){
            update.dismiss(this.data.updateInfo.version);
        }
        this._installAttempted = false;
        this.setData({updateSheetOpen: false, sheetCopyHint: '', installStage: 'idle', installPercent: 0, installBytesText: ''});
    },

    onUnload() {
        this._deltaAttempt = null;
        if(this._downloadTask && typeof this._downloadTask.abort === 'function'){
            try{ this._downloadTask.abort(); }catch(error){}
            this._downloadTask = null;
        }
    },

    // 多端 App 的扩展接口都挂在 wx.miniapp 上，而且要靠 project.miniapp.json 勾选对应扩展 SDK 才有。
    // 开发者工具里「默认全都有」，装到手机上就变成 undefined —— 这正是「点更新只复制了个地址」的原因。
    miniBridge() {
        return typeof wx !== 'undefined' && wx.miniapp ? wx.miniapp : null;
    },

    hasMiniApi(name) {
        const bridge = this.miniBridge();
        return !!(bridge && typeof bridge[name] === 'function');
    },

    // 「现在更新」：优先应用内下载并拉起安装器；不行再退系统浏览器；再不行才复制链接
    handleStartUpdate() {
        const info = this.data.updateInfo;
        if(!info)return;
        if(this.data.installStage !== 'idle')return;
        const target = info.downloadUrl || info.releaseUrl;
        if(!target){
            this.setData({sheetCopyHint: '这次更新没有提供下载地址，可到项目主页查看'});
            return;
        }
        if(info.downloadUrl && this.hasMiniApi('installApp') && typeof wx.downloadFile === 'function'){
            this._installAttempted = true;
            if(info.delta){
                const attempt = {};
                this._deltaAttempt = attempt;
                this.setData({installStage:'downloading',installPercent:0,installBytesText:'',sheetCopyHint:'正在检查增量更新'});
                if(appDelta.apply(this.miniBridge(),info.delta,path=>{
                    if(this._deltaAttempt !== attempt)return;
                    this._deltaAttempt = null;
                    if(path)this.installDownloaded(path,()=>this.startInAppInstall(info.downloadUrl));
                    else this.startInAppInstall(info.downloadUrl);
                }))return;
                this._deltaAttempt = null;
            }
            this.startInAppInstall(info.downloadUrl);
            return;
        }
        this._installAttempted = true;
        this.fallbackToBrowser(target, this.hasMiniApi('openUrl') ? '' : '当前安装包没有应用内安装能力（install SDK 未勾选）');
    },

    startInAppInstall(url) {
        const that = this;
        this.setData({ installStage: 'downloading', installPercent: 0, installBytesText: '', sheetCopyHint: '正在下载安装包，请保持网络畅通' });
        let task = null;
        const done = () => { that._downloadTask = null; };
        try {
            task = wx.downloadFile({
                url: url,
                timeout: DOWNLOAD_TIMEOUT,
                success(res) {
                    done();
                    const code = Number(res && res.statusCode) || 0;
                    if((code && code !== 200) || !res || !res.tempFilePath){
                        that.failInstall('下载没成功' + (code ? '（HTTP ' + code + '）' : ''));
                        return;
                    }
                    that.installDownloaded(res.tempFilePath);
                },
                fail(err) {
                    done();
                    that.failInstall(describeDownloadError(err));
                },
            });
        } catch (error) {
            done();
            this.failInstall('下载没有启动起来');
            return;
        }
        this._downloadTask = task;
        if(task && typeof task.onProgressUpdate === 'function'){
            task.onProgressUpdate(progress => {
                const percent = Math.max(0, Math.min(100, Number(progress && progress.progress) || 0));
                const bytes = bytesText(progress && progress.totalBytesWritten, progress && progress.totalBytesExpectedToWrite);
                // 每 2% 才 setData 一次，避免进度回调刷爆渲染层
                if(percent - that.data.installPercent >= 2 || percent === 100){
                    that.setData({ installPercent: percent, installBytesText: bytes });
                }
            });
        }
    },

    installDownloaded(filePath, fallback) {
        const that = this;
        this.setData({ installStage: 'installing', installPercent: 100, installBytesText: '', sheetCopyHint: '下载完成，正在打开安装程序' });
        try {
            this.miniBridge().installApp({
                filePath: filePath,
                success() {
                    that.setData({ installStage: 'idle', installPercent: 0, sheetCopyHint: '已交给系统安装器，按提示完成安装' });
                },
                fail(err) {
                    if(fallback)fallback();
                    else that.failInstall(describeInstallError(err));
                },
            });
        } catch (error) {
            if(fallback)fallback();
            else this.failInstall('没能打开安装程序');
        }
    },

    failInstall(message) {
        const info = this.data.updateInfo;
        const target = info ? (info.downloadUrl || info.releaseUrl) : '';
        this.setData({ installStage: 'idle', installPercent: 0, installBytesText: '' });
        if(target){
            this.fallbackToBrowser(target, message);
            return;
        }
        this.setData({ sheetCopyHint: message });
    },

    // 依次降级：系统浏览器 → 复制链接。每一级都把原因写在提示里，别让用户以为按钮坏了
    fallbackToBrowser(target, reason) {
        const that = this;
        const prefix = reason ? reason + '；' : '';
        if(this.hasMiniApi('openUrl')){
            this.miniBridge().openUrl({
                url: target,
                success() {
                    that.setData({ sheetCopyHint: prefix + '已用系统浏览器打开下载页' });
                },
                fail() {
                    that.copyLink(prefix);
                },
            });
            return;
        }
        this.copyLink(prefix);
    },

    // 兜底入口：环境不支持应用内安装和浏览器时，把链接复制给用户手动粘贴
    handleCopyUpdateLink(reason) {
        const prefix = typeof reason === 'string' && reason ? reason : '';
        this.copyLink(prefix);
    },

    copyLink(prefix) {
        const info = this.data.updateInfo;
        if(!info)return;
        const target = info.downloadUrl || info.releaseUrl;
        if(!target){
            this.setData({sheetCopyHint: '这次更新没有提供下载链接，可到项目主页查看'});
            return;
        }
        const that = this;
        wx.setClipboardData({
            data: target,
            success() {
                that.setData({sheetCopyHint: (prefix ? prefix + '；' : '') + '链接已复制，粘贴到浏览器打开即可下载'});
            },
            fail() {
                that.setData({sheetCopyHint: (prefix ? prefix + '；' : '') + '复制失败，可长按链接手动复制'});
            },
        });
    },

    // 长按版本号：把运行环境的接口情况复制出来，比在一堆日志里翻快
    handleEnvProbe() {
        const bridge = this.miniBridge();
        let names = [];
        if(bridge){
            try{ names = Object.keys(bridge).filter(key => typeof bridge[key] === 'function'); }catch(error){ names = []; }
        }
        const text = [
            'app ' + this.data.version,
            'wx.miniapp ' + (bridge ? '有' : '无'),
            'installApp ' + (this.hasMiniApi('installApp') ? '有' : '无'),
            'openUrl ' + (this.hasMiniApi('openUrl') ? '有' : '无'),
            '接口 ' + (names.length ? names.join(',') : '未列出'),
        ].join(' | ');
        wx.setClipboardData({
            data: text,
            success() {
                wx.showToast({ title: '环境信息已复制', icon: 'none' });
            },
            fail() {
                wx.showModal({ title: '当前环境', content: text, showCancel: false });
            },
        });
    },
}));
