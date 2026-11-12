const {withTheme}=require('../../utils/theme');
const launchSchedule=require('../../utils/launch-schedule');
// Only the normal launch route visits this page. Shared/deep-linked pages keep
// their destination; returning from the background does not replay the welcome.
const DISPLAY_MS=1000;
Page(withTheme({
    themeOverride:'light',
    data:{navigationError:false,viewportHeight:0,birthdayVideo:false},
    onLoad(){
        this.setData({birthdayVideo:launchSchedule.shouldPlayBirthdayVideo()});
        this.remaining=DISPLAY_MS;this.loadedAssets=new Set();
        try{const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():typeof wx.getSystemInfoSync==='function'?wx.getSystemInfoSync():{};
            if(Number.isFinite(info.windowHeight) && info.windowHeight>0)this.setData({viewportHeight:info.windowHeight});}catch(error){}
    },
    handleAssetReady(event){
        if(this.disposed || this.redirecting)return;
        const asset=event.currentTarget.dataset.asset;
        if(!['logo','slogan'].includes(asset))return;
        this.loadedAssets.add(asset);
        if(this.loadedAssets.size===2 && !this.assetsReady){
            this.assetsReady=true;this.remaining=DISPLAY_MS;
            if(this.visible)this.onShow();
        }
    },
    onShow(){
        this.visible=true;
        if(this.redirecting || this.disposed || this.data.navigationError)return;
        if(this.data.birthdayVideo){
            this.redirecting=true;
            wx.redirectTo({url:'/launch-video/player/index',fail:()=>{if(this.disposed)return;this.redirecting=false;this.enterHome();}});
            return;
        }
        clearTimeout(this.timer);
        this.shownAt=Date.now();
        this.timer=setTimeout(()=>this.enterHome(),this.assetsReady?Math.max(0,this.remaining):4000);
    },
    onHide(){
        this.visible=false;
        clearTimeout(this.timer);
        if(this.assetsReady)this.remaining=Math.max(0,this.remaining-(Date.now()-this.shownAt));
    },
    onUnload(){this.disposed=true;clearTimeout(this.timer);},
    enterHome(){
        if(this.redirecting || this.disposed || !this.visible)return;
        clearTimeout(this.timer);
        this.redirecting=true;
        this.setData({navigationError:false});
        wx.redirectTo({url:'/pages/index/index',fail:()=>{
            if(this.disposed)return;
            this.redirecting=false;
            this.setData({navigationError:true});
        }});
    },
}));
