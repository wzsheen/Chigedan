const data=require('./chongqing-data');
const rounded=n=>Math.round(n*100)/100;
const totals={};
Object.keys(data.recipes).forEach(key=>{
    const recipe=data.recipes[key];let grams=0;const v=[0,0,0,0];
    Object.keys(recipe).forEach(ingredient=>{const weight=recipe[ingredient];grams+=weight;data.ingredients[ingredient].v.forEach((n,index)=>{v[index]+=n*weight/100;});});
    totals[key]={grams,v};
});
const foods=data.entries.map(([name,recipe,unit,grams,aliases,extra])=>{
    const model=totals[recipe];const per100g=model.v.map(n=>n/model.grams*100);
    const v=per100g.map(n=>rounded(n*grams/100));
    return {name,unit,grams,aliases,unitGrams:Object.assign({'份':grams},extra,{[unit]:grams}),kcal:v[0],p:v[1],c:v[2],f:v[3],per100g,recipe,source:'recipe-estimate',portionEstimated:true};
});
function lookup(name,unit) {
    const row=foods.find(row=>row.name===name || row.aliases.includes(name));
    if(!row)return null;
    const chosen=unit || row.unit;
    const liquid=require('./food-portions').isDrink(row.name);
    const grams=liquid && chosen==='升'?1000:liquid && chosen==='毫升'?1:chosen==='克'?1:['千克','公斤'].includes(chosen)?1000:chosen==='斤'?500:chosen==='两' && /面|粉|米线|抄手|饺|包子/.test(row.name)?50:row.unitGrams[chosen];
    if(!grams)return null;
    const values=row.per100g.map(n=>rounded(n*grams/100));
    return Object.assign({},row,{unit:chosen,grams,kcal:values[0],p:values[1],c:values[2],f:values[3],portionEstimated:true,portionHint:chosen==='克'?'按配方每克参考估算':chosen==='两'?'按成品重量1两=50克估算，请核对':'参考1'+chosen+'约'+grams+'g；做法与油量会影响数值'});
}
module.exports={foods,lookup,meta:data.meta};
