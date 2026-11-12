// 导入解析：把「数据管理」导出的纯文本（或 JSON）还原成结构化数据。
// 纯函数，不碰存储，便于单独校验；写入交给页面。

const KCAL_TO_KJ = 4.184;
const KG_TO_LB = 2.20462;

const MEAL_BY_LABEL = {
    '早餐': 'breakfast',
    '午餐': 'lunch',
    '晚餐': 'dinner',
    '加餐': 'snack',
};

function isDate(text) {
    return typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text);
}

// 从「230 kcal」「962 kJ」这类串里取回 kcal
function readEnergy(text) {
    const raw = String(text || '');
    const match = raw.match(/-?\d+(\.\d+)?/);
    if (!match) {
        return null;
    }
    const value = Number(match[0]);
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    if (/kj/i.test(raw)) {
        return Math.round(value / KCAL_TO_KJ);
    }
    return Math.round(value);
}

// 从「70.0 kg」「140.0 斤」「154.3 lb」里取回 kg
function readWeight(text) {
    const raw = String(text || '');
    const match = raw.match(/\d+(\.\d+)?/);
    if (!match) {
        return null;
    }
    const value = Number(match[0]);
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    if (/斤/.test(raw)) {
        return value / 2;
    }
    if (/lb|磅/i.test(raw)) {
        return value / KG_TO_LB;
    }
    return value;
}

function readWater(text) {
    const raw = String(text || '');
    const match = raw.match(/\d+(\.\d+)?/);
    if (!match) {
        return null;
    }
    const value = Number(match[0]);
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    return Math.round(value);
}

function parseMacro(text) {
    const out = { carb: 0, protein: 0, fat: 0 };
    const raw = String(text || '');
    const patterns = [
        { key: 'carb', re: /碳水\s*(\d+(\.\d+)?)/ },
        { key: 'protein', re: /蛋白\s*(\d+(\.\d+)?)/ },
        { key: 'fat', re: /脂肪\s*(\d+(\.\d+)?)/ },
    ];
    for (let i = 0; i < patterns.length; i += 1) {
        const match = raw.match(patterns[i].re);
        if (match) {
            out[patterns[i].key] = Number(match[1]);
        }
    }
    return out;
}

function emptyResult(source) {
    return {
        source: source || 'none',
        goal: null,
        waterGoal: null,
        profile: null,
        macroTargets: null,
        records: [],
        weights: [],
        measurements: [],
        waters: [],
        skipped: 0,
        error: '',
    };
}

const ACTIVITY_KEYS = ['sedentary', 'light', 'moderate', 'high'];
const GOAL_TYPE_KEYS = ['lose', 'keep', 'gain'];

// JSON 里的档案：字段缺失就跳过，不猜
function parseProfile(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const out = {};
    if (raw.sex === 'male' || raw.sex === 'female') {
        out.sex = raw.sex;
    }
    const age = Number(raw.age);
    if (Number.isFinite(age) && age > 0 && age < 130) {
        out.age = Math.round(age);
    }
    const height = Number(raw.height);
    if (Number.isFinite(height) && height > 0) {
        out.height = Math.round(height*10000)/10000;
    }
    const weight = readWeight(String(raw.weight || ''));
    if (weight !== null) {
        out.weight = Math.round(weight * 10) / 10;
    }
    if (ACTIVITY_KEYS.indexOf(raw.activity) !== -1) {
        out.activity = raw.activity;
    }
    if (GOAL_TYPE_KEYS.indexOf(raw.goalType) !== -1) {
        out.goalType = raw.goalType;
    }
    return Object.keys(out).length > 0 ? out : null;
}

function parseMacroTargets(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const out = {};
    const keys = ['protein', 'carb', 'fat'];
    for (let i = 0; i < keys.length; i += 1) {
        const value = Number(raw[keys[i]]);
        if (Number.isFinite(value) && value > 0) {
            out[keys[i]] = Math.round(value);
        }
    }
    return Object.keys(out).length > 0 ? out : null;
}

function parseJson(text) {
    const result = emptyResult('json');
    let payload = null;
    try {
        payload = JSON.parse(text);
    } catch (err) {
        result.error = 'JSON 格式不正确';
        return result;
    }

    if (!payload || typeof payload !== 'object') {result.error='备份内容无效';return result;}
    result.foods=require('./personal-foods').sanitize(payload.foods);
    result.configuration=require('./config-backup').sanitize(payload.configuration);
    if(typeof payload.nickname==='string'&&!Object.prototype.hasOwnProperty.call(result.configuration,'cal_nickname'))result.configuration.cal_nickname=payload.nickname.trim().slice(0,12);
    const records = Array.isArray(payload) ? payload : (Array.isArray(payload.records) ? payload.records : []);
    for (let i = 0; i < records.length; i += 1) {
        const item = records[i] || {};
        const date = String(item.date || '');
        const name = String(item.name || '').trim();
        const kcal = readEnergy(String(item.kcal || ''));
        if (!isDate(date) || name === '' || kcal === null) {
            result.skipped += 1;
            continue;
        }
        result.records.push({
            date: date,
            meal: MEAL_BY_LABEL[item.meal] || (['breakfast', 'lunch', 'dinner', 'snack'].indexOf(item.meal) !== -1 ? item.meal : 'snack'),
            nutritionStatus: item.nutritionStatus === 'incomplete' ? 'incomplete' : 'estimated',
            timeKnown: item.timeKnown !== false,
            name: name,
            kcal: kcal,
            protein: item.protein === null ? null : Number(item.protein) || 0,
            carb: item.carb === null ? null : Number(item.carb) || 0,
            fat: item.fat === null ? null : Number(item.fat) || 0,
            qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
            unit: typeof item.unit === 'string' ? item.unit : '',
            note: typeof item.note === 'string' ? item.note : '',
        });
    }

    const weights = Array.isArray(payload.weights) ? payload.weights : [];
    for (let i = 0; i < weights.length; i += 1) {
        const item = weights[i] || {};
        const date = String(item.date || '');
        const kg = readWeight(String(item.kg || ''));
        if (!isDate(date) || kg === null) {
            result.skipped += 1;
            continue;
        }
        result.weights.push({ date: date, kg: Math.round(kg * 10) / 10 });
    }

    result.measurements=require('./body-measurements').sanitize(payload.measurements);
    const waters = Array.isArray(payload.waters) ? payload.waters : [];
    for (let i = 0; i < waters.length; i += 1) {
        const item = waters[i] || {};
        const date = String(item.date || '');
        const ml = readWater(String(item.ml || ''));
        if (!isDate(date) || ml === null) {
            result.skipped += 1;
            continue;
        }
        result.waters.push({ date: date, ml: ml });
    }

    if (payload && typeof payload === 'object') {
        const goal = readEnergy(String(payload.goal || ''));
        if (goal !== null) {
            result.goal = goal;
        }
        const waterGoal = readWater(String(payload.waterGoal || ''));
        if (waterGoal !== null) {
            result.waterGoal = waterGoal;
        }
        result.profile = parseProfile(payload.profile);
        result.macroTargets = parseMacroTargets(payload.macroTargets);
    }
    return result;
}

