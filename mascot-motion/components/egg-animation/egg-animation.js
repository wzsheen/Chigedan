const {STATES}=require('../../../utils/mascot-state');
const animation=require('../../../utils/mascot-animation');
Component({
    properties:{
        state:{type:String,value:'idle',observer(value){this.changeState(value);}},
        eventToken:{type:Number,value:0,observer(){this.restart();}},
    },
    data:{pose:'idle',label:STATES.idle,row:0,column:0,atlas:animation.ASSET,ready:false,artworkAvailable:false,artworkStyle:animation.presentation('idle').style},
    lifetimes:{
        attached(){this.alive=true;this.visible=true;this.changeState(this.properties.state);this.loadArtwork();},
        detached(){this.alive=false;this.visible=false;this.stop();},
    },
    pageLifetimes:{
        show(){this.visible=true;this.restart();this.loadArtwork();},
        hide(){this.visible=false;this.stop();},
    },
    methods:{
        changeState(value){
            const pose=animation.safeState(value);
            if(this.data.pose===pose && this.startedAt)return;
            const atlas=animation.assetFor(pose);
            this.setData({pose,atlas,artworkAvailable:true,ready:atlas===this.data.atlas?this.data.ready:false,label:pose==='rest'?'安静眨眼，陪你休息':STATES[pose]});this.restart();
        },
        loadArtwork(){
            if(this.alive && !this.data.artworkAvailable)this.setData({artworkAvailable:true});
        },
        handleAtlasLoad(){if(this.alive){this.setData({ready:true});this.restart();}},
        handleAtlasError(){this.stop();if(this.alive)this.setData({ready:false,artworkAvailable:false});},
        stop(){clearTimeout(this.frameTimer);this.frameTimer=null;},
        restart(){this.stop();this.startedAt=Date.now();this.paintFrame();},
        paintFrame(){
            const frame=animation.frameAt(this.data.pose,Date.now()-(this.startedAt||Date.now()));
            const artworkStyle=animation.presentation(Object.keys(animation.ROWS).find(key=>animation.ROWS[key]===frame.row)).style;
            if(this.data.row!==frame.row || this.data.column!==frame.column || this.data.artworkStyle!==artworkStyle)this.setData({row:frame.row,column:frame.column,artworkStyle});
            if(this.alive && this.visible && this.data.ready){
                this.frameTimer=setTimeout(()=>{this.frameTimer=null;this.paintFrame();},Math.max(16,Math.ceil(frame.remaining)));
            }
        },
    },
});
