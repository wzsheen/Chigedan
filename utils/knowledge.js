// Editorial summaries, not clinical advice. URLs are readable/copyable in the article view.
const SOURCES = {
    variety: { name: '中国营养学会／湖北省卫健委：食物多样，合理搭配', url: 'https://wjw.hubei.gov.cn/bmdt/jkhb/spyy/202205/t20220519_4133461.shtml' },
    label: { name: 'FDA：How to Understand and Use the Nutrition Facts Label', url: 'https://www.fda.gov/food/nutrition-facts-label/how-understand-and-use-nutrition-facts-label' },
    healthy: { name: 'WHO：Healthy diet', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
    bmi: { name: 'CDC：BMI Frequently Asked Questions', url: 'https://www.cdc.gov/bmi/faq/index.html' },
    grain: { name: '国家卫健委：“健康饮食、合理膳食”核心信息', url: 'https://www.nhc.gov.cn/sps/c100088/202505/6b7a718abd4848e8a3e98fc561a8858b.shtml' },
};
const CATEGORIES = ['全部', '看懂营养', '一餐搭配', '份量估算', '日常习惯', '身体数据'];
const ARTICLES = [
    { id: 'portion', category: '份量估算', title: '一份食物，到底有多少？', summary: '先看计量单位，再核对自己吃了多少。', minutes: 2, art: 'grain', sources: ['label'], sections: [
        ['“一份”和“吃下的量”不同', '包装上的每份营养值有它的计算基准，不一定等于你这次实际吃下的量。先找到每份或每100克的标示。'],
        ['再换算到本次份量', '如果标签按每100克计算，实际吃了150克，热量和营养素就乘以1.5；按份标示时，则核对一份究竟有多重。'],
        ['在手账里怎么做', '“一碗”“一个”的大小可能不同。把称重结果或包装信息作为修正依据，比只看照片更容易核对。照片识别结果也需要自己确认。'],
    ] },
    { id: 'labels', category: '看懂营养', title: '营养成分表，先看哪几项？', summary: '统一基准，才好比较热量和营养素。', minutes: 2, art: 'label', sources: ['label'], sections: [
        ['先对齐计量基准', '比较两种产品前，先确认一个是按每份还是每100克标示，并核对自己将吃下的量。'],
        ['看总量，也看组成', '热量、蛋白质、脂肪、碳水化合物和钠等信息可以一起看。某一个数字低，并不能单独证明整种食品更适合自己。'],
        ['按实际吃下的量记录', '如果一包包含多份，吃完一整包时不能只记一份。包装参考份量也不是要求每个人都吃同样多。'],
    ] },
    { id: 'plate', category: '一餐搭配', title: '外卖也能搭配得更均衡', summary: '从主食、蔬菜和蛋白质食物开始组合。', minutes: 2, art: 'plate', sources: ['variety', 'healthy'], sections: [
        ['先看看缺了哪一类', '点餐时同时留意谷薯类、蔬菜和肉蛋奶豆等食物。用不同种类补足搭配，比只盯着热量更直观。'],
        ['小份量，多几样', '可以在同类食物中轮换选择，让一天和一周的食物来源更丰富。这里的食谱是参考组合，份量仍需按实际情况调整。'],
        ['不必靠下一餐“抵消”', '把观察范围放在持续的饮食安排上。手账提供的是已记录内容，漏记的一餐不等于没有吃。'],
    ] },
    { id: 'macros', category: '看懂营养', title: '热量之外，也看看营养结构', summary: '三大营养素和食物多样性一起观察。', minutes: 2, art: 'grain', sources: ['healthy'], sections: [
        ['同样的热量，组成会不同', '能量需要和年龄、活动等因素有关。观察热量时，也要留意碳水化合物、蛋白质和脂肪的搭配。'],
        ['用多样的食物组合', '谷物、蔬果、豆类以及不同的蛋白质食物，可以共同组成多样的日常饮食。单一食品不能替代完整搭配。'],
        ['保留估算的边界', '本程序的食物库使用参考份量，烹调和品牌会改变数值。提示用于帮助核对记录，不能据此判断完整健康状况。'],
    ] },
    { id: 'grain', category: '日常习惯', title: '让全谷物和蔬菜多一些变化', summary: '从熟悉的食物开始，逐步丰富种类。', minutes: 2, art: 'grain', sources: ['grain'], sections: [
        ['先认识食品的组成', '购买谷物食品时，结合配料表和营养标签判断；食物的颜色或名称不能代替对配料的了解。'],
        ['做可持续的小调整', '在原来的主食和蔬菜搭配里轮换种类，让不同食物都有机会进入日常餐桌。'],
        ['考虑自己的消化与耐受', '全谷物的选择和份量应结合自身情况。胃肠功能较弱时，更要注意粗细搭配与适量。'],
    ] },
    { id: 'bmi', category: '身体数据', title: 'BMI 能告诉我们什么？', summary: '它是筛查参考，不是体脂或健康结论。', minutes: 2, art: 'body', sources: ['bmi'], sections: [
        ['先理解它的用途', 'BMI 把身高与体重结合起来，是一种体重筛查参考。单看它，不能知道体脂比例或身体脂肪分布。'],
        ['肌肉与脂肪无法区分', '相同 BMI 可能对应不同的肌肉、骨骼和脂肪组成。因此不能把一个数值直接当成完整健康结论。'],
        ['在手账中持续观察', '身高、最新体重和记录日期一起展示，方便核对。首页沿用现有成人分级，未成年人等人群不能直接套用成人结果。'],
    ] },
];
const reviewedAt = '2026-11-01';
function getArticle(id) {
    const article = ARTICLES.find(item => item.id === id);
    return article ? Object.assign({}, article, { reviewedAt, references: article.sources.map(key => SOURCES[key]) }) : null;
}
function filterArticles(category, query) {
    const word = String(query || '').trim().toLowerCase();
    return ARTICLES.filter(item => (category === '全部' || item.category === category) && (!word || (item.title + item.summary + item.sections.map(section => section.join(' ')).join(' ')).toLowerCase().includes(word)));
}
module.exports = { ARTICLES, CATEGORIES, SOURCES, getArticle, filterArticles };
