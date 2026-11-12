// Whitelist imported/exported fields: never copy arbitrary storage or API keys.
function sanitize(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.slice(0,500).filter(row=>row && typeof row.name==='string' && row.name.trim() && Number.isFinite(row.kcal) && row.kcal>0 && row.kcal<100000 && typeof row.unit==='string' && row.unit.trim()).map(row=>{
        const food={id:String(row.id || row.name).slice(0,100),name:row.name.trim().slice(0,60),unit:row.unit.trim().slice(0,8),kcal:row.kcal,count:Math.max(1,Math.min(100000,Number(row.count)||1)),source:'user-confirmed'};
        const basis=require('./food-weight').sanitize(row.weightBasis);if(basis)food.weightBasis=basis;
        if (['主食','荤菜','蛋奶豆','蔬菜','水果','快餐','小吃','饮品'].includes(row.category)) food.category = row.category;
        if (Number.isFinite(row.grams) && row.grams > 0 && row.grams <= 10000) food.grams = row.grams;
        if (row.nutrition) {
            const macro = key => Number.isFinite(row.nutrition[key]) && row.nutrition[key] >= 0 && row.nutrition[key] < 100000 ? row.nutrition[key] : null;
            food.nutrition = { p: macro('p'), c: macro('c'), f: macro('f') };
        }
        return food;
    });
}
module.exports={sanitize};
