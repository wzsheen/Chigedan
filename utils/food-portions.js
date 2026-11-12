const PACKAGE_UNITS=['瓶','罐','盒','袋','包','桶'];
function isDrink(name){return /可乐|汽水|雪碧|芬达|饮料|果汁|橙汁|奶茶|咖啡|豆浆|酸奶|牛奶|啤酒|矿泉水|苏打水|气泡水|茶饮|瓶装水/.test(name);}
function details(name,unit){
    const typeMissing=['饮料','果汁','汽水','茶饮','奶制品','零食'].includes(name);
    const capacity=PACKAGE_UNITS.includes(unit) && isDrink(name);
    if(typeMissing)return {requiresDetail:true,needsCapacity:capacity,reason:capacity?'已识别数量，请确认饮品种类、含糖情况和每'+unit+'容量':'已识别数量，请确认具体食物种类'};
    if(capacity)return {requiresDetail:true,needsCapacity:true,reason:'已识别数量，请确认每'+unit+'容量（毫升），不同包装容量不能直接换算'};
    if(PACKAGE_UNITS.includes(unit))return {requiresDetail:true,needsWeight:true,reason:'已识别数量，请确认每'+unit+'净含量（克）；包装大小不能直接换算'};
    return null;
}
function beverage(name,unit){
    const row=require('./beverage-data').find(row=>row.name===name || row.aliases.includes(name));
    if(!row)return null;
    const selected=unit || row.unit;
    const amount=selected==='毫升' || selected==='克'?1:selected==='升'?1000:selected===row.unit?row.amount:null;
    if(!amount)return null;
    const result={name:row.name,aliases:row.aliases,unit:selected,grams:amount,source:'usda',fdcId:row.fdcId,portionEstimated:selected!=='克',portionHint:selected==='克'?'按每克成分参考估算':'参考换算：1毫升约1克；请优先核对实际包装营养标签'};
    for(const key of ['kcal','p','c','f'])result[key]=row.per100g[key]*amount/100;
    return result;
}
module.exports={PACKAGE_UNITS,isDrink,details,beverage};