function parseText(text) {
    const result = emptyResult('text');
    const lines = text.split(/\r?\n/);
    let section = '';

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (line === '') {
            continue;
        }

        if(line.startsWith('用户配置：')){const config=parseJson(line.slice(5));if(!config.error){result.configuration=config.configuration;result.goal=config.goal;result.waterGoal=config.waterGoal;result.profile=config.profile;result.macroTargets=config.macroTargets;}continue;}
        // 标题、导出时间与结尾说明不是数据行，直接跳过
        if (/^[（(]/.test(line) || line.indexOf('数据导出') !== -1 || /^导出时间/.test(line)) {
            continue;
        }

        const sectionMatch = line.match(/^【(.+?)】/);
        if (sectionMatch) {
            const name = sectionMatch[1];
            if (name.indexOf('饮食') !== -1) {
                section = 'record';
            } else if(name.indexOf('身体测量')!==-1){
                section='measurements';
            } else if (name.indexOf('体重') !== -1) {
                section = 'weight';
            } else if (name.indexOf('饮水') !== -1) {
                section = 'water';
            } else {
                section = '';
            }
            continue;
        }

        const goalMatch = line.match(/^每日目标[:：]\s*(.+)$/);
        if (goalMatch) {
            const goal = readEnergy(goalMatch[1]);
            if (goal !== null) {
                result.goal = goal;
            }
            continue;
        }

        const profileMatch = line.match(/^身体档案[:：]\s*(.+)$/);
        if (profileMatch) {
            const raw = profileMatch[1];
            const profile = {};
            if (/男/.test(raw)) {
                profile.sex = 'male';
            } else if (/女/.test(raw)) {
                profile.sex = 'female';
            }
            const ageMatch = raw.match(/(\d+)\s*岁/);
            if (ageMatch) {
                profile.age = Number(ageMatch[1]);
            }
            const heightMatch = raw.match(/(\d+(\.\d+)?)\s*cm/);
            if (heightMatch) {
                profile.height = Math.round(Number(heightMatch[1]));
            }
            result.profile = profile;
            continue;
        }

        if (section === '') {
            continue;
        }

        const parts = line.split('|').map(part => part.trim());
        if (section === 'record') {
            if (parts.length < 4 || !isDate(parts[0])) {
                result.skipped += 1;
                continue;
            }
            const kcal = readEnergy(parts[3]);
            if (kcal === null) {
                result.skipped += 1;
                continue;
            }
            const macro = parseMacro(parts[4] || '');
            const mealKey = MEAL_BY_LABEL[parts[1]];
            result.records.push({
                date: parts[0],
                meal: mealKey || 'snack',
                name: parts[2],
                kcal: kcal,
                protein: macro.protein,
                carb: macro.carb,
                fat: macro.fat,
                qty: 1,
                unit: '',
                note: '',
            });
            continue;
        }

        if(section==='measurements'){
            const row={date:parts[0]};['kg','heightCm','waistCm','hipCm'].forEach((key,index)=>{if(parts[index+1] && parts[index+1]!=='—')row[key]=Number(parts[index+1]);});
            const clean=require('./body-measurements').sanitize([row]);if(clean.length)result.measurements.push(clean[0]);else result.skipped++;continue;
        }

        if (section === 'weight') {
            if (parts.length < 2 || !isDate(parts[0])) {
                result.skipped += 1;
                continue;
            }
            const kg = readWeight(parts[1]);
            if (kg === null) {
                result.skipped += 1;
                continue;
            }
            result.weights.push({ date: parts[0], kg: Math.round(kg * 10) / 10 });
            continue;
        }

        if (section === 'water') {
            if (parts.length < 2 || !isDate(parts[0])) {
                result.skipped += 1;
                continue;
            }
            const ml = readWater(parts[1]);
            if (ml === null) {
                result.skipped += 1;
                continue;
            }
            result.waters.push({ date: parts[0], ml: ml });
        }
    }

    return result;
}

function parseImport(text) {
    if (typeof text !== 'string' || text.trim() === '') {
        const empty = emptyResult('none');
        empty.error = '没有可解析的内容';
        return empty;
    }
    const trimmed = text.trim();
    if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
        return parseJson(trimmed);
    }
    return parseText(trimmed);
}

module.exports = {
    parseImport,parseProfile,parseMacroTargets,
    readEnergy,
    readWeight,
    isDate,
};
