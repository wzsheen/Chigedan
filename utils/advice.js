// 今日饮食建议 + 食谱库：静态搭配库 + 纯函数，不依赖 wx。
// 每套搭配的营养值由食物库实时累加（不写死数字），改份数或改库数据都会同步。

const foodDb = require('./food-db.js');
const { MACRO_RANGES } = require('./analysis.js');

// 触发提醒要比「建议区间」宽：45–55% 是理想值，但实际 40–60% 都算正常。
// 建议区间只用于页面上标出偏差，这里决定值不值得在首页打扰用户。
const ALERT = {
    carb: { min: 40, max: 60 },
    protein: { min: 12, max: 35 },
    fat: { min: 18, max: 35 },
};

// 三种营养素固定配色，和首页内环 conic-gradient 一致：
// 碳水蓝、蛋白橙、脂肪黄。营养结构条、图例、首页环都用这一套，避免每处一个色。
const MACRO_COLORS = {
    carb: '#3b9ae1',
    protein: '#ff6b35',
    fat: '#f0b429',
};

// 深色卡片上的一套亮版：同样的色相，提亮到能在近黑底上读清
const MACRO_COLORS_DARK = {
    carb: '#79c8f5',
    protein: '#ff9d6e',
    fat: '#ffd06b',
};

const STATUS_TEXT = {
    high: '偏高',
    low: '偏低',
    ok: '正常',
    none: '—',
};

const MEAL_META = [
    { key: 'breakfast', label: '早餐', icon: '🌅' },
    { key: 'lunch', label: '午餐', icon: '🍛' },
    { key: 'dinner', label: '晚餐', icon: '🌙' },
    { key: 'snack', label: '加餐', icon: '🍎' },
];

