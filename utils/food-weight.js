// All new weight-based estimates use per-100g nutrition plus an explicit unit weight.
function sanitize(raw){
    if(!raw||typeof raw!=='object')return null;
    const grams=raw.gramsPerUnit,per=raw.per100g;
    if(!Number.isFinite(grams)||grams<=0||grams>10000||!per)return null;
    if(!['kcal','protein','carb','fat'].every(key=>typeof per[key]==='number'&&Number.isFinite(per[key])&&per[key]>=0))return null;
    if(per.kcal<=0||per.kcal>900||per.protein+per.carb+per.fat>105)return null;
    const energy=per.protein*4+per.carb*4+per.fat*9;
    if(energy<=0||Math.abs(energy-per.kcal)>Math.max(10,per.kcal*.2))return null;
    return {gramsPerUnit:grams,per100g:{kcal:per.kcal,protein:per.protein,carb:per.carb,fat:per.fat}};
}
function forUnit(basis,qty=1){const clean=sanitize(basis);if(!clean||!Number.isFinite(qty)||qty<=0)return null;const scale=clean.gramsPerUnit*qty/100;return {kcal:clean.per100g.kcal*scale,protein:clean.per100g.protein*scale,carb:clean.per100g.carb*scale,fat:clean.per100g.fat*scale,totalGrams:clean.gramsPerUnit*qty,weightBasis:clean};}
const SMALL_BUN={gramsPerUnit:32.5,per100g:{kcal:233.4,protein:10.1,carb:28.9,fat:8.6}};
function lookup(name,unit){
    if(!['小笼包','小籠包','小笼汤包','小籠湯包','鲜肉小笼包'].includes(name))return null;
    const selected=unit||'个',grams={个:32.5,只:32.5,克:1,千克:1000,公斤:1000,斤:500}[selected];if(!grams)return null;
    const basis={gramsPerUnit:grams,per100g:SMALL_BUN.per100g},value=forUnit(basis);
    return {name:'小笼包',aliases:['小籠包','小笼汤包','小籠湯包','鲜肉小笼包'],unit:selected,grams,kcal:value.kcal,p:value.protein,c:value.carb,f:value.fat,weightBasis:basis,source:'local',nutritionStatus:'estimated',portionHint:'参考1'+selected+'约'+grams+'g；按小笼汤包产品标签233.4kcal/100g估算，配方不同可修改',referenceUrl:'https://www.green-n-safe.com/Products/Content?id=MJG0008ZBCS'};
}
module.exports={sanitize,forUnit,lookup};
