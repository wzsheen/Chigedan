// 常见食物热量与三大营养素参考库（估算值，按常见家庭/外卖份量取整）。
// 历史家庭份量估算，未逐条核验来源，不作为权威成分表。
// 新的可追溯每100克数据见 nutrition-data.js。
// p = 蛋白质(g) / c = 碳水化合物(g) / f = 脂肪(g)

const LEGACY_FOOD_DB = [
    // 主食
    { name: '米饭', unit: '碗', kcal: 230, p: 5, c: 50, f: 0.6 },
    { name: '馒头', unit: '个', kcal: 220, p: 7, c: 45, f: 1.2 },
    { name: '包子', unit: '个', kcal: 200, p: 7, c: 28, f: 6 },
    { name: '饺子', unit: '个', kcal: 45, p: 1.8, c: 5, f: 1.6 },
    { name: '馄饨', unit: '个', kcal: 40, p: 1.6, c: 4.5, f: 1.3 },
    { name: '面条', unit: '碗', kcal: 350, p: 11, c: 65, f: 4 },
    { name: '米线', unit: '碗', kcal: 400, p: 8, c: 78, f: 5 },
    { name: '米粉', unit: '碗', kcal: 380, p: 8, c: 74, f: 4.5 },
    { name: '牛肉面', unit: '碗', kcal: 500, p: 22, c: 65, f: 14 },
    { name: '白粥', unit: '碗', kcal: 100, p: 2.5, c: 22, f: 0.3 },
    { name: '小米粥', unit: '碗', kcal: 120, p: 3, c: 25, f: 0.8 },
    { name: '燕麦粥', unit: '碗', kcal: 150, p: 5, c: 26, f: 3 },
    { name: '玉米', unit: '根', kcal: 110, p: 4, c: 22, f: 1.5 },
    { name: '红薯', unit: '个', kcal: 130, p: 2, c: 30, f: 0.3 },
    { name: '蛋炒饭', unit: '盘', kcal: 500, p: 14, c: 70, f: 18 },
    { name: '炒面', unit: '盘', kcal: 500, p: 14, c: 68, f: 19 },
    { name: '盖浇饭', unit: '份', kcal: 700, p: 25, c: 90, f: 24 },
    { name: '全麦面包', unit: '片', kcal: 80, p: 4, c: 13, f: 1.2 },
    { name: '吐司', unit: '片', kcal: 80, p: 3, c: 14, f: 1.2 },
    { name: '油条', unit: '根', kcal: 270, p: 4, c: 30, f: 15 },
    { name: '煎饼果子', unit: '个', kcal: 400, p: 12, c: 45, f: 19 },
    { name: '肉夹馍', unit: '个', kcal: 450, p: 18, c: 45, f: 21 },
    { name: '手抓饼', unit: '个', kcal: 350, p: 7, c: 40, f: 18 },
    { name: '汉堡', unit: '个', kcal: 500, p: 25, c: 42, f: 25 },
    { name: '披萨', unit: '块', kcal: 280, p: 12, c: 30, f: 12 },
    { name: '三明治', unit: '个', kcal: 350, p: 15, c: 35, f: 16 },
    { name: '寿司', unit: '个', kcal: 60, p: 2.5, c: 10, f: 0.8 },
    { name: '粽子', unit: '个', kcal: 400, p: 10, c: 65, f: 11 },
    { name: '汤圆', unit: '个', kcal: 60, p: 1, c: 9, f: 2 },
    { name: '蛋糕', unit: '块', kcal: 300, p: 5, c: 38, f: 14 },
    { name: '泡面', unit: '碗', kcal: 470, p: 10, c: 62, f: 20 },

    // 蛋白质
    { name: '鸡蛋', unit: '个', kcal: 70, p: 6, c: 0.5, f: 5 },
    { name: '水煮蛋', unit: '个', kcal: 70, p: 6, c: 0.5, f: 5 },
    { name: '煎蛋', unit: '个', kcal: 110, p: 6.5, c: 0.5, f: 9 },
    { name: '鸡胸肉', unit: '份', kcal: 130, p: 24, c: 0, f: 2.8 },
    { name: '鸡腿', unit: '个', kcal: 200, p: 20, c: 0, f: 13 },
    { name: '鸡翅', unit: '个', kcal: 100, p: 9, c: 0, f: 7 },
    { name: '炸鸡', unit: '份', kcal: 550, p: 30, c: 25, f: 33 },
    { name: '牛肉', unit: '份', kcal: 180, p: 26, c: 0, f: 8 },
    { name: '红烧肉', unit: '份', kcal: 500, p: 18, c: 10, f: 42 },
    { name: '排骨', unit: '份', kcal: 350, p: 22, c: 5, f: 26 },
    { name: '培根', unit: '片', kcal: 45, p: 3, c: 0.2, f: 3.5 },
    { name: '火腿肠', unit: '根', kcal: 120, p: 5, c: 4, f: 9.5 },
    { name: '虾', unit: '份', kcal: 90, p: 17, c: 1, f: 1 },
    { name: '鱼', unit: '份', kcal: 120, p: 18, c: 0, f: 5 },
    { name: '豆腐', unit: '份', kcal: 80, p: 7, c: 2, f: 4.5 },
    { name: '豆浆', unit: '杯', kcal: 90, p: 5, c: 8, f: 3 },
    { name: '牛奶', unit: '杯', kcal: 150, p: 8, c: 11, f: 8 },
    { name: '酸奶', unit: '杯', kcal: 100, p: 5, c: 12, f: 3 },

    // 蔬菜
    { name: '西兰花', unit: '份', kcal: 35, p: 3, c: 5, f: 0.4 },
    { name: '番茄', unit: '个', kcal: 30, p: 1.5, c: 6, f: 0.3 },
    { name: '黄瓜', unit: '根', kcal: 30, p: 1, c: 6, f: 0.2 },
    { name: '生菜', unit: '份', kcal: 15, p: 1, c: 2, f: 0.2 },
    { name: '菠菜', unit: '份', kcal: 25, p: 2.5, c: 3, f: 0.3 },
    { name: '白菜', unit: '份', kcal: 20, p: 1.5, c: 3, f: 0.2 },
    { name: '胡萝卜', unit: '根', kcal: 30, p: 0.7, c: 7, f: 0.2 },
    { name: '青椒', unit: '份', kcal: 20, p: 1, c: 4, f: 0.2 },
    { name: '蘑菇', unit: '份', kcal: 25, p: 2, c: 4, f: 0.2 },
    { name: '炒青菜', unit: '份', kcal: 90, p: 2, c: 6, f: 6 },
    { name: '沙拉', unit: '份', kcal: 150, p: 5, c: 12, f: 9 },

    // 水果
    { name: '苹果', unit: '个', kcal: 95, p: 0.5, c: 25, f: 0.3 },
    { name: '香蕉', unit: '根', kcal: 90, p: 1.2, c: 23, f: 0.3 },
    { name: '橙子', unit: '个', kcal: 70, p: 1, c: 17, f: 0.2 },
    { name: '梨', unit: '个', kcal: 75, p: 0.5, c: 20, f: 0.2 },
    { name: '猕猴桃', unit: '个', kcal: 45, p: 1, c: 10, f: 0.4 },
    { name: '芒果', unit: '个', kcal: 200, p: 1.5, c: 50, f: 1 },
    { name: '西瓜', unit: '份', kcal: 90, p: 1, c: 22, f: 0.2 },
    { name: '葡萄', unit: '份', kcal: 100, p: 0.7, c: 25, f: 0.2 },
    { name: '草莓', unit: '份', kcal: 65, p: 1, c: 15, f: 0.3 },

    // 饮品零食
    { name: '可乐', unit: '罐', kcal: 145, p: 0, c: 37, f: 0 },
    { name: '奶茶', unit: '杯', kcal: 400, p: 5, c: 60, f: 14 },
    { name: '咖啡', unit: '杯', kcal: 200, p: 6, c: 28, f: 6 },
    { name: '美式咖啡', unit: '杯', kcal: 10, p: 0.5, c: 1.5, f: 0 },
    { name: '橙汁', unit: '杯', kcal: 110, p: 1.5, c: 25, f: 0.3 },
    { name: '啤酒', unit: '瓶', kcal: 200, p: 1.5, c: 15, f: 0 },
    { name: '薯片', unit: '包', kcal: 550, p: 6, c: 55, f: 35 },
    { name: '薯条', unit: '份', kcal: 330, p: 4, c: 42, f: 16 },
    { name: '巧克力', unit: '块', kcal: 60, p: 1, c: 6, f: 3.7 },
    { name: '饼干', unit: '片', kcal: 50, p: 1, c: 7, f: 2.2 },
    { name: '坚果', unit: '包', kcal: 180, p: 5, c: 7, f: 15 },
    { name: '冰淇淋', unit: '个', kcal: 200, p: 3, c: 24, f: 10 },
    { name: '麻辣烫', unit: '份', kcal: 500, p: 20, c: 40, f: 26 },
];