// 搭配库：parts 里的食物名必须能在 food-db 里精确命中，否则该食材会被跳过。
// tags 用于按营养方向筛建议，why 只写定性判断，数字由计算得到。
const RECIPES = [
    {
        id: 'b1',
        meal: 'breakfast',
        icon: '🥚',
        tags: ['高蛋白', '均衡'],
        parts: [['水煮蛋', 2], ['全麦面包', 2], ['牛奶', 1]],
        why: '蛋白给得足，上午不容易饿',
    },
    {
        id: 'b2',
        meal: 'breakfast',
        icon: '🥣',
        tags: ['低脂'],
        parts: [['燕麦粥', 1], ['香蕉', 1], ['酸奶', 1]],
        why: '脂肪很低，早餐吃得清爽',
    },
    {
        id: 'b3',
        meal: 'breakfast',
        icon: '🥛',
        tags: ['清淡'],
        parts: [['白粥', 1], ['水煮蛋', 1], ['炒青菜', 1]],
        why: '热量低、好消化，胃口小也吃得下',
    },
    {
        id: 'b4',
        meal: 'breakfast',
        icon: '🥪',
        tags: ['均衡', '快手'],
        parts: [['三明治', 1], ['美式咖啡', 1]],
        why: '开袋即食，赶时间的早上也能吃上',
    },
    {
        id: 'b5',
        meal: 'breakfast',
        icon: '🌽',
        tags: ['低脂', '清淡'],
        parts: [['玉米', 1], ['牛奶', 1], ['水煮蛋', 1]],
        why: '粗粮配蛋白，饱到中午不慌',
    },
    {
        id: 'l1',
        meal: 'lunch',
        icon: '🍗',
        tags: ['高蛋白', '低碳水'],
        parts: [['米饭', 0.5], ['鸡胸肉', 1], ['西兰花', 1]],
        why: '蛋白高、脂肪低，下午不容易犯困',
    },
    {
        id: 'l2',
        meal: 'lunch',
        icon: '🍜',
        tags: ['均衡', '家常'],
        parts: [['牛肉面', 1], ['番茄', 1]],
        why: '一碗顶饱，碳水和蛋白都在位上',
    },
    {
        id: 'l3',
        meal: 'lunch',
        icon: '🐟',
        tags: ['高蛋白', '均衡'],
        parts: [['米饭', 1], ['鱼', 1], ['菠菜', 1]],
        why: '清蒸鱼配菠菜，油少但蛋白足',
    },
    {
        id: 'l4',
        meal: 'lunch',
        icon: '🥗',
        tags: ['低脂', '高蛋白'],
        parts: [['沙拉', 1], ['鸡胸肉', 1], ['全麦面包', 1]],
        why: '蛋白密度最高的一套，饱腹感也够',
    },
    {
        id: 'l5',
        meal: 'lunch',
        icon: '🥟',
        tags: ['均衡', '快手'],
        parts: [['馄饨', 10], ['橙子', 1]],
        why: '一碗馄饨有肉有菜，饭后一个橙子补维C',
    },
    {
        id: 'd1',
        meal: 'dinner',
        icon: '🦐',
        tags: ['高蛋白', '低碳水', '低脂'],
        parts: [['米饭', 0.5], ['虾', 1], ['西兰花', 1], ['豆腐', 1]],
        why: '三种蛋白来源，脂肪压得很低',
    },
    {
        id: 'd2',
        meal: 'dinner',
        icon: '🍠',
        tags: ['低碳水', '清淡'],
        parts: [['红薯', 1], ['鸡胸肉', 1], ['生菜', 1]],
        why: '红薯替主食，升糖慢、纤维多',
    },
    {
        id: 'd3',
        meal: 'dinner',
        icon: '🍲',
        tags: ['清淡', '均衡'],
        parts: [['小米粥', 1], ['鱼', 1], ['炒青菜', 1]],
        why: '晚上吃得清淡点，睡得更踏实',
    },
    {
        id: 'd4',
        meal: 'dinner',
        icon: '🥟',
        tags: ['家常', '均衡'],
        parts: [['饺子', 10], ['苹果', 1]],
        why: '不想做饭的时候，煮一盘就解决',
    },
    {
        id: 'd5',
        meal: 'dinner',
        icon: '🥩',
        tags: ['高蛋白', '低碳水'],
        parts: [['牛肉', 1], ['蘑菇', 1], ['米饭', 0.5]],
        why: '牛肉补铁，蛋白给到 30 g',
    },
    {
        id: 's1',
        meal: 'snack',
        icon: '☕',
        tags: ['低脂', '高蛋白'],
        parts: [['水煮蛋', 1], ['美式咖啡', 1]],
        why: '热量很低就能压住嘴馋',
    },
    {
        id: 's2',
        meal: 'snack',
        icon: '🍓',
        tags: ['低脂'],
        parts: [['酸奶', 1], ['草莓', 1]],
        why: '甜口但不油，奶茶的替代品',
    },
    {
        id: 's3',
        meal: 'snack',
        icon: '🍌',
        tags: ['优质脂肪', '均衡'],
        parts: [['香蕉', 1], ['坚果', 1]],
        why: '运动前后补能量，别当日常零食',
    },
    {
        id: 's4',
        meal: 'snack',
        icon: '🥒',
        tags: ['高蛋白', '低碳水', '低脂'],
        parts: [['鸡胸肉', 1], ['黄瓜', 1]],
        why: '纯补蛋白，几乎不动碳水占比',
    },
    {
        id: 's5',
        meal: 'snack',
        icon: '🥝',
        tags: ['低脂', '清淡'],
        parts: [['猕猴桃', 2], ['酸奶', 1]],
        why: '维C 拉满的下午茶，热量不到 200',
    },
    {
        id: 'b6',
        meal: 'breakfast',
        icon: '🥟',
        tags: ['均衡', '家常'],
        parts: [['豆浆', 1], ['包子', 1], ['水煮蛋', 1]],
        why: '植物蛋白加动物蛋白，中式早餐的黄金结构',
    },
    {
        id: 'b7',
        meal: 'breakfast',
        icon: '🥬',
        tags: ['清淡', '低脂'],
        parts: [['小米粥', 1], ['水煮蛋', 1], ['菠菜', 1]],
        why: '升糖快的粥用蛋和青菜拉住，早餐也吃得稳',
    },
    {
        id: 'b8',
        meal: 'breakfast',
        icon: '🍳',
        tags: ['均衡'],
        parts: [['全麦面包', 2], ['煎蛋', 1], ['牛奶', 1]],
        why: '主食、蛋白、奶齐了，煎蛋用少油更划算',
    },
    {
        id: 'b9',
        meal: 'breakfast',
        icon: '🍠',
        tags: ['低脂', '清淡'],
        parts: [['红薯', 1], ['牛奶', 1], ['水煮蛋', 1]],
        why: '薯类替精致主食，纤维多一倍还顶饿',
    },
    {
        id: 'b10',
        meal: 'breakfast',
        icon: '🍓',
        tags: ['低脂', '快手'],
        parts: [['吐司', 2], ['酸奶', 1], ['草莓', 1]],
        why: '酸奶代替果酱，糖少一半钙翻倍',
    },
    {
        id: 'l6',
        meal: 'lunch',
        icon: '🍗',
        tags: ['均衡', '家常'],
        parts: [['米饭', 1], ['鸡腿', 1], ['炒青菜', 1]],
        why: '鸡腿去皮吃，蛋白不输鸡胸还更嫩',
    },
    {
        id: 'l7',
        meal: 'lunch',
        icon: '🍜',
        tags: ['高蛋白', '均衡'],
        parts: [['米线', 0.5], ['牛肉', 1], ['番茄', 1]],
        why: '米线减半留肚子给牛肉，蛋白就够了',
    },
    {
        id: 'l8',
        meal: 'lunch',
        icon: '🍣',
        tags: ['低脂', '快手'],
        parts: [['寿司', 6], ['菠菜', 1], ['豆腐', 1]],
        why: '寿司个头小好控制量，配豆腐补上蛋白',
    },
    {
        id: 'l9',
        meal: 'lunch',
        icon: '🍅',
        tags: ['均衡', '家常'],
        parts: [['米饭', 1], ['虾', 1], ['番茄', 1], ['鸡蛋', 1]],
        why: '番茄炒蛋配虾仁，家常菜也能配平结构',
    },
    {
        id: 'l10',
        meal: 'lunch',
        icon: '🍱',
        tags: ['均衡', '低脂'],
        parts: [['盖浇饭', 0.5], ['沙拉', 1]],
        why: '点半份盖浇饭配份沙拉，热量直接砍半',
    },
    {
        id: 'd6',
        meal: 'dinner',
        icon: '🍖',
        tags: ['均衡', '家常'],
        parts: [['米饭', 0.5], ['排骨', 1], ['白菜', 1]],
        why: '排骨炖白菜比红烧少油，主食减半正好',
    },
    {
        id: 'd7',
        meal: 'dinner',
        icon: '🌽',
        tags: ['高蛋白', '低碳水', '低脂'],
        parts: [['玉米', 1], ['豆腐', 1], ['虾', 1]],
        why: '粗粮加双蛋白，晚上吃也不胀',
    },
    {
        id: 'd8',
        meal: 'dinner',
        icon: '🍝',
        tags: ['均衡', '低脂'],
        parts: [['面条', 0.5], ['鸡胸肉', 1], ['黄瓜', 1]],
        why: '鸡丝凉面少放麻酱，就是一份好晚餐',
    },
    {
        id: 'd9',
        meal: 'dinner',
        icon: '🍜',
        tags: ['低脂', '清淡'],
        parts: [['米线', 0.5], ['虾', 1], ['生菜', 1]],
        why: '汤粉配白灼虾，晚上负担小',
    },
    {
        id: 'd10',
        meal: 'dinner',
        icon: '🍲',
        tags: ['低脂', '清淡'],
        parts: [['米饭', 0.5], ['豆腐', 1], ['蘑菇', 1]],
        why: '菌菇豆腐煲，植物蛋白为主的一餐',
    },
    {
        id: 's6',
        meal: 'snack',
        icon: '🍎',
        tags: ['均衡', '低脂'],
        parts: [['苹果', 1], ['牛奶', 1]],
        why: '一个苹果一杯奶，顶饿又补钙',
    },
    {
        id: 's7',
        meal: 'snack',
        icon: '🥜',
        tags: ['优质脂肪'],
        parts: [['全麦面包', 1], ['坚果', 1]],
        why: '下午三四点的低升糖补给，一小把就停',
    },
    {
        id: 's8',
        meal: 'snack',
        icon: '🥗',
        tags: ['低脂', '低碳水'],
        parts: [['番茄', 1], ['黄瓜', 1]],
        why: '办公室抽屉里的零负担组合，加起来不到 60',
    },
    {
        id: 's9',
        meal: 'snack',
        icon: '🥛',
        tags: ['均衡'],
        parts: [['豆浆', 1], ['香蕉', 1]],
        why: '植物蛋白配快碳水，运动后来一杯刚好',
    },
    {
        id: 's10',
        meal: 'snack',
        icon: '🥕',
        tags: ['低脂', '清淡'],
        parts: [['胡萝卜', 1], ['酸奶', 1]],
        why: '酸奶当蘸酱，纤维和蛋白一次都有',
    },
];

