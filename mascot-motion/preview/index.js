const {STATES}=require('../../../utils/mascot-state');
Page({data:{states:Object.keys(STATES).map(key=>({key,label:STATES[key]}))}});
