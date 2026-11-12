// 前台恢复重绘
//
// 现象：Android 打包版切到后台十几秒再回来，整页空白，原生导航栏还在，
// 点一下屏幕内容才重新出现。
// 原因：宿主暂停期间系统 WebView 释放了页面合成层的纹理，恢复时没有重新光栅化。
// 逻辑层和 DOM 都还在，所以点一下（触发样式失效）就能画出来。
// 处理：回到前台后，对当前页面根节点上绑定的 uiThemeClass 做一次「加类-还原」抖动。
// 临时类在 app.wxss 里只改一点点透明度（.ui-repaint { opacity:.999 }），肉眼看不出来，
// 但会对整棵子树产生一次真实的绘制失效，逼浏览器重新光栅化整页。
// 只换类名而样式完全不变的话，Blink 会跳过这次重绘，所以必须带上那条样式规则。
// 不用 transform/filter 是因为它们会改变 fixed 的包含块，底部导航会跳位。
// 只依赖 setData 和 getCurrentPages，小程序与 App 共用；后台不足 2 秒的切出不抖，
// 避免看通知栏、切输入法这类短切换引起无意义重绘。

const TRANSIENT_CLASS = 'ui-repaint';
const MIN_BACKGROUND_MS = 2000;
const CLASS_RESTORE_GAP_MS = 32; // 跨过一个渲染帧再还原，确保失效已经提交
const FOLLOW_UP_DELAY_MS = 280; // 首帧可能还没准备好，补一次

let hiddenAt = 0;
let followUpTimer = null;

function readClass(page) {
    try {
        const value = page && page.data ? page.data.uiThemeClass : '';
        return typeof value === 'string' ? value : '';
    } catch (error) {
        return '';
    }
}

function withoutTransient(className) {
    return String(className || '')
        .split(/\s+/)
        .filter(item => item && item !== TRANSIENT_CLASS)
        .join(' ');
}

function currentPage() {
    if (typeof getCurrentPages !== 'function') return null;
    let pages;
    try {
        pages = getCurrentPages();
    } catch (error) {
        return null;
    }
    if (!Array.isArray(pages) || pages.length === 0) return null;
    const page = pages[pages.length - 1];
    return page && typeof page.setData === 'function' ? page : null;
}

// 返回 true 表示这次真的抖动了。页面根节点没绑 uiThemeClass（如 ai-provider 的 web-view 页）时返回 false。
function nudge(page) {
    if (!page || typeof page.setData !== 'function') return false;
    const base = readClass(page);
    const clean = withoutTransient(base);
    if (clean === '') return false;
    if (base !== clean) {
        // 上次抖动没还原（页面在还原前被隐藏或卸载过），先清掉再退出
        try { page.setData({ uiThemeClass: clean }); } catch (error) {}
        return false;
    }
    try {
        page.setData({ uiThemeClass: base + ' ' + TRANSIENT_CLASS }, () => {
            setTimeout(() => {
                const now = readClass(page) || base;
                try { page.setData({ uiThemeClass: withoutTransient(now) || clean }); } catch (error) {}
            }, CLASS_RESTORE_GAP_MS);
        });
        return true;
    } catch (error) {
        return false;
    }
}

// 记录离开前台的时刻；离开期间不安排任何定时器，避免在后台空转。
function onAppHide() {
    hiddenAt = Date.now();
    if (followUpTimer) {
        clearTimeout(followUpTimer);
        followUpTimer = null;
    }
}

// 从后台回来时调用。冷启动（没进过后台）和短于 2 秒的切换直接跳过。
function onAppShow() {
    const backgroundMs = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (followUpTimer) {
        clearTimeout(followUpTimer);
        followUpTimer = null;
    }
    if (backgroundMs < MIN_BACKGROUND_MS) return false;
    const repainted = nudge(currentPage());
    followUpTimer = setTimeout(() => {
        followUpTimer = null;
        nudge(currentPage());
    }, FOLLOW_UP_DELAY_MS);
    return repainted;
}

function reset() {
    hiddenAt = 0;
    if (followUpTimer) {
        clearTimeout(followUpTimer);
        followUpTimer = null;
    }
}

module.exports = { onAppShow, onAppHide, nudge, currentPage, reset, TRANSIENT_CLASS };