// Additional reference combinations; quantities use existing food database units.
RECIPES.push(
 {id:'b11',meal:'breakfast',icon:'🍞',tags:['均衡','家常'],parts:[['馒头',1],['水煮蛋',1],['牛奶',1]]},
 {id:'b12',meal:'breakfast',icon:'🌽',tags:['均衡','清淡'],parts:[['玉米',1],['酸奶',1],['苹果',.5]]},
 {id:'l11',meal:'lunch',icon:'🥩',tags:['高蛋白','均衡'],parts:[['米饭',1],['牛肉',1],['豆腐',1],['菠菜',1]]},
 {id:'l12',meal:'lunch',icon:'🦐',tags:['高蛋白','家常'],parts:[['米饭',1],['虾',1],['水煮蛋',1],['白菜',1]]},
 {id:'d11',meal:'dinner',icon:'🐟',tags:['均衡','清淡'],parts:[['红薯',1],['鱼',1],['蘑菇',1],['菠菜',1]]},
 {id:'d12',meal:'dinner',icon:'🍲',tags:['高蛋白','均衡'],parts:[['米饭',1],['鸡胸肉',1],['豆腐',1],['西兰花',1]]},
 {id:'s11',meal:'snack',icon:'🥛',tags:['均衡','快手'],parts:[['牛奶',1],['全麦面包',1]]},
 {id:'s12',meal:'snack',icon:'🍊',tags:['均衡','清淡'],parts:[['橙子',1],['酸奶',1]]}
);
RECIPES.forEach(recipe => { recipe.why = '以多样食物组合为出发点，具体份量按实际食量与当天安排调整。'; });

