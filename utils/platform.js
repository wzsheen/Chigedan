// 运行平台标识，供"两端都有、但表现不同"的逻辑统一判断。
//
// 能编译期剔除的差异（某端根本不该有的功能）应直接用条件编译，
// 不要经过本模块：
//     // #if MP
//     ...
//     // #endif
//
// 前提：必须在微信开发者工具「详情 - 本地设置 - 启用条件编译」中开启。
// 未开启时条件标记会被当作普通注释，本模块 detect() 会固定返回 'wechat'，
// App 端将退化为小程序行为。发版前务必在「关于」页核对 PLATFORM 值，
// 或分别编译小程序/Android 产物确认标记已生效。
//
// 注意：这里刻意用函数 + return，而不是顺序赋值。若用 PLATFORM = 'x' 的写法，
// 未开启条件编译时每个分支都会执行，最终恒等于最后一个分支，比误判更糟。

function detect() {
    // #if MP
    return 'wechat';
    // #endif

    // #if ANDROID
    return 'android';
    // #endif

    // #if IOS
    return 'ios';
    // #endif

    return 'wechat';
}

const PLATFORM = detect();

const isWeChat = PLATFORM === 'wechat';
const isAndroid = PLATFORM === 'android';
const isIOS = PLATFORM === 'ios';
const isApp = isAndroid || isIOS;

/* ---------- 能力开关 ---------- */

// APK 自更新、外链跳转依赖 wx.miniapp，仅 App 端可用。
function supportsAppBridge() {
    return isApp && typeof wx !== 'undefined' && !!wx.miniapp;
}

// 分享到聊天、微信客服等能力仅小程序端有意义。
function supportsWeChatShare() {
    return isWeChat;
}

module.exports = {
    PLATFORM,
    isWeChat,
    isApp,
    isAndroid,
    isIOS,
    supportsAppBridge,
    supportsWeChatShare
};
