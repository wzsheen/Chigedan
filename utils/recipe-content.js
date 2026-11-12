const { FOOD_DB } = require('./food-db');
const TITLES = {
    b1:'全麦面包配鸡蛋牛奶', b2:'香蕉酸奶燕麦碗', b3:'鸡蛋青菜配白粥', b4:'三明治早餐', b5:'玉米鸡蛋配牛奶',
    b6:'包子鸡蛋配豆浆', b7:'菠菜鸡蛋小米粥', b8:'煎蛋全麦早餐', b9:'红薯鸡蛋配牛奶', b10:'酸奶草莓吐司',
    l1:'鸡胸肉西兰花饭', l2:'牛肉面配番茄', l3:'鱼肉菠菜配米饭', l4:'鸡胸肉全麦沙拉', l5:'馄饨配鲜橙',
    l6:'鸡腿蔬菜饭', l7:'牛肉番茄米线', l8:'寿司豆腐配蔬菜', l9:'番茄鸡蛋虾仁饭', l10:'盖浇饭配沙拉',
    d1:'虾仁豆腐西兰花饭', d2:'红薯鸡胸肉配生菜', d3:'鱼肉青菜小米粥', d4:'饺子配苹果', d5:'牛肉蘑菇饭',
    d6:'排骨白菜配米饭', d7:'玉米虾仁豆腐餐', d8:'鸡丝凉面配黄瓜', d9:'米线配虾和生菜', d10:'菌菇豆腐煲配饭',
    s1:'鸡蛋配美式咖啡', s2:'草莓酸奶杯', s3:'香蕉配坚果', s4:'鸡胸肉黄瓜小食', s5:'猕猴桃酸奶杯',
    s6:'苹果配牛奶', s7:'坚果配全麦面包', s8:'黄瓜番茄小食', s9:'豆浆配香蕉', s10:'胡萝卜酸奶小食',
    b11:'馒头鸡蛋配牛奶', b12:'玉米酸奶配苹果', l11:'牛肉豆腐蔬菜饭', l12:'虾仁鸡蛋配米饭',
    d11:'鱼肉菌菇配红薯', d12:'鸡胸肉豆腐蔬菜饭', s11:'牛奶配全麦面包', s12:'橙子配酸奶',
};
function foodFact(name) {
    if (/牛奶|酸奶|豆浆|豆腐|水煮蛋|鸡蛋|煎蛋|鸡胸肉|鸡腿|鸡翅|牛肉|鱼|虾|排骨/.test(name)) return '提供蛋白质，参与肌肉等组织的构成与维护。动物和植物蛋白来源可搭配轮换，烹调会影响脂肪、盐与热量。';
    if (/米饭|面|粥|玉米|红薯|馒头|包子|饺子|馄饨|寿司/.test(name)) return '作为谷薯或主食类搭配，提供碳水化合物与日常活动所需能量。不同做法与份量的营养值不同。';
    if (/坚果/.test(name)) return '可以增加食物种类，也会带来脂肪和能量。“一包”重量差异较大，先核对包装份量，再决定本次吃多少。';
    if (/咖啡/.test(name)) return '饮品的配料会影响热量；加糖或奶后，应按实际配料记录。它不能替代一餐中的其他食物。';
    return '用不同蔬果增加维生素、矿物质与膳食纤维来源，丰富日常搭配。不同食物各有营养特点，不能仅凭热量判断整份餐食。';
}
const FOOD_FACTS = {};
FOOD_DB.forEach(food => { for(const name of [food.name].concat(food.aliases || []))FOOD_FACTS[name] = foodFact(food.name); });
// Explicitly reviewed assignments. Keep suitable existing photographs in place;
// do not group every yogurt/fruit recipe under a strawberry photograph.
const ORIGINAL_ART = {
    b1:0,b2:1,b3:0,b5:2,b6:3,b7:0,b8:0,b9:0,b10:10,b11:3,b12:2,
    l1:4,l2:5,l3:6,l4:9,l6:4,l7:5,l8:7,l9:8,l10:4,l11:5,l12:8,
    d1:8,d2:4,d3:6,d5:5,d7:8,d8:9,d9:8,d10:7,d11:6,d12:7,
    s2:10,s6:11,s7:11,s11:11,
};
// Extra atlas: 5 columns x 2 rows, left to right.
// orange / banana+soy milk / kiwi+yogurt / carrot+yogurt / cucumber+tomato
// chicken+cucumber / egg+coffee / sandwich+coffee / dumplings+apple / ribs+cabbage+rice
const EXTRA_ART = {b4:7,l5:0,d4:8,d6:9,s1:6,s3:1,s4:5,s5:2,s8:4,s9:1,s10:3,s12:0};
function recipeImage(recipe) {
    const extra = Object.prototype.hasOwnProperty.call(EXTRA_ART,recipe.id);
    const index = extra ? EXTRA_ART[recipe.id] : ORIGINAL_ART[recipe.id];
    if (index === undefined) return {src:'',style:''};
    const columns = extra ? 5 : 4;
    return {
        src: extra ? '/assets/recipe-atlas-extra.jpg' : '/assets/recipe-atlas.jpg',
        style:(extra ? 'width:500%;height:200%;' : '')+'left:-'+(index % columns * 100)+'%;top:-'+(Math.floor(index / columns)*100)+'%;',
    };
}
function recipeArt(recipe) { return recipeImage(recipe).style; }
module.exports = { TITLES, FOOD_FACTS, recipeImage, recipeArt };