// 方向 → 建议优先的标签
const FOCUS_TAGS = {
    carbHigh: ['低碳水', '高蛋白'],
    proteinHigh: ['均衡', '清淡'],
    fatHigh: ['低脂', '清淡'],
    carbLow: ['均衡', '家常'],
    proteinLow: ['高蛋白'],
    fatLow: ['优质脂肪', '均衡'],
    balanced: ['均衡', '高蛋白', '清淡'],
};

// 方向 → 推荐加的食物（都在食物库里，点一下能直接记）
const FOCUS_FOODS = {
    carbHigh: ['鸡胸肉', '水煮蛋', '西兰花', '虾'],
    proteinHigh: ['番茄', '黄瓜', '苹果', '白粥'],
    fatHigh: ['鸡胸肉', '虾', '生菜', '酸奶'],
    carbLow: ['米饭', '香蕉', '苹果', '牛奶'],
    proteinLow: ['鸡胸肉', '水煮蛋', '鱼', '豆腐'],
    fatLow: ['坚果', '鱼', '鸡蛋', '牛奶'],
    balanced: ['水煮蛋', '牛奶', '苹果', '西兰花'],
};

// 食物科普：搭配明细展开时给每样食材配一句「为什么吃它 / 怎么吃更好」。
// 只给搭配库实际用到的食材；没收录的食材明细行就不显示科普，不影响其他内容。
const FOOD_FACTS = require('./recipe-content').FOOD_FACTS;

function round1(value) {
    return Math.round(value * 10) / 10;
}