// Shared foods use the same canonical source for search, defaults and unit conversion.
const nutritionTable=require('./nutrition');
const { porridgeAliases } = require('./food-aliases');
const FOOD_DB=LEGACY_FOOD_DB.map(row=>{
    const standard=nutritionTable.lookupBuiltin(row.name,row.unit);
    if(!standard)return Object.assign({}, row, { aliases: porridgeAliases(row.name, row.aliases) });
    return Object.assign({},standard,{aliases:porridgeAliases(standard.name,[...new Set([...(standard.aliases || []),row.name].filter(name=>name!==standard.name))])});
});

// 库外食物的品类兜底：按名称关键词判断大致供能比（碳水 / 蛋白 / 脂肪 的占比）。
// 顺序即优先级：饮品甜食、肉蛋奶豆、坚果油脂要先于主食与蔬果判断，
// 否则「奶茶」会被「奶」误判成高蛋白。
const CATEGORY_RULES = [
    {
        label: '饮品甜食',
        keys: ['奶茶', '可乐', '汽水', '咖啡', '拿铁', '汁', '酒', '啤', '蛋糕', '巧克力', '饼', '薯片', '冰淇淋', '雪糕', '糖', '甜'],
        ratio: { c: 0.55, p: 0.08, f: 0.37 },
    },
    {
        label: '肉蛋奶豆',
        keys: ['鸡', '牛', '猪', '羊', '肉', '蛋', '鱼', '虾', '蟹', '贝', '豆腐', '豆干', '奶', '芝士', '酪', '火腿', '培根', '香肠'],
        ratio: { c: 0.15, p: 0.4, f: 0.45 },
    },
    {
        label: '坚果油脂',
        keys: ['坚果', '花生', '核桃', '杏仁', '腰果', '瓜子', '芝麻', '油'],
        ratio: { c: 0.2, p: 0.12, f: 0.68 },
    },
    {
        label: '主食谷物',
        keys: ['饭', '面', '粉', '粥', '包', '馒', '饼', '吐司', '饺', '馄饨', '糕', '粽', '薯', '玉米', '燕麦', '麦', '米', '意大利', '汉堡', '披萨', '寿司', '三明治'],
        ratio: { c: 0.62, p: 0.14, f: 0.24 },
    },
    {
        label: '蔬果',
        keys: ['菜', '瓜', '果', '莓', '橙', '梨', '桃', '葡萄', '番茄', '萝卜', '蘑菇', '菇', '笋', '椒', '葱', '蒜', '豆角', '菠菜', '生菜'],
        ratio: { c: 0.65, p: 0.15, f: 0.2 },
    },
];

