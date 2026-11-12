const { porridgeAliases } = require('./food-aliases');
const rows = require('./china-food-data').map(row => Object.assign({}, row, { aliases: porridgeAliases(row.name, row.aliases) }));
const names = Object.create(null);
rows.forEach(row => [row.name].concat(row.aliases).forEach(name => { if (!names[name]) names[name] = row; }));
// 明确对应到库中的具体做法，泛称食物保留候选供用户选择。
const legacyNames = { '肉夹馍': '肉夹馍（腊汁肉）' };
const synonyms = { '饺子': '水饺', '水姣': '水饺', '水饺子': '水饺' };
const groups = Object.create(null);
for (const row of rows) {
    const base = row.name.split(/[（(]/)[0].trim();
    if (base && base !== row.name) (groups[base] || (groups[base] = [])).push(row);
}
function resolve(name) {
    const query = (name || '').trim();
    const canonical = synonyms[query] || query;
    const exact = names[canonical] || names[legacyNames[canonical]];
    if (exact) return exact;
    const candidates = groups[canonical] || [];
    if (!candidates.length) return null;
    return candidates.find(row => /原味/.test(row.name)) || candidates[Math.floor(Math.random() * candidates.length)];
}
function lookup(name, unit) {
    const row = resolve(name);
    if (!row) return null;
    const selected = unit || '份';
    const grams = selected === '份' ? row.grams : selected === '克' ? 1 : selected === '千克' || selected === '公斤' ? 1000 : selected === '斤' ? 500 : selected === '两' && row.category === '主食' && /面|粉|米线|馄饨|抄手|饺|包子|馒头/.test(row.name) && !/调味料/.test(row.name) && row.state !== '生食材' ? 50 : null;
    if (!grams) return null;
    const value = key => row.per100g[key] === null ? null : row.per100g[key] * grams / 100;
    return { name: row.name, aliases: row.aliases, category: row.category, unit: selected, grams,
        kcal: value('kcal'), p: value('protein'), c: value('carb'), f: value('fat'), sodium: value('sodium'),
        source: 'china-food', portionHint: [row.source, row.confidence ? '置信度' + row.confidence : '', row.state, selected === '两' ? '按成品重量1两=50克估算，请核对' : row.description].filter(Boolean).join(' · ') };
}
module.exports = { rows, lookup };
