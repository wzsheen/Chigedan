const {withTheme}=require('../../utils/theme');
const providers = require('../../utils/ai-providers.js');
Page(withTheme({
    data:{url:'',name:'服务商',failed:false},
    onLoad(options) {
        const provider = providers.getProvider(options && options.provider);
        this.provider = provider;
        this.setData({name:provider.name,url:provider.keyUrl,failed:!provider.keyUrl});
    },
    handleError() { this.setData({failed:true,url:''}); },
    handleCopy() {
        if (!this.provider || !this.provider.keyUrl) return;
        wx.setClipboardData({data:this.provider.keyUrl,success:() => wx.showToast({title:'已复制，请在浏览器打开',icon:'none'})});
    },
    handleBack() { wx.navigateBack(); },
}));
