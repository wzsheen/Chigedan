// 体重与喝水数据层：本地存储。

function createWeightStore(options) {
    const config = options || {};
    if (typeof config.storageKey !== 'string' || config.storageKey.trim() === '') {
        throw new TypeError('storageKey 不能为空');
    }
    const storageKey = config.storageKey;

    return {
        list() {
            return safely(() => ({ data: readWeights(storageKey), error: null }));
        },

        add(kg) {
            return safely(() => {
                const value = Number(kg);
                if (!Number.isFinite(value) || value <= 0 || value > 500) {
                    return { data: null, error: { code: 'INVALID_PAYLOAD', message: '请输入有效的体重' } };
                }
                const now = Date.now();
                const entry = {
                    ts: now,
                    date: formatDate(new Date(now)),
                    kg: Math.round(value * 10) / 10,
                };
                const items = readWeights(storageKey);
                items.unshift(entry);
                wx.setStorageSync(storageKey, items);
                return { data: entry, error: null };
            });
        },
    };
}

function createWaterStore(options) {
    const config = options || {};
    if (typeof config.storageKey !== 'string' || config.storageKey.trim() === '') {
        throw new TypeError('storageKey 不能为空');
    }
    const storageKey = config.storageKey;

    return {
        // 返回 { total, entries }：今日总饮水与明细。
        getToday() {
            return this.getByDate(formatDate(new Date()));
        },
        // 指定日期的饮水汇总与明细。
        getByDate(date) {
            return safely(() => {
                const target = isDateString(date) ? date : formatDate(new Date());
                const entries = readEntries(storageKey).filter(item => item.date === target);
                let total = 0;
                for (let i = 0; i < entries.length; i += 1) {
                    total += entries[i].ml;
                }
                return { data: { date: target, total: total, entries: entries }, error: null };
            });
        },

        // 取最近 days 天的总量（含今天），用于周统计。
        getRecent(days) {
            return safely(() => {
                const span = Number.isInteger(days) && days > 0 ? days : 7;
                const targets = [];
                const now = new Date();
                for (let i = 0; i < span; i += 1) {
                    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                    targets.push(formatDate(d));
                }
                const entries = readEntries(storageKey);
                const result = targets.map(date => {
                    const dayEntries = entries.filter(item => item.date === date);
                    let total = 0;
                    for (let i = 0; i < dayEntries.length; i += 1) {
                        total += dayEntries[i].ml;
                    }
                    return { date: date, total: total, entries: dayEntries };
                });
                return { data: result, error: null };
            });
        },

        add(ml) {
            return safely(() => {
                const value = Number(ml);
                if (!Number.isFinite(value) || value <= 0) {
                    return { data: null, error: { code: 'INVALID_PAYLOAD', message: '饮水量无效' } };
                }
                if (value > 5000) {
                    return { data: null, error: { code: 'INVALID_PAYLOAD', message: '单次饮水不能超过 5000ml' } };
                }
                let now = Date.now();
                const items = readEntries(storageKey);
                // 保证 ts 唯一，作为删除时的定位键。
                while (items.some(item => item.ts === now)) {
                    now += 1;
                }
                const entry = {
                    ts: now,
                    date: formatDate(new Date(now)),
                    ml: Math.round(value),
                };
                items.unshift(entry);
                if (items.length > 2000) {
                    items.length = 2000;
                }
                wx.setStorageSync(storageKey, items);
                return { data: entry, error: null };
            });
        },

        // 按 ts 删除一条记录。
        remove(ts) {
            return safely(() => {
                const key = Number(ts);
                const items = readEntries(storageKey);
                const index = items.findIndex(item => item.ts === key);
                if (index === -1) {
                    return { data: { removed: false }, error: null };
                }
                items.splice(index, 1);
                wx.setStorageSync(storageKey, items);
                return { data: { removed: true }, error: null };
            });
        },

        // 清空今日全部饮水记录。
        clearToday() {
            return safely(() => {
                const today = formatDate(new Date());
                const items = readEntries(storageKey).filter(item => item.date !== today);
                wx.setStorageSync(storageKey, items);
                return { data: { cleared: true }, error: null };
            });
        },

        removeLast() {
            return safely(() => {
                const today = formatDate(new Date());
                const items = readEntries(storageKey);
                for (let i = 0; i < items.length; i += 1) {
                    if (items[i].date === today) {
                        items.splice(i, 1);
                        wx.setStorageSync(storageKey, items);
                        return { data: { removed: true }, error: null };
                    }
                }
                return { data: { removed: false }, error: null };
            });
        },
    };
}

function safely(executor) {
    return Promise.resolve()
        .then(executor)
        .catch(error => ({ data: null, error: { code: 'CLIENT_EXCEPTION', message: error && error.message ? error.message : '' } }));
}

function readWeights(storageKey) {
    const value = wx.getStorageSync(storageKey);
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(item => item !== null && typeof item === 'object' && typeof item.kg === 'number')
        .sort((left, right) => right.ts - left.ts)
        .map(item => ({ ts: item.ts, date: item.date, kg: item.kg }));
}

function readEntries(storageKey) {
    const value = wx.getStorageSync(storageKey);
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(item => item !== null && typeof item === 'object' && typeof item.ml === 'number')
        .sort((left, right) => right.ts - left.ts);
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function isDateString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

module.exports = {
    createWeightStore,
    createWaterStore,
};
