// USDA SR Legacy 2018, CC0. Values per 100 g edible portion; sodium in mg.
// Household measures are estimates, never a measured serving weight.
const data = require('./nutrition-data.js');
function personal(name,unit) {
    try {
        const rows = wx.getStorageSync('cal_foods');
        return Array.isArray(rows) ? rows.find(row => row.name === name && (!unit || row.unit===unit) && Number.isFinite(row.kcal) && row.kcal>0) : null;
    } catch (_) { return null; }
}
// Explicit edible household weights. These remain portion estimates, not measured servings.
const householdGrams={黄瓜:{根:200},生菜:{份:100},芒果:{个:300},西瓜:{份:300},葡萄:{份:150},草莓:{份:200},全脂牛奶:{杯:250},原味全脂酸奶:{杯:200}};
function lookup(name, unit, builtinOnly) {
    const saved = builtinOnly ? null : personal(name,unit);
    if(saved && (!unit || saved.unit===unit)){const complete=saved.nutrition && ['p','c','f'].every(k=>Number.isFinite(saved.nutrition[k]));return Object.assign({},saved,complete?saved.nutrition:{p:null,c:null,f:null},{source:'personal',nutritionStatus:complete?'estimated':'incomplete',portionHint:complete?'个人确认份量与营养':'个人确认热量，营养素尚未补全'});}
    const chinese = require('./china-food-index').lookup(name, unit);
    if (chinese) return chinese;
    const weighted=require('./food-weight').lookup(name,unit);if(weighted)return weighted;
    const drink=require('./food-portions').beverage(name,unit);if(drink)return drink;
    const regional=require('./chongqing-foods').lookup(name,unit);
    if(regional)return regional;
    const row = data.find(row => row.name === name || row.aliases.includes(name) || (name==='牛奶' && row.name==='全脂牛奶'));
    if (!row) return null;
    const selected = unit || row.unit;
    const grams = selected === '升' && row.unit==='毫升' ? row.grams*1000 : selected === '克' ? 1 : selected === '千克' || selected === '公斤' ? 1000 : selected === '斤' ? 500 : selected === row.unit ? row.grams : (householdGrams[row.name] || {})[selected];
    if (!grams) return null;
    const scale = grams / 100;
    return {name:row.name,aliases:[...new Set(row.aliases.concat(name!==row.name?[name]:[]))],unit:selected,grams,portionHint:'参考1'+selected+'约'+grams+'g',kcal:row.per100g.kcal*scale,p:row.per100g.protein*scale,c:row.per100g.carb*scale,f:row.per100g.fat*scale,
        fiber:row.per100g.fiber===null?null:row.per100g.fiber*scale,
        sugar:row.per100g.sugar===null?null:row.per100g.sugar*scale,
        sodium:row.per100g.sodium===null?null:row.per100g.sodium*scale,
        source:'usda',fdcId:row.fdcId,portionEstimated:!['克','千克','公斤','斤'].includes(selected)};
}
module.exports={lookup,data,lookupBuiltin:(name,unit)=>lookup(name,unit,true)};