const DEFAULT_RATIO = { c: 0.5, p: 0.2, f: 0.3 };

function round1(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        return 0;
    }
    return Math.round(num * 10) / 10;
}

// 按供能比把热量拆成三大营养素克数（4 / 4 / 9 kcal per gram）。
function ratioToMacro(kcal, ratio) {
    const energy = Number(kcal);
    if (!Number.isFinite(energy) || energy <= 0) {
        return { p: 0, c: 0, f: 0 };
    }
    return {
        p: round1((energy * ratio.p) / 4),
        c: round1((energy * ratio.c) / 4),
        f: round1((energy * ratio.f) / 9),
    };
}

function findCategory(name) {
    for (let i = 0; i < CATEGORY_RULES.length; i += 1) {
        const rule = CATEGORY_RULES[i];
        for (let j = 0; j < rule.keys.length; j += 1) {
            if (name.indexOf(rule.keys[j]) !== -1) {
                return rule;
            }
        }
    }
    return null;
}

// 给食物名 + 每份热量，返回三大营养素估算值。
// 优先查成分库；库外按热量比例缩放相近食物，或按品类供能比拆分。
// 返回 { p, c, f, source, matchedName }，source: table | similar | category | default
function findMacro(name, kcal) {
    const query = typeof name === 'string' ? name.trim() : '';
    const energy = Number(kcal);
    if (query === '') {
        return null;
    }

    const exact = findExact(query);
    if (exact !== null && ['p','c','f'].every(key=>Number.isFinite(exact[key]))) {
        return {
            p: exact.p * (energy > 0 ? energy / exact.kcal : 1),
            c: exact.c * (energy > 0 ? energy / exact.kcal : 1),
            f: exact.f * (energy > 0 ? energy / exact.kcal : 1),
            source: 'table',
            matchedName: exact.name,
            matchedKcal: exact.kcal,
        };
    }

    // Unknown nutrients stay unknown; never infer a dish from shared characters.
    return null;
}