function formatGram(value) {
    const num = round1(value);
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function findFood(name) {
    return foodDb.findExact(name);
}

// 「2个水煮蛋」「半碗米饭」「1杯牛奶」——每一项都带具体量，不再只报名字。
function formatPart(name, qty) {
    const item = findFood(name);
    const unit = item === null ? '' : item.unit;
    if (qty === 0.5) {
        return '半' + unit + name;
    }
    return formatGram(qty) + unit + name;
}

// 搭配明细：每样食材的带量名称、这份数下的热量、一句科普。
function buildRecipeLines(recipe) {
    const lines = [];
    for (let i = 0; i < recipe.parts.length; i += 1) {
        const name = recipe.parts[i][0];
        const qty = recipe.parts[i][1];
        const item = findFood(name);
        if (item === null) {
            continue;
        }
        lines.push({
            name: name,
            qtyText: formatPart(name, qty),
            kcalText: Math.round(item.kcal * qty) + ' kcal',
            fact: FOOD_FACTS[name] || '',
            kcal: round1(item.kcal * qty),
            protein: round1(item.p * qty),
            carb: round1(item.c * qty),
            fat: round1(item.f * qty),
            qty: qty,
            unit: item.unit,
        });
    }
    return lines;
}

function getRecipe(id) {
    for (let i = 0; i < RECIPES.length; i += 1) {
        if (RECIPES[i].id === id) {
            return RECIPES[i];
        }
    }
    return null;
}

function calcShares(protein, carb, fat) {
    const proteinEnergy = Math.max(0, protein) * 4;
    const carbEnergy = Math.max(0, carb) * 4;
    const fatEnergy = Math.max(0, fat) * 9;
    const energy = proteinEnergy + carbEnergy + fatEnergy;
    if (energy <= 0) {
        return null;
    }
    return {
        carb: (carbEnergy / energy) * 100,
        protein: (proteinEnergy / energy) * 100,
        fat: (fatEnergy / energy) * 100,
    };
}

// 把一套搭配的食材换算成真实营养值，主食写 0.5 份就按半碗算。
function calcRecipe(recipe) {
    let kcal = 0;
    let protein = 0;
    let carb = 0;
    let fat = 0;
    const parts = [];
    for (let i = 0; i < recipe.parts.length; i += 1) {
        const name = recipe.parts[i][0];
        const qty = recipe.parts[i][1];
        const item = findFood(name);
        if (item === null) {
            continue;
        }
        kcal += item.kcal * qty;
        protein += item.p * qty;
        carb += item.c * qty;
        fat += item.f * qty;
        parts.push(formatPart(name, qty));
    }
    return {
        kcal: Math.round(kcal),
        protein: round1(protein),
        carb: round1(carb),
        fat: round1(fat),
        parts: parts,
        partsText: parts.join(' + '),
    };
}

// 找出今天最该关注的那一项：先看谁超了上限，再看谁掉到下限以下，都正常就算稳。
function resolveDirection(shares) {
    if (shares === null) {
        return { key: 'unknown', label: '', focus: 'balanced', tags: FOCUS_TAGS.balanced };
    }
    const order = [
        { key: 'carb', label: '碳水' },
        { key: 'protein', label: '蛋白' },
        { key: 'fat', label: '脂肪' },
    ];
    let worstHigh = null;
    let worstLow = null;
    for (let i = 0; i < order.length; i += 1) {
        const item = order[i];
        const range = MACRO_RANGES[item.key];
        const alert = ALERT[item.key];
        const value = shares[item.key];
        // 是否提醒看 alert，差多少个点按真正的建议区间算（80% 碳水的「超出」要让用户看懂）。
        if (value > alert.max) {
            const diff = value - range.max;
            if (worstHigh === null || diff > worstHigh.diff) {
                worstHigh = { key: item.key, label: item.label, diff: diff, share: value };
            }
        } else if (value < alert.min) {
            const diff = range.min - value;
            if (worstLow === null || diff > worstLow.diff) {
                worstLow = { key: item.key, label: item.label, diff: diff, share: value };
            }
        }
    }
    if (worstHigh !== null) {
        return {
            key: 'high',
            macro: worstHigh,
            focus: worstHigh.key + 'High',
            tags: FOCUS_TAGS[worstHigh.key + 'High'],
        };
    }
    if (worstLow !== null) {
        return {
            key: 'low',
            macro: worstLow,
            focus: worstLow.key + 'Low',
            tags: FOCUS_TAGS[worstLow.key + 'Low'],
        };
    }
    return { key: 'balanced', focus: 'balanced', tags: FOCUS_TAGS.balanced };
}

function nextMealKey(hour) {
    if (hour < 10) {
        return 'breakfast';
    }
    if (hour < 15) {
        return 'lunch';
    }
    if (hour < 21) {
        return 'dinner';
    }
    return 'snack';
}

// 按时段给默认餐次，记一笔 / 饮食建议 / 食谱库三处共用，保证默认停在同一餐：
// 5–10 早餐、10–14 午餐、17–21 晚餐，其余（下午茶 14–17、夜宵 21–5）归加餐。
function mealOfHour(hour) {
    if (hour >= 5 && hour < 10) {
        return 'breakfast';
    }
    if (hour >= 10 && hour < 14) {
        return 'lunch';
    }
    if (hour >= 17 && hour < 21) {
        return 'dinner';
    }
    return 'snack';
}

// 按餐次挑建议：营养方向匹配优先，同分时热量低的在前，固定给 3 条。
// 剩余额度只用来标记「吃掉会超」，不把搭配直接过滤掉，保证每餐总有 3 条可看。
function pickRecipesByMeal(mealKey, direction, options) {
    const config = options || {};
    const remaining = Number(config.remainingKcal);
    const hasRemaining = Number.isFinite(remaining);
    const tags = (direction && direction.tags) || FOCUS_TAGS.balanced;

    const pool = [];
    for (let i = 0; i < RECIPES.length; i += 1) {
        const recipe = RECIPES[i];
        if (recipe.meal !== mealKey) {
            continue;
        }
        const stat = calcRecipe(recipe);
        let score = 0;
        for (let j = 0; j < recipe.tags.length; j += 1) {
            if (tags.indexOf(recipe.tags[j]) !== -1) {
                score += 3;
            }
        }
        const over = hasRemaining && stat.kcal > remaining;
        if (over) {
            score -= 5;
        }
        pool.push({
            id: recipe.id,
            meal: recipe.meal,
            icon: recipe.icon,
            tags: recipe.tags,
            why: recipe.why,
            stat: stat,
            over: over,
            score: score,
        });
    }

    pool.sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        return left.stat.kcal - right.stat.kcal;
    });
    return pool.slice(0, 3);
}

