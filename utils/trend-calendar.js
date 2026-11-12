const { formatDate } = require('./record-store');

function buildCalendar(year, month, records, today, selected) {
    const first = new Date(year, month, 1);
    const offset = first.getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const buckets = {};
    (records || []).forEach(record => {
        if (!buckets[record.date]) buckets[record.date] = new Set();
        buckets[record.date].add(record.meal);
    });
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push({ key: 'pad-' + i, blank: true });
    for (let day = 1; day <= count; day++) {
        const key = formatDate(new Date(year, month, day));
        const meals = buckets[key];
        const mainMeals = meals ? ['breakfast', 'lunch', 'dinner'].filter(meal => meals.has(meal)).length : 0;
        cells.push({ key, day, future: key > today, selected: key === selected, today: key === today,
            tone: !meals ? 'none' : mainMeals === 3 ? 'three' : 'some' });
    }
    while (cells.length % 7) cells.push({ key: 'end-' + cells.length, blank: true });
    return { cells, label: year + '年' + (month + 1) + '月', canNext: formatDate(new Date(year, month + 1, 1)) <= today };
}

function daySummary(date, records, waterEntries) {
    const rows = (records || []).filter(row => row.date === date);
    const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
    const labels = ['早餐', '午餐', '晚餐', '加餐'];
    return { date, count: rows.length, kcal: rows.reduce((sum, row) => sum + (Number(row.kcal) || 0), 0),
        water: (waterEntries || []).filter(row => row.date === date).reduce((sum, row) => sum + (Number(row.ml) || 0), 0),
        meals: meals.map((meal, index) => {
            const items = rows.filter(row => row.meal === meal);
            return { key: meal, label: labels[index], recorded: items.length > 0,
                text: items.length ? items.map(row => row.name).slice(0, 3).join('、') : '未记录' };
        }) };
}

module.exports = { buildCalendar, daySummary };
