// 常用食物库数据层：本地存储。记录一次食物后自动进入食物库，按使用次数排序。

const KEY_LIMIT = 500;

let idCounter = 0;

function createFoodStore(options) {
    const config = options || {};
    if (typeof config.storageKey !== 'string' || config.storageKey.trim() === '') {
        throw new TypeError('storageKey 不能为空');
    }
    const storageKey = config.storageKey;

    // One storage write for a meal: either all learned foods are persisted, or none are.
    function upsertMany(rows){return safely(()=>{
        if(!Array.isArray(rows) || !rows.length)return {data:null,error:{code:'INVALID_PAYLOAD',message:'食物信息无效'}};
        const items=readFoods(storageKey),learned=[];
        for(const row of rows){
            const name=typeof row.name==='string'?row.name.trim():'',kcal=Number(row.kcal),unit=typeof row.unit==='string' && row.unit.trim()?row.unit.trim():'份';
            if(!name || !Number.isFinite(kcal) || kcal<=0)return {data:null,error:{code:'INVALID_PAYLOAD',message:'食物信息无效'}};
            const index=items.findIndex(item=>item.name===name && item.unit===unit),current=index>=0?items[index]:null,now=Date.now();
            const food={id:current?current.id:createItemId(now),name,kcal:Math.round(kcal*10000)/10000,unit,count:current?current.count+1:1,updatedAt:now,source:'user-confirmed'};
            const category = row.category || (current && current.category);
            if (category) food.category = category;
            const grams = row.grams || (current && current.grams);
            if (Number.isFinite(grams) && grams > 0 && grams <= 10000) food.grams = grams;
            const basis=require('./food-weight').sanitize(row.weightBasis);if(basis)food.weightBasis=basis;
            const nutrition = row.nutrition;
            if (nutrition) {
                const macro = key => Number.isFinite(nutrition[key]) && nutrition[key] >= 0 ? nutrition[key] : null;
                food.nutrition = { p: macro('p'), c: macro('c'), f: macro('f') };
            }
            if(index>=0)items.splice(index,1);items.unshift(food);learned.push(food);
        }
        if(items.length>KEY_LIMIT)items.length=KEY_LIMIT;
        writeFoods(storageKey,items);return {data:learned,error:null};
    });}
    return {
        list(){return safely(()=>({data:readFoods(storageKey),error:null}));},
        upsertMany,
        upsert(name,kcal,unit,nutrition){return upsertMany([{name,kcal,unit,nutrition}]).then(result=>result.error?result:{data:result.data[0],error:null});},
    };
}

function safely(executor) {
    return Promise.resolve()
        .then(executor)
        .catch(error => ({ data: null, error: { code: 'CLIENT_EXCEPTION', message: error && error.message ? error.message : '' } }));
}

function readFoods(storageKey) {
    const value = wx.getStorageSync(storageKey);
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(item => item !== null && typeof item === 'object'
            && typeof item.name === 'string' && typeof item.kcal === 'number')
        .sort((left, right) => (right.count || 0) - (left.count || 0))
        .map(item => ({
            weightBasis:require('./food-weight').sanitize(item.weightBasis),
            nutrition: item.nutrition,
            category: item.category,
            grams: item.grams,
            source: item.source,
            updatedAt: item.updatedAt,
            id: String(item.id || item.name),
            name: item.name,
            kcal: item.kcal,
            unit: typeof item.unit === 'string' && item.unit !== '' ? item.unit : '份',
            count: typeof item.count === 'number' ? item.count : 1,
        }));
}

function writeFoods(storageKey, items) {
    wx.setStorageSync(storageKey, items);
}

function createItemId(timestamp) {
    idCounter = (idCounter + 1) % 1000000;
    return String(timestamp) + '-' + String(idCounter);
}

module.exports = {
    createFoodStore,
};
