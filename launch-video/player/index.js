// Temporary launch preview. Date and frequency rules are intentionally not enabled.
Page({
 data:{videoSrc:'',playing:false,showPlay:false,navigationError:false},
 onLoad(query){this.visible=true;this.previewHold=query && query.hold==='1';this.loadTimer=setTimeout(()=>this.enterHome(),15000);},
 onReady(){
  const ready=path=>{if(this.disposed || this.leaving)return;this.setData({videoSrc:path},()=>{this.video=wx.createVideoContext('birthdayVideo',this);this.startPlayback();});};
  if(typeof wx.getFileSystemManager==='function' && wx.env && wx.env.USER_DATA_PATH){
   const path=wx.env.USER_DATA_PATH+'/birthday-launch-preview.mp4';
   wx.getFileSystemManager().copyFile({srcPath:'/launch-video/assets/birthday.mp4',destPath:path,success:()=>ready(path),fail:event=>this.handleError(event)});
  }else ready('/launch-video/assets/birthday.mp4');
 },
 startPlayback(){
  if(this.disposed || !this.visible || this.leaving)return;
  if(this.video)this.video.play();
  clearTimeout(this.playHintTimer);
  this.playHintTimer=setTimeout(()=>{if(!this.disposed && this.visible && !this.data.playing)this.setData({showPlay:true});},1500);
  clearTimeout(this.loadTimer);
  this.loadTimer=setTimeout(()=>{if(!this.disposed && this.visible && !this.data.playing)this.enterHome();},15000);
 },
 handlePlay(){clearTimeout(this.playHintTimer);clearTimeout(this.loadTimer);this.setData({playing:true,showPlay:false});},
 handleTimeUpdate(event){if(this.previewHold && event.detail.currentTime>=3){this.previewHold=false;if(this.video)this.video.pause();}},
 handleEnded(){this.enterHome();},
 handleError(){this.enterHome();},
 onHide(){this.visible=false;this.clearTimers();if(this.video)this.video.pause();},
 onShow(){this.visible=true;if(this.video)this.startPlayback();},
 onUnload(){this.disposed=true;this.clearTimers();if(this.video)this.video.stop();},
 clearTimers(){clearTimeout(this.playHintTimer);clearTimeout(this.loadTimer);},
 enterHome(){
  if(this.disposed || !this.visible || this.leaving)return;
  this.leaving=true;this.clearTimers();if(this.video)this.video.pause();
  wx.redirectTo({url:'/pages/index/index',fail:()=>{if(this.disposed)return;this.leaving=false;this.setData({navigationError:true,showPlay:false});}});
 }
});
