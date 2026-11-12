function macro(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? (Math.round(value * 10) / 10) + 'g' : '未记录';
}

function build(record) {
    const note = typeof record.note === 'string' ? record.note.trim() : '';
    let source = '';
    let detail = note;
    if (/AI\s*(?:营养|照片)?\s*估算/.test(note)) {
        source = 'AI估算';
        detail = note.replace(/AI\s*(?:营养|照片)?\s*估算[，,]?\s*(?:请核对(?:做法与份量)?)?/, '').replace(/^[；;，,\s]+/, '').trim();
    } else if (/官方(?:成分|成份|分类)表/.test(note)) {
        source = '食库参考';
        detail = note.split(' · ').filter(part => !/^(官方(?:成分|成份|分类)表|置信度|熟食材|生食材)/.test(part)).join(' · ');
    } else if (/^(?:USDA 成分数据|本地食物参考|套餐估算|参考：)/.test(note)) {
        source = '食库参考';
        detail = note.replace(/^(?:USDA 成分数据|本地食物参考|套餐估算|参考：[^·；;]+)\s*(?:·\s*)?/, '').trim();
    }
    const weightMatch = note.match(/(?:^|[；;])参考每[^；;]+?\d+(?:\.\d+)?g，共(\d+(?:\.\d+)?)g(?:[；;]|$)/);
    const weight = weightMatch && Number(weightMatch[1]) > 0 ? weightMatch[1] + '克' : '';
    return {
        macroText: '蛋白质 ' + macro(record.protein) + ' · 碳水 ' + macro(record.carb) + ' · 脂肪 ' + macro(record.fat),
        detailText: [source, detail].filter(Boolean).join(' · '),
        sourceText: source,
        qtyText: ' ×' + (weight || (record.qty + record.unit)),
    };
}

module.exports = { build };
