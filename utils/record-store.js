// 记录数据层：本地存储静态实现，方法返回 { data, error }，不会 reject。
// 字段：id / date(YYYY-MM-DD) / meal(breakfast|lunch|dinner|snack) / name / kcal / note / createdAt / updatedAt
// batchId：一次「保存本餐」写入的多条记录共用同一个值，旧记录没有这个字段（空串），读取时按空串兜底。

const INVALID_PAYLOAD_ERROR = {
    code: 'INVALID_PAYLOAD',
    message: '请填写食物名称和卡路里',
};

const INVALID_ID_ERROR = {
    code: 'INVALID_ID',
    message: '缺少记录 id',
};

const NOT_FOUND_OR_FORBIDDEN_ERROR = {
    code: 'NOT_FOUND_OR_FORBIDDEN',
    message: '这条记录可能已被删除',
};

const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];

let idCounter = 0;

function createRecordStore(options) {
    const config = options || {};
    if (typeof config.storageKey !== 'string' || config.storageKey.trim() === '') {
        throw new TypeError('storageKey 不能为空');
    }
    const storageKey = config.storageKey;

    return {
        list(options) {
            return safely(() => ({ data: readRecords(storageKey, options), error: null }));
        },

        create(payload) {
            return safely(() => {
                const row = toCreateRow(payload);
                if (row === null) {
                    return { data: null, error: INVALID_PAYLOAD_ERROR };
                }

                const now = Date.now();
                const createdAt = toCreatedAt(row.createdAt) || now;
                const record = {
                    id: createItemId(now),
                    date: row.date,
                    meal: row.meal,
                    nutritionStatus: row.nutritionStatus,
                    timeKnown: row.timeKnown,
                    name: row.name,
                    kcal: row.kcal,
                    protein: row.protein,
                    carb: row.carb,
                    fat: row.fat,
                    unit: row.unit,
                    qty: row.qty,
                    note: row.note,
                    batchId: row.batchId,
                    voice: row.voice,
                    createdAt: createdAt,
                    updatedAt: now,
                };

                const items = readRecords(storageKey);
                items.unshift(record);
                writeRecords(storageKey, items);
                return { data: record, error: null };
            });
        },

        remove(id) {
            if (isInvalidId(id)) {
                return Promise.resolve({ data: null, error: INVALID_ID_ERROR });
            }
            return safely(() => {
                const recordId = String(id);
                const items = readRecords(storageKey);
                const filtered = items.filter(item => item.id !== recordId);
                const removed = items.length - filtered.length;
                if (removed === 0) {
                    return { data: null, error: NOT_FOUND_OR_FORBIDDEN_ERROR };
                }
                writeRecords(storageKey, filtered);
                return { data: { removed }, error: null };
            });
        },
    };
}

function safely(executor) {
    return Promise.resolve()
        .then(executor)
        .catch(error => ({ data: null, error: toClientException(error) }));
}

function toClientException(error) {
    const message = error && typeof error === 'object' && typeof error.message === 'string'
        ? error.message
        : '';
    return { code: 'CLIENT_EXCEPTION', message };
}

function toCreateRow(payload) {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    const kcal = Number(source.kcal);
    if (name === '' || !Number.isFinite(kcal) || kcal <= 0) {
        return null;
    }
    return {
        date: isValidDate(source.date) ? source.date : formatDate(new Date()),
        meal: MEAL_KEYS.indexOf(source.meal) !== -1 ? source.meal : 'snack',
        nutritionStatus: source.nutritionStatus === 'incomplete' ? 'incomplete' : 'estimated',
        timeKnown: source.timeKnown !== false,
        name: name,
        kcal: Math.round(kcal * 10) / 10,
        protein: toMacro(source.protein),
        carb: toMacro(source.carb),
        fat: toMacro(source.fat),
        unit: typeof source.unit === 'string' && source.unit.trim() !== '' ? source.unit.trim() : '份',
        qty: toQty(source.qty),
        note: typeof source.note === 'string' ? source.note.trim() : '',
        batchId: typeof source.batchId === 'string' ? source.batchId.trim() : '',
        // 记录时间：补记时用户可以指定当天某一刻；没传就是「现在」
        createdAt: toCreatedAt(source.createdAt),
        // 语音便签：长按中间按钮录的那段音频，一餐共用一条
        voice: typeof source.voice === 'string' && source.voice.trim() !== '' ? source.voice.trim() : '',
    };
}

// 只认当天的合法时间戳（毫秒）：传别的都回退到「现在」。
function toCreatedAt(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0 || num > Date.now()) {
        return null;
    }
    return Math.round(num);
}

function toQty(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        return 1;
    }
    return Math.round(num * 10) / 10;
}

function toMacro(value) {
    if (value === null) return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        return 0;
    }
    return Math.round(num * 10) / 10;
}

function isValidDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function readRecords(storageKey, options) {
    const value = wx.getStorageSync(storageKey);
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(isStoredRecord)
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(item => ({
            id: String(item.id),
            date: item.date,
            meal: item.meal,
            nutritionStatus: item.nutritionStatus,
            timeKnown: item.timeKnown,
            name: item.name,
            kcal: item.kcal,
            protein: storedMacro(item.protein, options),
            carb: storedMacro(item.carb, options),
            fat: storedMacro(item.fat, options),
            unit: typeof item.unit === 'string' && item.unit !== '' ? item.unit : '份',
            qty: typeof item.qty === 'number' && item.qty > 0 ? item.qty : 1,
            note: item.note,
            batchId: typeof item.batchId === 'string' ? item.batchId : '',
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        }));
}

function storedMacro(value, options) {
    if (options && options.preserveMissing) return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    return value === null ? null : typeof value === 'number' ? value : 0;
}

function writeRecords(storageKey, items) {
    wx.setStorageSync(storageKey, items);
}

function createItemId(timestamp) {
    idCounter = (idCounter + 1) % 1000000;
    return String(timestamp) + '-' + String(idCounter);
}

function isInvalidId(id) {
    if (typeof id === 'string') {
        return id.trim() === '';
    }
    if (typeof id === 'number') {
        return !Number.isFinite(id);
    }
    return true;
}

function isStoredRecord(item) {
    return item !== null
        && typeof item === 'object'
        && (typeof item.id === 'string' || typeof item.id === 'number')
        && typeof item.name === 'string'
        && typeof item.kcal === 'number';
}

module.exports = {
    createRecordStore,
    MEAL_KEYS,
    formatDate,
};
