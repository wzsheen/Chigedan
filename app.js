const theme=require('./utils/theme');
const repaint=require('./utils/repaint');
App({
    onLaunch(){theme.initialize();},
    // 先修主题，再补一次页面重绘：Android 打包版从后台回来后系统 WebView 常整页空白，
    // 需要一次样式失效才会重新光栅化，详见 utils/repaint.js。
    onShow(){theme.refreshSystem();repaint.onAppShow();},
    onHide(){repaint.onAppHide();},
    globalData: {
        appName: '吃个蛋',
        // 身体数据（身高 / 体重）版本号：子页面改动后 +1，首页据此判断是否需要高亮提示。
        bodyRevision: 0,
    },


    // 子页面保存身高或体重后调用，通知首页「身体数据已变」。
    markBodyChanged() {
        const next = Number(this.globalData.bodyRevision) || 0;
        this.globalData.bodyRevision = next + 1;
        return this.globalData.bodyRevision;
    },
});