function findContained(query) {
    let best = null;
    const imported = require('./china-food-index').lookup(query);
    if (imported) return imported;
    for (let i = 0; i < FOOD_DB.length; i += 1) {
        const item = FOOD_DB[i];
        if (item.name.length >= 2 && query.indexOf(item.name) !== -1) {
            if (best === null || item.name.length > best.name.length) {
                best = item;
            }
        }
    }
    return best;
}

function findFuzzy(query) {
    const candidates = searchFoods(query).filter(item => sharedChars(item.name, query) >= 2);
    return candidates.length > 0 ? candidates[0] : null;
}

function sharedChars(left, right) {
    let count = 0;
    for (let i = 0; i < left.length; i += 1) {
        if (right.indexOf(left[i]) !== -1) {
            count += 1;
        }
    }
    return count;
}

// 按名称匹配：完全一致优先；否则按共同汉字数评分（如「鸡蛋」能匹配「水煮蛋」「煎蛋」）。
function searchFoods(name) {
    const query = typeof name === 'string' ? name.trim() : '';
    if (query.length < 1) {
        return [];
    }

    const nutrition=require('./nutrition');
    let personal=[];
    try { const value=wx.getStorageSync('cal_foods');if(Array.isArray(value))personal=value; } catch (_) {}
    const pool=personal.concat([nutrition.lookup("小笼包")],FOOD_DB,require('./chongqing-foods').foods,require('./beverage-data').map(row=>nutrition.lookup(row.name)),nutrition.data.map(row=>nutrition.lookup(row.name)),require('./china-food-index').rows.map(row=>require('./china-food-index').lookup(row.name)));
    const seen=new Set(), matches=[];
    for(const item of pool){
        if(!item || typeof item.name!=='string' || !Number.isFinite(item.kcal) || item.kcal<0)continue;
        const reference=nutrition.data.find(row=>row.name===item.name);
        const names=[item.name].concat(item.aliases || [],reference ? reference.aliases : []);
        if(!names.some(name=>name.includes(query)))continue;
        const canonical=nutrition.lookupBuiltin(item.name,item.unit);
        const key=(canonical ? canonical.name : item.name)+'|'+item.unit;
        if(seen.has(key))continue;
        seen.add(key);matches.push(item);
    }
    matches.sort((a,b)=>(b.name===query)-(a.name===query));
    return matches.slice(0,15);
}

function findExact(name) {
    const personal=require('./nutrition').lookup(typeof name==='string'?name.trim():'');
    if(personal && personal.source==='personal')return personal;

    const query = typeof name === 'string' ? name.trim() : '';
    if (query === '') {
        return null;
    }
    const imported = require('./china-food-index').lookup(query);
    if (imported) return imported;
    for (let i = 0; i < FOOD_DB.length; i += 1) {
        if (FOOD_DB[i].name === query || (FOOD_DB[i].aliases || []).includes(query)) {
            return FOOD_DB[i];
        }
    }
    return require('./nutrition').lookup(query);
}

module.exports = {
    FOOD_DB,
    searchFoods,
    findExact,
    findMacro,
    ratioToMacro,
    findByUnit(name,unit) { return require('./nutrition').lookup(name,unit) || FOOD_DB.find(row=>(row.name===name || (row.aliases || []).includes(name)) && row.unit===unit) || null; },
};