function pickFoods(direction) {
    const names = FOCUS_FOODS[direction.focus] || FOCUS_FOODS.balanced;
    const list = [];
    for (let i = 0; i < names.length; i += 1) {
        const item = findFood(names[i]);
        if (item === null) {
            continue;
        }
        list.push({
            name: item.name,
            unit: item.unit,
            kcal: item.kcal,
            protein: item.p,
            carb: item.c,
            fat: item.f,
            kcalText: String(item.kcal) + ' kcal',
            proteinText: '蛋白 ' + formatGram(item.p) + ' g',
        });
    }
    return list;
}

// 首页第一行用的一句话：格式和下面的「目标 xxx · 调整 ›」对齐。
function buildAdviceLine(params) {
    const config = params || {};
    const count = Number(config.count) || 0;
    if (count === 0) {
        return { text: '今天还没记录 · 记第一笔 ›', tone: 'neutral', target: 'add' };
    }
    // 热量明显超标时优先提醒，营养素再均衡也不能说「吃得很稳」，
    // 否则红卡上挂着绿色鼓励语，卡片变色就失去意义了
    const total = Number(config.total) || 0;
    const goal = Number(config.goal) || 0;
    if (goal > 0 && total > goal * 1.15) {
        return {
            text: '热量已超出 ' + Math.round((total / goal - 1) * 100) + '% · 建议调整 ›',
            tone: 'warn',
            target: 'advice',
        };
    }
    const shares = calcShares(
        Number(config.protein) || 0,
        Number(config.carb) || 0,
        Number(config.fat) || 0
    );
    if (shares === null) {
        return { text: '营养素没填 · 补一笔 ›', tone: 'neutral', target: 'add' };
    }
    const direction = resolveDirection(shares);
    if (direction.key === 'high') {
        return {
            text: direction.macro.label + ' ' + Math.round(shares[direction.macro.key]) + '% 偏高 · 建议 ›',
            tone: 'warn',
            target: 'advice',
        };
    }
    if (direction.key === 'low') {
        return {
            text: direction.macro.label + ' ' + Math.round(shares[direction.macro.key]) + '% 偏低 · 建议 ›',
            tone: 'low',
            target: 'advice',
        };
    }
    return { text: '今天吃得很稳，继续保持 ›', tone: 'good', target: 'advice' };
}

// 首页第一张卡的状态色：越偏离建议区间越红，越合理越绿。
// 没记录时用本色（橙色环 + 灰色额度），不对空数据做评价。
const UNKNOWN_HEX = '#9aa0a8';

const EMPTY_MOOD = {
    key: 'empty',
    score: 1,
    hex: '#ff6b35',
    headerHex: '#8a8f99',
    soft: 'rgba(255, 107, 53, 0.10)',
    border: 'rgba(255, 255, 255, 0.65)',
    glow: 'rgba(31, 35, 41, 0.06)',
    // 没记录：卡片里留一团本色橙的淡光，保持有生命感但不下任何判断
    halo: haloOf('#ff6b35', 0.22),
    bright: '#ff9a72',
    // 没记录走浅色卡，卡底用页面的白色玻璃，只在左上留一团橙光
    cardBg: '',
    cardGlow: cardGlowOf('#ff6b35', 0.16),
};

function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        return 0;
    }
    return n > 1 ? 1 : n;
}

// 状态色不是连续色相环：直接钉五个桩，红 → 橙 → 琥珀 → 黄绿 → 绿，
// 中间按 RGB 线性插值。走 HSL 色相环会在黄绿段发脏（发橄榄色）。
const MOOD_STOPS = [
    { at: 0, hex: '#cf3a30' },
    { at: 0.3, hex: '#e0662c' },
    { at: 0.55, hex: '#d99a2b' },
    { at: 0.75, hex: '#8fbf4a' },
    { at: 1, hex: '#2fa36b' },
];

function toHex2(value) {
    const n = Math.max(0, Math.min(255, Math.round(value)));
    const text = n.toString(16);
    return text.length === 1 ? '0' + text : text;
}

function mixHex(from, to, ratio) {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    return '#' + toHex2(a.r + (b.r - a.r) * ratio)
        + toHex2(a.g + (b.g - a.g) * ratio)
        + toHex2(a.b + (b.b - a.b) * ratio);
}

function moodColor(score) {
    const value = clamp01(score);
    for (let i = 0; i < MOOD_STOPS.length - 1; i += 1) {
        const from = MOOD_STOPS[i];
        const to = MOOD_STOPS[i + 1];
        if (value <= to.at) {
            const ratio = to.at === from.at ? 0 : (value - from.at) / (to.at - from.at);
            return mixHex(from.hex, to.hex, ratio);
        }
    }
    return MOOD_STOPS[MOOD_STOPS.length - 1].hex;
}

