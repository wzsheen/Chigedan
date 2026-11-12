// 「检查更新」客户端逻辑。
//
// 为什么不是小程序直连 GitHub：
//   1. api.github.com 无法通过 request 合法域名的归属校验，正式版请求会被直接拦截；
//   2. 仓库是私有的，读 Release 必须带 token，而 token 一旦打进小程序包就等于公开。
// 所以客户端只请求「自己的」版本接口，由服务端带 token 读 GitHub 后返回一份精简 JSON。
// 接口地址写在 DEFAULT_ENDPOINT（一个 HTTPS 的 JSON 地址就够，静态文件也行）；调试时可用 cal_update_endpoint 临时覆盖。
//
// 接口约定（两种返回都认）：
//   A. 精简结构 { version, notes, releaseUrl, downloadUrl, publishedAt }
//   B. GitHub Release 原始结构（tag_name / body / html_url / assets[]），原样透传即可
// 必须与 project.miniapp.json 的 version 一致（那是 APK 安装包上看到的版本），
// tests/app-update.test.js 会校验两者同步；发版时用 node scripts/bump-version.js 一起改。
const appDelta = require('./app-delta');
const LOCAL_VERSION = '0.0.4';
const BUILD_CHANNEL = 'development';
const DEFAULT_ENDPOINT = 'https://wzsheen.github.io/Chigedan/version.json';
const ENDPOINT_KEY = 'cal_update_endpoint';
const CACHE_KEY = 'cal_update_cache';
const REQUEST_TIMEOUT = 8000;
const CACHE_TTL = 5 * 60 * 1000;
// 「稍后」只静音一段时间，不是永久静音：以前只存版本号，关一次就再也不弹，
// 用户以为自动检查坏了。现在存版本 + 时间，冷却期过了（或换了新版本）继续提醒。
const DISMISS_KEY = 'cal_update_dismissed';
const DISMISS_LEGACY_KEY = 'cal_update_dismissed_version';
const DISMISS_COOLDOWN = 24 * 60 * 60 * 1000;
// 弹窗频率上限：只要弹窗真的展示过，24 小时内不再弹第二次。
// 和上面的「稍后」不同——「稍后」是用户的意愿，这里纯粹是防打扰：
// 不管用户点「稍后」、点「现在更新」、下载失败、还是按返回键退出，都算用掉这一次。
// 判断时不看版本号：新版本也等冷却结束再提醒，一整天最多一次。
const PROMPT_KEY = 'cal_update_last_prompt';
const PROMPT_COOLDOWN = 24 * 60 * 60 * 1000;

function endpoint() {
    let override = '';
    try {
        override = typeof wx.getStorageSync === 'function' ? wx.getStorageSync(ENDPOINT_KEY) : '';
    } catch (error) {
        override = '';
    }
    const raw = typeof override === 'string' && override.trim() !== '' ? override.trim() : DEFAULT_ENDPOINT;
    return String(raw || '').replace(/\/+$/, '');
}

function localVersion() {
    return LOCAL_VERSION;
}

// 包里写死的版本号不一定等于手机上实际装的版本：
// 比如 0.0.2 的 APK 是用旧代码构建的，常量还停在 0.0.1，于是永远提示「有新版本」，
// 点更新又装回同一个版本，死循环。运行时有 wx.getAppBaseInfo 就以它为准。
function appVersion() {
    try {
        if (typeof wx !== 'undefined' && typeof wx.getAppBaseInfo === 'function') {
            const info = wx.getAppBaseInfo();
            const version = info && (info.appVersion || (info.host && info.host.appVersion));
            if (version && /^\d+(\.\d+){1,3}([-+][0-9A-Za-z.]+)?$/.test(String(version))) {
                return String(version);
            }
        }
    } catch (error) {
        // getAppBaseInfo 在小程序/工具里可能不存在，静默回落到常量
    }
    return LOCAL_VERSION;
}

