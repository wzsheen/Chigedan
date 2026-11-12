const {withTheme}=require('../../utils/theme');
const {UPDATED,CONTACT,SECTIONS,WEB_URL}=require('../../utils/privacy-content');
Page(withTheme({
    data:{updated:UPDATED,contact:CONTACT,sections:SECTIONS,webUrl:WEB_URL,copyHint:''},
    handleCopyEmail(){
        wx.setClipboardData({data:CONTACT.email,success:()=>this.setData({copyHint:'联系邮箱已复制'}),fail:()=>this.setData({copyHint:'可长按邮箱手动复制'})});
    },
    // 「浏览器打开」：多端 App 走系统浏览器；微信小程序/开发者工具没有该 API 时退回复制
    handleOpenWeb(){
        const bridge=typeof wx!=='undefined' && wx.miniapp && typeof wx.miniapp.openUrl==='function' ? wx.miniapp : null;
        if(!bridge){
            this.handleCopyWeb();
            return;
        }
        bridge.openUrl({
            url:WEB_URL,
            success:()=>this.setData({copyHint:'已用浏览器打开在线版'}),
            fail:()=>this.handleCopyWeb(),
        });
    },
    handleCopyWeb(){
        wx.setClipboardData({
            data:WEB_URL,
            success:()=>this.setData({copyHint:'在线版链接已复制，可粘贴到浏览器打开'}),
            fail:()=>this.setData({copyHint:'复制失败，可长按链接手动复制'}),
        });
    },
}));
