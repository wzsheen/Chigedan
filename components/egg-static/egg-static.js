const {STATES}=require('../../utils/mascot-state');
const animation=require('../../utils/mascot-animation');
Component({
    properties:{state:{type:String,value:'idle',observer(value){const pose=Object.prototype.hasOwnProperty.call(STATES,value)?value:'idle';this.setData({pose,label:STATES[pose],artworkStyle:animation.presentation(pose).style});}}},
    data:{pose:'idle',label:STATES.idle,artworkStyle:animation.presentation('idle').style},
});