// 版本文件是静态资源，对象存储/CDN 很容易把它缓存几十分钟，
// 结果「发了新版、App 还说已是最新」。带个时间戳参数绕开缓存，静态托管会忽略多余参数。
function withCacheBuster(url) {
    if (!url) {
        return url;
    }
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();
}

// 只取开头的数字段和可选的预发布标识（1.2.3、v1.2.3、1.2.3-beta.1 都认）
function parseVersion(value) {
    const text = String(value === null || value === undefined ? '' : value).trim().replace(/^v/i, '');
    const match = text.match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/);
    if (!match) {
        return null;
    }
    return { parts: match[1].split('.').map(part => Number(part) || 0), pre: match[2] || '' };
}

// 返回 1 表示 left 更新，-1 表示更旧，0 表示同版本；解析不了的按相等处理，避免误报更新
function compareVersion(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b) {
        return 0;
    }
    const length = Math.max(a.parts.length, b.parts.length);
    for (let i = 0; i < length; i += 1) {
        const x = a.parts[i] || 0;
        const y = b.parts[i] || 0;
        if (x !== y) {
            return x > y ? 1 : -1;
        }
    }
    if (a.pre === b.pre) {
        return 0;
    }
    // 同号版本里正式版比预发布新
    if (!a.pre) {
        return 1;
    }
    if (!b.pre) {
        return -1;
    }
    return a.pre > b.pre ? 1 : -1;
}

function pickAsset(raw) {
    const assets = Array.isArray(raw.assets) ? raw.assets : [];
    // APK 优先：这个 App 的分发产物就是安装包
    const preferred = assets.find(asset => asset && /\.apk$/i.test(String(asset.name || asset.browser_download_url || '')))
        || assets.find(asset => asset && /\.(ipa|zip|dmg|exe)$/i.test(String(asset.name || asset.browser_download_url || '')))
        || assets[0];
    const directUrl = String(raw.downloadUrl || '');
    return {
        url: directUrl || (preferred && preferred.browser_download_url ? String(preferred.browser_download_url) : ''),
        name: preferred && preferred.name ? String(preferred.name) : '',
        size: Number(preferred && preferred.size) || Number(raw.assetSize) || 0,
    };
}

// 安装包大小：只给个量级，MB 保留一位，KB 取整
function formatSize(bytes) {
    const value = Number(bytes) || 0;
    if (value <= 0) {
        return '';
    }
    if (value < 1024 * 1024) {
        return Math.max(1, Math.round(value / 1024)) + ' KB';
    }
    return (value / 1024 / 1024).toFixed(1) + ' MB';
}

function normalizePayload(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const version = String(input.version || input.tag_name || '').trim().replace(/^v/i, '');
    const notes = typeof input.notes === 'string' ? input.notes : (typeof input.body === 'string' ? input.body : '');
    const releaseUrl = String(input.releaseUrl || input.html_url || '');
    const publishedAt = String(input.publishedAt || input.published_at || '');
    const asset = pickAsset(input);
    return {
        version: version,
        notes: notes,
        releaseUrl: releaseUrl,
        downloadUrl: asset.url,
        delta: appDelta.normalize(input.delta),
        assetName: input.assetName ? String(input.assetName) : asset.name,
        assetSize: asset.size,
        sizeText: formatSize(asset.size),
        publishedAt: publishedAt,
    };
}

