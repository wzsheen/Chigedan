const STATES={idle:'眨眼和挥手，等你记录',success:'轻跳庆祝记录成功',balanced:'点赞并抱住绿叶',adjust:'思考并指向蔬菜',water:'举杯喝水',sleep:'抱月打哈欠，安心休息',goal:'指向目标入口'};
Object.assign(STATES,{spring:'春节作揖',lantern:'元宵提灯',dragonboat:'端午抱粽子',midautumn:'中秋赏月',halloween:'万圣节南瓜灯',christmas:'圣诞礼物'});
function resolve({kind,count,hour,water,waterGoal,event}){
    if(event==='success' || event==='water') return event;
    if(hour>=21 || hour<6) return 'sleep';
    if(count>0 && kind==='adjust') return 'adjust';
    if(count>0 && kind==='good') return 'balanced';
    return 'idle';
}
function shouldRemindWater({kind,count,hour,water,waterGoal}){
    if(hour<11 || hour>=21)return false;
    if(!Number.isFinite(water) || water<0 || !Number.isFinite(waterGoal) || waterGoal<=0)return false;
    const progress=Math.max(0,Math.min(1,(hour-7)/14));
    return water<waterGoal*progress*.6;
}
module.exports={STATES,resolve,shouldRemindWater};