function hexToRgb(hex) {
    const text = String(hex).replace('#', '');
    return {
        r: parseInt(text.slice(0, 2), 16) || 0,
        g: parseInt(text.slice(2, 4), 16) || 0,
        b: parseInt(text.slice(4, 6), 16) || 0,
    };
}

function tint(hex, alpha) {
    const rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
}

// 首页卡片里那团会呼吸的光：中心是状态色，边缘融进卡片白底。
// 用 radial-gradient 而不是 blur，因为渐变能直接当 background 用，不必多开一层滤镜。
function haloOf(hex, alpha) {
    return 'radial-gradient(circle at 50% 50%, ' + tint(hex, alpha) + ' 0%, ' + tint(hex, 0) + ' 72%)';
}

// 深色状态卡的底：把状态色按 14%–20% 混进近黑，色相一眼可辨，又压得住白字。
// 四个桩位错开底色，渐变才有方向感，不会像一块死板的纯色。
// 整张卡跟状态色深混。比例不能太高（混太黑红绿就分不出来了）：留 26%–38% 的
// 状态色在卡面上，肉眼看得出红 / 琥珀 / 绿的差别。三段桩位各偏一点，
// 加上 background-size 放大后 position 游走，卡面会有明显的色彩流动。
// 近黑桩位写死在函数里而不是提到模块顶层：EMPTY_MOOD 在本文件靠前就要求值，
// 顶层 const 那时还在 TDZ 里，取不到。
function cardBgOf(hex) {
    const a = mixHex(hex, '#10151c', 0.62);
    const b = mixHex(hex, '#141a22', 0.74);
    const c = mixHex(hex, '#181219', 0.68);
    return 'linear-gradient(135deg, ' + a + ' 0%, ' + b + ' 34%, ' + c + ' 62%, ' + a + ' 100%)';
}

// 叠在卡面上的流光：两团同色光斑，只给背景图不给定位——
// 位置/尺寸/扫动全交给 wxss 的 background-size + background-position 动画，
// 全程在卡片内部游走（不用 at 定位，那个动不了；也不用 transform，会移出圆角）。
// 两团光斑对角相向而行，叠上卡底自己的缓速游走，看起来像光在卡面上流动。
function cardGlowOf(hex, alpha) {
    const top = Number(alpha) > 0 ? Number(alpha) : 0.3;
    const blob = 'radial-gradient(closest-side, ' + tint(hex, top) + ' 0%, '
        + tint(hex, top * 0.35) + ' 55%, ' + tint(hex, 0) + ' 100%)';
    return blob + ', ' + blob;
}

function resolveMood(params) {
    const config = params || {};
    const count = Number(config.count) || 0;
    const total = Number(config.total) || 0;
    const goal = Number(config.goal) > 0 ? Number(config.goal) : 0;
    const hour = Number.isFinite(Number(config.hour)) ? Number(config.hour) : new Date().getHours();

    // 一条没记：不评价，环和额度都保持原本的颜色
    if (count === 0) {
        return EMPTY_MOOD;
    }

    const shares = calcShares(
        Number(config.protein) || 0,
        Number(config.carb) || 0,
        Number(config.fat) || 0
    );

    // 热量：超出目标扣得最狠，晚上还吃得太少也扣一点
    let kcalScore = 1;
    if (goal > 0) {
        const ratio = total / goal;
        if (ratio > 1) {
            kcalScore = clamp01(1 - (ratio - 1) / 0.3);
        } else if (ratio < 0.6 && hour >= 19) {
            kcalScore = clamp01(ratio / 0.6);
        }
    }

    let macroScore = 0;
    if (shares !== null) {
        const keys = ['carb', 'protein', 'fat'];
        let worst = 0;
        for (let i = 0; i < keys.length; i += 1) {
            const range = MACRO_RANGES[keys[i]];
            const value = shares[keys[i]];
            if (value > range.max) {
                worst = Math.max(worst, value - range.max);
            } else if (value < range.min) {
                worst = Math.max(worst, range.min - value);
            }
        }
        // 偏离 12 个百分点就到底，全红
        macroScore = clamp01(1 - worst / 12);
    }

    // 结构分和热量分取几何平均：只要有一头拉胯就压下来，两头都好才真绿。
    // 结构未知（只记了热量没填营养素）时也跟着热量分走：卡面照样随吃多吃少变色，
    // 只是掺 28% 灰表示「结构没评」。之前直接钉死灰色，卡面对热量完全无响应。
    const score = shares === null ? kcalScore : Math.sqrt(macroScore * kcalScore);
    const hex = shares === null ? mixHex(moodColor(score), UNKNOWN_HEX, 0.28) : moodColor(score);

    let key = 'bad';
    if (score >= 0.85) {
        key = 'good';
    } else if (score >= 0.6) {
        key = 'fair';
    } else if (score >= 0.35) {
        key = 'warn';
    }
    // 结构没评上，热量分再高也不说「很好」，封顶 fair
    if (shares === null && key === 'good') {
        key = 'fair';
    }

    const brightHex = mixHex(hex, '#ffffff', shares === null ? 0.18 : 0.3);

    return {
        key: key,
        score: Math.round(score * 100) / 100,
        hex: hex,
        headerHex: shares === null ? '#8a8f99' : hex,
        soft: tint(hex, shares === null ? 0.08 : 0.12),
        border: tint(hex, shares === null ? 0.18 : 0.3),
        glow: tint(hex, shares === null ? 0.08 : 0.14),
        // 卡片背景里的呼吸光斑：同一套状态色的柔和径向渐变，浓度随状态可信度调整
        halo: haloOf(hex, shares === null ? 0.16 : 0.4),
        // 深色卡专用：同色相提亮 30%，进度线、提示字都用它
        bright: brightHex,
        // 整张卡跟着状态色走：底色深混状态色，卡面左上再压一团同色柔光
        cardBg: cardBgOf(hex),
        cardGlow: cardGlowOf(hex, shares === null ? 0.20 : 0.30),
    };
}