function safeParse(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function writeCache(result) {
    try {
        if (typeof wx.setStorageSync === 'function') {
            wx.setStorageSync(CACHE_KEY, { checkedAt: Date.now(), result: result });
        }
    } catch (error) {
        // 缓存写失败不影响本次结果
    }
}

function readCache() {
    try {
        const cached = typeof wx.getStorageSync === 'function' ? wx.getStorageSync(CACHE_KEY) : null;
        if (cached && typeof cached === 'object' && cached.result) {
            return { checkedAt: Number(cached.checkedAt) || 0, result: cached.result };
        }
    } catch (error) {
        // 读不到就当没有缓存
    }
    return null;
}

function isCacheFresh(checkedAt) {
    return Number(checkedAt) > 0 && Date.now() - Number(checkedAt) < CACHE_TTL;
}

// ---- 「稍后」冷却 ----
// 老键里只有版本号没有时间，没法判断隔了多久，统一按「冷却已过」处理：
// 升级到这一版之后，被永久静音的那次提醒会重新出现一次。
function readDismiss() {
    try {
        const raw = typeof wx.getStorageSync === 'function' ? wx.getStorageSync(DISMISS_KEY) : null;
        if (raw && typeof raw === 'object' && raw.version) {
            return { version: String(raw.version), at: Number(raw.at) || 0 };
        }
    } catch (error) {
        // 读不到就当没关过
    }
    return null;
}

function isDismissed(version, now) {
    const record = readDismiss();
    if (!record || !version) {
        return false;
    }
    if (record.version !== String(version)) {
        return false;
    }
    const ts = Number(now) || Date.now();
    return ts - record.at < DISMISS_COOLDOWN;
}

function dismiss(version, now) {
    if (!version) {
        return false;
    }
    try {
        if (typeof wx.setStorageSync === 'function') {
            wx.setStorageSync(DISMISS_KEY, { version: String(version), at: Number(now) || Date.now() });
        }
        // 清掉老键，避免两套记录互相打架
        if (typeof wx.removeStorageSync === 'function') {
            wx.removeStorageSync(DISMISS_LEGACY_KEY);
        }
        return true;
    } catch (error) {
        return false;
    }
}

function clearDismiss() {
    try {
        if (typeof wx.removeStorageSync === 'function') {
            wx.removeStorageSync(DISMISS_KEY);
            wx.removeStorageSync(DISMISS_LEGACY_KEY);
        }
    } catch (error) {
        // 清不掉也不影响本次使用
    }
}

// ---- 弹窗 24 小时上限 ----
// 记录写在「弹窗展示」的那一刻，而不是关闭的时候：用户按系统返回键退出、
// 下载中途失败、直接杀进程，都不会漏记，第二天之前不会再弹。
function readPrompt() {
    try {
        const raw = typeof wx.getStorageSync === 'function' ? wx.getStorageSync(PROMPT_KEY) : null;
        if (raw && typeof raw === 'object' && Number(raw.at) > 0) {
            return { version: String(raw.version || ''), at: Number(raw.at) };
        }
    } catch (error) {
        // 读不到就当没弹过
    }
    return null;
}

function isPromptCooling(now) {
    const record = readPrompt();
    if (!record) {
        return false;
    }
    return (Number(now) || Date.now()) - record.at < PROMPT_COOLDOWN;
}

function markPrompted(version, now) {
    try {
        if (typeof wx.setStorageSync !== 'function') {
            return false;
        }
        wx.setStorageSync(PROMPT_KEY, { version: String(version || ''), at: Number(now) || Date.now() });
        return true;
    } catch (error) {
        return false;
    }
}

function clearPrompt() {
    try {
        if (typeof wx.removeStorageSync === 'function') {
            wx.removeStorageSync(PROMPT_KEY);
        }
    } catch (error) {
        // 清不掉也不影响本次使用
    }
}

// 把日期字符串转成「2026年11月3日」，解析不了就返回空串，不硬编日期
function formatDate(value) {
    if (!value) {
        return '';
    }
    const date = new Date(value);
    if (!date || isNaN(date.getTime())) {
        return '';
    }
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

// 「刚刚 / 12 分钟前 / 今天 21:05 / 11月3日 21:05」
function formatCheckedAt(timestamp) {
    const ts = Number(timestamp) || 0;
    if (!ts) {
        return '';
    }
    const now = new Date();
    const diff = now.getTime() - ts;
    if (diff >= 0 && diff < 60 * 1000) {
        return '刚刚';
    }
    if (diff >= 0 && diff < 60 * 60 * 1000) {
        return Math.floor(diff / 60000) + ' 分钟前';
    }
    const then = new Date(ts);
    const sameDay = then.getFullYear() === now.getFullYear()
        && then.getMonth() === now.getMonth()
        && then.getDate() === now.getDate();
    const hh = String(then.getHours()).padStart(2, '0');
    const mm = String(then.getMinutes()).padStart(2, '0');
    if (sameDay) {
        return '今天 ' + hh + ':' + mm;
    }
    return (then.getMonth() + 1) + '月' + then.getDate() + '日 ' + hh + ':' + mm;
}

// 失败不写缓存：错误信息不该变成「下次进页面还挂着上次的错误」
function failure(status, message) {
    return { ok: false, status: status, message: message, localVersion: appVersion() };
}

function check() {
    const current = appVersion();
    const url = withCacheBuster(endpoint());
    if (!url) {
        return Promise.resolve({
            ok: false,
            status: 'unconfigured',
            message: '还没配置更新服务地址',
            localVersion: current,
        });
    }
    if (!/^https:\/\//i.test(url)) {
        return Promise.resolve(failure('error', '更新服务地址必须是 HTTPS'));
    }

    return new Promise(resolve => {
        let settled = false;
        const finish = result => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };
        // wx.request 的 timeout 在部分基础库上不生效，自己再兜一层
        const timer = setTimeout(() => finish(failure('error', '检查超时，稍后再试')), REQUEST_TIMEOUT + 3000);

        wx.request({
            url: url,
            method: 'GET',
            timeout: REQUEST_TIMEOUT,
            header: { 'content-type': 'application/json', accept: 'application/json' },
            success(response) {
                const code = Number(response && response.statusCode) || 0;
                if (code === 404) {
                    return finish(failure('error', '更新服务地址不存在（404），请检查配置'));
                }
                if (code < 200 || code >= 300) {
                    return finish(failure('error', '更新服务返回异常（' + code + '）'));
                }
                const data = typeof response.data === 'string' ? safeParse(response.data) : response.data;
                if (!data || typeof data !== 'object') {
                    return finish(failure('error', '更新信息格式不对'));
                }
                const payload = normalizePayload(data);
                if (!payload.version) {
                    return finish(failure('error', '更新信息里没有版本号'));
                }
                const order = compareVersion(payload.version, current);
                if (order <= 0) {
                    const latest = {
                        ok: true,
                        status: 'latest',
                        message: '已是最新版本',
                        localVersion: current,
                        remoteVersion: payload.version,
                    };
                    writeCache(latest);
                    return finish(latest);
                }
                const found = {
                    ok: true,
                    status: 'new',
                    message: '发现新版本 v' + payload.version,
                    localVersion: current,
                    remoteVersion: payload.version,
                    notes: payload.notes,
                    releaseUrl: payload.releaseUrl,
                    downloadUrl: payload.downloadUrl,
                    delta: payload.delta,
                    assetName: payload.assetName,
                    assetSize: payload.assetSize,
                    sizeText: payload.sizeText,
                    publishedAt: payload.publishedAt,
                    dateText: formatDate(payload.publishedAt),
                };
                writeCache(found);
                finish(found);
            },
            fail() {
                finish(failure('error', '网络不通，检查网络后再试'));
            },
        });
    });
}

module.exports = {
    LOCAL_VERSION,
    BUILD_CHANNEL,
    DISMISS_COOLDOWN,
    PROMPT_COOLDOWN,
    localVersion,
    appVersion,
    compareVersion,
    normalizePayload,
    formatDate,
    formatSize,
    formatCheckedAt,
    isCacheFresh,
    readCache,
    readDismiss,
    isDismissed,
    dismiss,
    clearDismiss,
    readPrompt,
    isPromptCooling,
    markPrompted,
    clearPrompt,
    withCacheBuster,
    check,
};
