const foodDb = require('./food-db');
const nutrition = require('./nutrition');
const regional = require('./chongqing-foods').foods;
const beverages = require('./beverage-data');
const icons = require('./meal-icon-data');

const categories = [
    '常吃', '米饭', '面食', '小吃', '肉类', '快餐', '蛋奶豆', '饮品', '汤类', '水果',
    '薯类淀粉', '蔬菜菌藻', '零食甜点', '坚果', '我的',
].map(name => ({ name, icon: icons.categories[name] }));
const visibleColumns = 5;

const importedCategories = Object.create(null);
require('./china-food-index').rows.forEach(row => { if (!importedCategories[row.name]) importedCategories[row.name] = row; });

function categoryOf(name, original, meta) {
    const source = meta && meta.originalCategory || '';
    const detail = meta && meta.subcategory || '';
    const main = name.split(/[（(\[［]/)[0];
    if (/调味料|调味品/.test(name) || original === '油脂调味') return null;
    if (/汤|羹/.test(main) && !/汤圆|汤面|汤粉|汤包|汤料|汤底|调味/.test(main)) return '汤类';
    if (/便当|盖浇|盖饭|汉堡|披萨|比萨|三明治|饭团|套餐/.test(main) || original === '复合餐' || detail === '米饭盖浇' || original === '快餐') return '快餐';
    if (/抄手|苕皮|糍粑|糯米糍|三大炮|糖不甩|凉虾|冰粉|桃片|麻花|锅盔|春卷|烧烤|串串|油条|煎饼果子|肉夹馍|薯片/.test(main)) return '小吃';
    if (/饺|包子|小笼包|流沙包|叉烧包|生煎包|馒头|花卷|面|泡面|手抓饼|吐司|米线|米粉|粉丝|粉条|馄饨|烙饼|油饼|烧饼|面包|汤圆|面筋|凉皮|干炒牛河|锅贴|烧麦|肠粉|馅饼|千层饼|酱香饼|白吉馍/.test(main) && !/荞麦|麦面|米粉\(婴/.test(main)) return '面食';
    if (/果干|果脯|蜜枣|饼干|曲奇|蛋糕|糖果|巧克力|蜜饯|冰淇淋|棒冰|月饼/.test(main) || /果脯|蜜饯|糖果|蛋糕|甜点|休闲食品/.test(detail)) return '零食甜点';
    if (/茶叶蛋/.test(main)) return '蛋奶豆';
    if (/茶树菇|油麦菜|玉米笋|薯叶|甘薯叶/.test(main)) return '蔬菜菌藻';
    if (/饮料|奶茶|咖啡|可乐|汽水|雪碧|豆浆|果汁|橙汁|牛奶|酸奶|酒|茶/.test(main) || original === '饮料酒') return /牛奶|酸奶|奶粉/.test(main) && !/味/.test(name) ? '蛋奶豆' : '饮品';
    if (/土豆|薯条|马铃薯|甘薯|红薯|白薯|山药|芋头|芋艿|淀粉|木薯|薯粉|魔芋|团粉|芡粉/.test(main)) return '薯类淀粉';
    if (original === '坚果种子' || /^(核桃|花生|瓜子|杏仁|开心果|腰果|松子)/.test(main)) return '坚果';
    if (/鱼香肉丝/.test(main)) return '肉类';
    if (/鱼虾蟹贝/.test(source) || /虾|蟹|鱼|贝|海参|鱿鱼|章鱼|蚌|牡蛎|扇贝/.test(main)) return '肉类';
    if (/畜肉|禽肉/.test(source) || /猪|牛肉|羊肉|鸡(?!蛋)|鸭|鹅|排骨|肥肠|毛肚|肉类/.test(main)) return '肉类';
    if (/水果/.test(source)) return /干|果脯|蜜枣|柿饼/.test(name) ? '零食甜点' : '水果';
    if (/苹果|橙|梨|桃|莓|西瓜|葡萄|香蕉|猕猴桃|芒果|菠萝|荔枝|柚|柑|火龙果|鲜枣/.test(main)) return '水果';
    if (original === '零食甜点') return '零食甜点';
    if (/蛋类|乳类|干豆类/.test(source) || /蛋|豆腐|豆花|奶粉|豆干|豆皮|黄豆|扁豆/.test(main)) return '蛋奶豆';
    if (/蔬菜|菌藻/.test(source) || /青菜|白菜|蔬菜|菠菜|西兰花|黄瓜|番茄|胡萝卜|生菜|花菜|甘蓝|茄|藕|蘑菇|豆芽|卷心菜|海带|紫菜|菌/.test(main)) return '蔬菜菌藻';
    if (/米|饭|粥|燕麦|玉米|杂粮|谷|稻|高粱|荞麦|麦片/.test(main) && !/甜心|热狗|奶|玉米饼/.test(main)) return '米饭';
    if (original === '肉蛋奶豆' || original === '蛋奶豆') return '蛋奶豆';
    if (original === '荤菜' || original === '肉类') return '肉类';
    if (original === '蔬菜' || original === '蔬菜菌藻') return '蔬菜菌藻';
    if (['米饭','面食','小吃','快餐','饮品','水果','薯类淀粉','坚果','汤类','零食甜点'].includes(original)) return original;
    return null;
}

// Fixed reference recipes use the existing rice, chicken and cooked pea data.
const components = [
    { label: '米饭', food: '熟白米饭' },
    { label: '荤菜', food: '烤鸡胸肉' },
    { label: '素菜', ingredient: 'peas' },
];
function template(name, weights) {
    const parts = components.map((part, index) => {
        if (part.food) {
            const row = nutrition.lookupBuiltin(part.food, '克');
            return { label: part.label, grams: weights[index], kcal: row.kcal, p: row.p, c: row.c, f: row.f };
        }
        const [kcal, p, c, f] = require('./chongqing-data').ingredients[part.ingredient].v;
        return { label: part.label, grams: weights[index], kcal: kcal / 100, p: p / 100, c: c / 100, f: f / 100 };
    });
    const total = key => parts.reduce((sum, part) => sum + part[key] * part.grams, 0);
    return { name, unit: '份', grams: weights.reduce((a, b) => a + b, 0), parts,
        kcal: total('kcal'), p: total('p'), c: total('c'), f: total('f'), category: '快餐', source: 'meal-template' };
}

const templates = [
    template('全素', [180, 0, 220]),
    template('一荤两素', [160, 90, 150]),
    template('两荤一素', [150, 160, 90]),
    template('一荤一素', [140, 90, 90]),
    template('两荤两素', [160, 150, 150]),
];

function realFoodIcon(name) {
    const base = name.split(/[（(\[［]/)[0].replace(/^(生|鲜|新鲜|原味|干|熟)/, '');
    const direct = [
        [/^(水饺|饺子|蒸饺|煎饺|饺)/, 'dumpling'], [/^油条/, 'youtiao'],
        [/^(烤|水煮|生|熟)?鸡胸肉/, 'chicken-breast'], [/^(鸡腿|烤鸡腿)/, 'drumstick'],
        [/^(鸡翅|烤鸡翅)/, 'chicken-wing'], [/^(小笼包|包子|肉包|叉烧包)/, 'bao'],
        [/^馒头/, 'mantou'], [/^(麻花)/, 'twist'], [/^(火腿肠|香肠)/, 'sausage'],
    ];
    const directMatch = direct.find(([pattern]) => pattern.test(name));
    if (directMatch) return '/assets/meal-icons/real-' + directMatch[1] + '.png';
    if (/炒|汤|汁|饮料|奶|味|蛋糕|饼干|酱|沙拉|馅|面包|粥|饭/.test(name)) return '';
    const rules = [
        [/^(巧克力)/, 'chocolate'], [/^(黄瓜|青瓜)/, 'cucumber'], [/^(西兰花|绿花椰菜)/, 'broccoli'],
        [/^(番茄|西红柿)/, 'tomato'], [/^(胡萝卜)/, 'carrot'], [/^(苹果)/, 'apple'],
        [/^(香蕉)/, 'banana'], [/^(橙子|橙|柑橘)/, 'orange'], [/^(西瓜)/, 'watermelon'],
        [/^(葡萄)/, 'grape'], [/^(草莓)/, 'strawberry'], [/^(核桃)/, 'walnut'],
        [/^(花生)/, 'peanut'], [/^(杏仁)/, 'almond'], [/^(开心果)/, 'pistachio'],
    ];
    const match = rules.find(([pattern]) => pattern.test(base));
    return match ? '/assets/meal-icons/real-' + match[1] + '.png' : '';
}

function decorate(row, personal) {
    const savedCategory = personal && categories.some(item => item.name === row.category && !['常吃', '我的'].includes(item.name));
    const inferred = categoryOf(row.name, row.category, importedCategories[row.name]);
    const category = inferred === '汤类' ? inferred : row.category === '水产' ? '肉类' : savedCategory ? row.category : inferred;
    const dedicatedIcon = realFoodIcon(row.name) || (Object.prototype.hasOwnProperty.call(icons.foods, row.name) ? icons.foods[row.name] : '');
    const icon = dedicatedIcon || icons.categories[category] || icons.categories['小吃'];
    return Object.assign({}, row, { category, icon, dedicatedIcon: !!dedicatedIcon, personal: !!personal });
}

function rows(personal, counts) {
    const common = foodDb.FOOD_DB;
    const drinks = beverages.map(row => nutrition.lookupBuiltin(row.name));
    const basics = nutrition.data.map(row => nutrition.lookupBuiltin(row.name));
    const chinese = require('./china-food-index').rows.map(row => require('./china-food-index').lookup(row.name));
    const names = new Set();
    const featured = common.concat(regional, drinks).filter(Boolean).map(row => Object.assign(decorate(row, false), { featured: true }));
    return templates.map(row => Object.assign({ featured: true }, row))
        .concat(personal.map(row => decorate(row, true)), featured, [nutrition.lookupBuiltin('小笼包')], basics, chinese)
        .filter(row => row && !names.has(row.name) && names.add(row.name))
        .map(row => row.icon ? row : decorate(row, false))
        .filter(row => row.category)
        .sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0)
            || Number(!!b.featured) - Number(!!a.featured)
            || Number(b.dedicatedIcon) - Number(a.dedicatedIcon));
}

module.exports = { categories, rows, decorate, visibleColumns, addIcon: icons.categories['新增'] };
