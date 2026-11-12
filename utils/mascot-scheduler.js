const animation=require('./mascot-animation');
const {shouldRemindWater}=require('./mascot-state');
const ROUNDS={water:3,adjust:3,balanced:3,success:3,sleep:2};
const COOLDOWN=20*60*1000;
const IDLE_GAP=30*1000;
function candidates(input){
    if(input.hour>=21 || input.hour<6)return ['sleep'];
    const rows=[];
    if(shouldRemindWater(input))rows.push('water');
    if(input.count>0 && !input.nutritionMissing){
        if(input.kind==='adjust')rows.push('adjust');
        if(input.kind==='good')rows.push('balanced');
    }
    return rows;
}
function createScheduler(){
    const lastPlayed={};
    let finishedAt=null;
    return {
        next(input,now){
            if(finishedAt!==null && now-finishedAt<IDLE_GAP)return null;
            const eligible=candidates(input).filter(kind=>lastPlayed[kind]===undefined || now-lastPlayed[kind]>=COOLDOWN);
            // Oldest/unplayed reminder first; ties keep water before diet advice.
            eligible.sort((a,b)=>{
                const left=lastPlayed[a],right=lastPlayed[b];
                if(left===right)return 0;
                if(left===undefined)return -1;
                if(right===undefined)return 1;
                return left-right;
            });
            return eligible[0] || null;
        },
        begin(kind,now){
            if(!Object.prototype.hasOwnProperty.call(ROUNDS,kind))return 0;
            lastPlayed[kind]=now;
            return animation.duration(kind)*ROUNDS[kind];
        },
        finish(now){finishedAt=now;},
    };
}
module.exports={createScheduler,candidates,ROUNDS,COOLDOWN,IDLE_GAP};