// 建议页顶部三根条：带上建议区间和状态，让「为什么给我这些建议」有依据。
function buildMacroRows(shares) {
    const order = [
        { key: 'carb', label: '碳水' },
        { key: 'protein', label: '蛋白' },
        { key: 'fat', label: '脂肪' },
    ];
    const rows = [];
    for (let i = 0; i < order.length; i += 1) {
        const item = order[i];
        const range = MACRO_RANGES[item.key];
        let value = 0;
        let status = 'none';
        if (shares !== null) {
            value = round1(shares[item.key]);
            if (value > range.max + 0.5) {
                status = 'high';
            } else if (value < range.min - 0.5) {
                status = 'low';
            } else {
                status = 'ok';
            }
        }
        rows.push({
            key: item.key,
            label: item.label,
            color: MACRO_COLORS[item.key],
            shareValue: value,
            shareText: shares === null ? '—' : Math.round(value) + '%',
            rangeText: '建议 ' + range.min + '–' + range.max + '%',
            width: Math.max(3, Math.min(100, value)),
            markLeft: range.min,
            markWidth: range.max - range.min,
            status: status,
            statusText: shares === null ? STATUS_TEXT.none : STATUS_TEXT[status],
        });
    }
    return rows;
}

// 三根独立的条读起来要来回比长度，改成一根堆叠条：三种颜色拼成 100%，
// 一眼看出结构比例，图例里再给具体数值和建议区间。
function buildMacroStack(rows) {
    const list = Array.isArray(rows) ? rows : [];
    let total = 0;
    for (let i = 0; i < list.length; i += 1) {
        total += Math.max(0, Number(list[i].shareValue) || 0);
    }
    if (total <= 0) {
        return { empty: true, segments: [] };
    }
    const segments = [];
    for (let i = 0; i < list.length; i += 1) {
        const value = Math.max(0, Number(list[i].shareValue) || 0);
        if (value <= 0) {
            continue;
        }
        const width = Math.round((value / total) * 10000) / 100;
        segments.push({
            key: list[i].key,
            label: list[i].label,
            color: list[i].color,
            width: width,
            shareText: list[i].shareText,
            // 段太窄塞不下数字，只留色块。
            showText: width >= 12,
        });
    }
    // 四舍五入后补齐到 100%，否则右侧会漏一条缝。
    if (segments.length > 0) {
        let sum = 0;
        for (let i = 0; i < segments.length; i += 1) {
            sum += segments[i].width;
        }
        const gap = Math.round((100 - sum) * 100) / 100;
        if (gap !== 0) {
            const last = segments[segments.length - 1];
            last.width = Math.round((last.width + gap) * 100) / 100;
        }
    }
    return { empty: false, segments: segments };
}

// （旧 buildRecipeGroups 已随食谱库页面并入饮食建议页而移除，按餐分组由页面 tab 承担。）

module.exports = {
    MEAL_META,
    RECIPES,
    FOOD_FACTS,
    calcRecipe,
    calcShares,
    resolveDirection,
    pickRecipesByMeal,
    buildRecipeLines,
    getRecipe,
    pickFoods,
    buildAdviceLine,
    buildMacroRows,
    buildMacroStack,
    resolveMood,
    cardBgOf,
    cardGlowOf,
    MACRO_COLORS,
    MACRO_COLORS_DARK,
    formatGram,
    nextMealKey,
    mealOfHour,
};
