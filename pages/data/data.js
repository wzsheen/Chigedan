const {withTheme}=require('../../utils/theme');
const { createRecordStore, formatDate } = require('../../utils/record-store.js');
const { createWeightStore } = require('../../utils/body-store.js');
const settings = require('../../utils/settings.js');
const importer = require('../../utils/importer.js');
const configBackup=require('../../utils/config-backup');

const store = createRecordStore({ storageKey: 'cal_records' });
const weightStore = createWeightStore({ storageKey: 'cal_weight' });

const MEAL_LABELS = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '加餐',
};

const CLEAR_KEYS = [
    'cal_records',
    'cal_weight',
    'cal_body_measurements',
    'cal_water',
    'cal_goal',
    'cal_profile',
    'cal_macro_targets',
    'cal_water_goal',
    'cal_foods',
];

Page(withTheme({
    data: {
        recordCount: 0,
        weightCount: 0,
        waterCount: 0,
        storageText: '—',
        exportHint: '',
        jsonBusy: false,
        jsonHint: '',
        confirmClear: false,
        busy: false,
        fallbackText: '',
        showFallback: false,
        importText: '',
        importMode: 'merge',
        importSummary: null,
        importError: '',
        importHint: '',
    },

    onShow() {
        this.refresh();
    },

    onUnload() {
        this.clearCountdown();
    },

    refresh() {
        const that = this;
        this.setData({ confirmClear: false, exportHint: '', fallbackText: '', showFallback: false, jsonHint: '' });
        return Promise.all([store.list(), weightStore.list()]).then(([recordRes, weightRes]) => {
            const records = recordRes.error ? [] : recordRes.data;
            const weights = weightRes.error ? [] : weightRes.data;
            let water = [];
            try {
                const raw = wx.getStorageSync('cal_water');
                water = Array.isArray(raw) ? raw : [];
            } catch (err) {
                water = [];
            }
            that.setData({
                recordCount: records.length,
                weightCount: weights.length,
                waterCount: water.length,
                storageText: that.readStorageText(),
            });
        });
    },

    readStorageText() {
        try {
            const info = wx.getStorageInfoSync();
            const used = Number(info.currentSize);
            if (Number.isFinite(used)) {
                return used >= 1024
                    ? (used / 1024).toFixed(1) + ' MB'
                    : Math.max(used, 1) + ' KB';
            }
        } catch (err) {
            // 取不到就显示占位，不影响导出
        }
        return '—';
    },

    // 导出成可直接粘贴的纯文本，逐行一天一条
    buildExportText(records, weights, waters) {
        const lines = [];
        const goal = settings.getGoal();
        const profile = settings.getProfile() || {};
        lines.push('吃个蛋 · 数据导出');
        lines.push('导出时间：' + formatDate(new Date()));
        lines.push('每日目标：' + goal + ' kcal');
        if (profile && Number(profile.height) > 0) {
            lines.push('身体档案：' + (profile.sex === 'male' ? '男' : '女')
                + ' · ' + (Number(profile.age) > 0 ? Number(profile.age) + ' 岁' : '年龄未填')
                + ' · ' + Number(profile.height) + ' cm');
        }
        lines.push('');

        lines.push('【饮食记录】共 ' + records.length + ' 条');
        const sorted = records.slice().sort((left, right) => {
            if (left.date === right.date) {
                return Number(right.ts || 0) - Number(left.ts || 0);
            }
            return String(right.date).localeCompare(String(left.date));
        });
        for (let i = 0; i < sorted.length; i += 1) {
            const item = sorted[i];
            const parts = [];
            parts.push(item.date || '未记日期');
            parts.push(MEAL_LABELS[item.meal] || '用餐');
            parts.push(item.name || '未命名');
            parts.push(Math.round(Number(item.kcal) || 0) + ' kcal');
            const macro = [];
            if (Number(item.carb) > 0) {
                macro.push('碳水 ' + Number(item.carb) + 'g');
            }
            if (Number(item.protein) > 0) {
                macro.push('蛋白 ' + Number(item.protein) + 'g');
            }
            if (Number(item.fat) > 0) {
                macro.push('脂肪 ' + Number(item.fat) + 'g');
            }
            if (macro.length > 0) {
                parts.push(macro.join(' / '));
            }
            lines.push(parts.join(' | '));
        }
        lines.push('');

        const measurements=require('../../utils/body-measurements').sanitize(this.readArray('cal_body_measurements'));
        lines.push('【身体测量】共 '+measurements.length+' 条（日期 | kg | 身高cm | 腰围cm | 臀围cm）');
        for(const row of measurements)lines.push([row.date,...['kg','heightCm','waistCm','hipCm'].map(key=>row[key]===undefined?'—':row[key])].join(' | '));
        lines.push('');
        lines.push('【体重记录】共 ' + weights.length + ' 条');
        const sortedWeight = weights.slice().sort((left, right) => String(right.date).localeCompare(String(left.date)));
        for (let i = 0; i < sortedWeight.length; i += 1) {
            lines.push(sortedWeight[i].date + ' | ' + Number(sortedWeight[i].kg).toFixed(1) + ' kg');
        }
        lines.push('');

        const waterByDate = {};
        for (let i = 0; i < waters.length; i += 1) {
            const item = waters[i] || {};
            const date = item.date || formatDate(new Date(Number(item.ts) || Date.now()));
            waterByDate[date] = (waterByDate[date] || 0) + (Number(item.ml) || 0);
        }
        const waterDates = Object.keys(waterByDate).sort((left, right) => right.localeCompare(left));
        lines.push('【饮水记录】共 ' + waterDates.length + ' 天');
        for (let i = 0; i < waterDates.length; i += 1) {
            lines.push(waterDates[i] + ' | ' + waterByDate[waterDates[i]] + ' ml');
        }
        lines.push('');
        lines.push('用户配置：'+JSON.stringify({configuration:configBackup.collect(),goal,waterGoal:settings.getWaterGoal(),profile:importer.parseProfile(profile),macroTargets:importer.parseMacroTargets(settings.getMacroTargets())}));
        lines.push('（数据来自本机存储，吃个蛋未上传任何内容）');
        return lines.join('\n');
    },

    // 从聊天记录里挑一个 .json 备份文件
    handleChooseFile() {
        const that = this;
        if (typeof wx.chooseMessageFile !== 'function') {
            this.setData({ importError: '当前环境不支持选文件，把 JSON 内容粘贴到下面一样可以导入' });
            return;
        }
        wx.chooseMessageFile({
            count: 1,
            type: 'file',
            extension: ['json', 'txt'],
            success(res) {
                const file = res && res.tempFiles && res.tempFiles[0];
                if (!file || !file.path) {
                    that.setData({ importError: '没读到文件，再选一次试试' });
                    return;
                }
                that.readImportFile(file.path);
            },
            fail(err) {
                const message = err && err.errMsg ? String(err.errMsg) : '';
                if (message.indexOf('cancel') !== -1) {
                    return;
                }
                that.setData({ importError: '选文件失败，可把 JSON 内容粘贴到下面' });
            },
        });
    },

    readImportFile(filePath) {
        const that = this;
        wx.getFileSystemManager().readFile({
            filePath: filePath,
            encoding: 'utf8',
            success(res) {
                const text = typeof res.data === 'string' ? res.data : '';
                if (text.trim() === '') {
                    that.setData({ importError: '文件是空的' });
                    return;
                }
                that.setData({ importText: text, importError: '', importHint: '' });
                that.parsePreview(text);
            },
            fail() {
                that.setData({ importError: '读不到文件内容，换个文件试试' });
            },
        });
    },

    handleImportInput(event) {
        this.setData({
            importText: event.detail.value,
            importError: '',
            importSummary: null,
            importHint: '',
        });
        this.importCandidate = null;
    },

    handleMode(event) {
        const mode = event.currentTarget.dataset.key === 'replace' ? 'replace' : 'merge';
        this.setData({ importMode: mode });
    },

    handleReadClipboard() {
        const that = this;
        wx.getClipboardData({
            success(res) {
                const text = res && typeof res.data === 'string' ? res.data : '';
                if (text.trim() === '') {
                    that.setData({ importError: '剪贴板是空的，先复制导出的文本' });
                    return;
                }
                that.setData({ importText: text });
                that.parsePreview(text);
            },
            fail() {
                that.setData({ importError: '当前环境读不到剪贴板，把文本粘贴到下面的框里再点解析' });
            },
        });
    },

    handleParseImport() {
        this.parsePreview(this.data.importText);
    },

    parsePreview(text) {
        const parsed = importer.parseImport(text);
        if (parsed.error) {
            this.importCandidate = null;
            this.setData({ importError: parsed.error, importSummary: null });
            return;
        }
        const total = parsed.records.length + parsed.weights.length + parsed.waters.length + (parsed.foods || []).length + (parsed.measurements || []).length;
        if (total === 0 && !parsed.goal && !parsed.profile && !parsed.waterGoal && !Object.keys(parsed.configuration||{}).length) {
            this.importCandidate = null;
            this.setData({
                importError: '没认出可导入的记录，确认是否为本小程序导出的文本',
                importSummary: null,
            });
            return;
        }
        this.importCandidate = parsed;
        this.setData({
            importError: '',
            importHint: '',
            importSummary: {
                configurationCount:Object.keys(parsed.configuration||{}).length,
                foodCount: (parsed.foods || []).length,
                recordCount: parsed.records.length,
                weightCount: parsed.weights.length,measurementCount:(parsed.measurements || []).length,
                waterCount: parsed.waters.length,
                skipped: parsed.skipped,
                sourceText: parsed.source === 'json' ? 'JSON' : '导出文本',
                goalText: parsed.goal ? String(parsed.goal) + ' kcal' : '',
            },
        });
    },

    handleCancelImport() {
        this.importCandidate = null;
        this.setData({ importSummary: null, importError: '', importHint: '' });
    },

    handleConfirmImport() {
        const parsed = this.importCandidate;
        if (!parsed) {
            this.setData({ importSummary: null });
            return;
        }
        const replace = this.data.importMode === 'replace';
        let counts;
        try{counts=this.writeImport(parsed,replace);}catch(error){this.setData({importError:'导入失败，已尝试恢复原数据，请重试'});return;}
        this.importCandidate = null;
        const detail = '饮食 ' + counts.records + ' 条 · 体重 ' + counts.weights + ' 条 · 身体测量 '+(counts.measurements || 0)+' 条 · 饮水 ' + counts.waters + ' 天';
        this.setData({
            importSummary: null,
            importText: '',
            importError: '',
            importHint: (replace ? '已覆盖导入：' : '已合并导入：') + detail,
        });
        wx.showToast({ title: '导入完成', icon: 'success' });
        this.refresh();
    },

    readArray(key) {
        try {
            const raw = wx.getStorageSync(key);
            return Array.isArray(raw) ? raw : [];
        } catch (err) {
            return [];
        }
    },

    // 合并：跳过已存在的同日同期数据；覆盖：先清空再写入导入内容。
    writeImport(parsed, replace) {
        const keys=[...new Set(CLEAR_KEYS.concat(configBackup.STORAGE_KEYS))],before={};
        for(const key of keys)before[key]=wx.getStorageSync(key);
        try{return this.writeImportValues(parsed,replace);}catch(error){
            for(const key of keys){try{if(before[key]===undefined||before[key]==='')wx.removeStorageSync(key);else wx.setStorageSync(key,before[key]);}catch(ignored){}}
            throw error;
        }
    },
    writeImportValues(parsed, replace) {
        const now = Date.now();

        const existingRecords = replace ? [] : this.readArray('cal_records');
        const seenRecords = {};
        for (let i = 0; i < existingRecords.length; i += 1) {
            const item = existingRecords[i];
            seenRecords[[item.date, item.meal, item.name, Math.round(Number(item.kcal) || 0), item.qty].join('|')] = true;
        }
        const newRecords = [];
        for (let i = 0; i < parsed.records.length; i += 1) {
            const item = parsed.records[i];
            const key = [item.date, item.meal, item.name, item.kcal, item.qty].join('|');
            if (seenRecords[key]) {
                continue;
            }
            seenRecords[key] = true;
            newRecords.push({
                id: 'imp' + now + '_' + i,
                date: item.date,
                meal: item.meal,
                nutritionStatus: item.nutritionStatus,
                timeKnown: item.timeKnown,
                name: item.name,
                kcal: item.kcal,
                protein: item.protein,
                carb: item.carb,
                fat: item.fat,
                unit: item.unit,
                qty: item.qty,
                note: item.note,
                createdAt: now + i,
                updatedAt: now + i,
            });
        }
        const records = existingRecords.concat(newRecords).sort((left, right) => {
            if (left.date === right.date) {
                return Number(right.createdAt || 0) - Number(left.createdAt || 0);
            }
            return String(right.date).localeCompare(String(left.date));
        });
        wx.setStorageSync('cal_records', records);
        const foodRows=replace ? [] : require('../../utils/personal-foods').sanitize(this.readArray('cal_foods'));
        for(const row of (parsed.foods || [])){if(!foodRows.some(old=>old.name===row.name && old.unit===row.unit))foodRows.push(row);}
        wx.setStorageSync('cal_foods',foodRows.slice(0,500));

        const existingWeights = replace ? [] : this.readArray('cal_weight');
        const seenWeightDates = {};
        for (let i = 0; i < existingWeights.length; i += 1) {
            seenWeightDates[existingWeights[i].date] = true;
        }
        const newWeights = [];
        for (let i = 0; i < parsed.weights.length; i += 1) {
            const item = parsed.weights[i];
            if (seenWeightDates[item.date]) {
                continue;
            }
            seenWeightDates[item.date] = true;
            newWeights.push({
                ts: Date.parse(item.date + 'T08:00:00') || (now + i),
                date: item.date,
                kg: item.kg,
            });
        }
        const weights = existingWeights.concat(newWeights).sort((left, right) => String(right.date).localeCompare(String(left.date)));
        wx.setStorageSync('cal_weight', weights);
        const body=require('../../utils/body-measurements'),existingMeasurements=replace?[]:body.sanitize(this.readArray(body.KEY));
        const signature=row=>[row.date,row.kg,row.heightCm,row.waistCm,row.hipCm].join('|'),seenMeasurements=new Set(existingMeasurements.map(signature));
        const newMeasurements=[];
        for(const row of body.sanitize(parsed.measurements)){if(seenMeasurements.has(signature(row)))continue;seenMeasurements.add(signature(row));newMeasurements.push(row);}
        const measurements=existingMeasurements.concat(newMeasurements).sort((a,b)=>b.ts-a.ts);wx.setStorageSync(body.KEY,measurements);
        for(const row of newMeasurements)if(row.kg && !weights.some(item=>item.date===row.date && item.kg===row.kg))weights.push({ts:row.ts,date:row.date,kg:row.kg});
        wx.setStorageSync('cal_weight',weights.sort((a,b)=>b.ts-a.ts));


        const existingWater = replace ? [] : this.readArray('cal_water');
        const seenWaterDates = {};
        for (let i = 0; i < existingWater.length; i += 1) {
            seenWaterDates[existingWater[i].date] = true;
        }
        const newWater = [];
        for (let i = 0; i < parsed.waters.length; i += 1) {
            const item = parsed.waters[i];
            if (seenWaterDates[item.date]) {
                continue;
            }
            seenWaterDates[item.date] = true;
            newWater.push({
                ts: (Date.parse(item.date + 'T08:00:00') || now) + i,
                date: item.date,
                ml: item.ml,
            });
        }
        const water = existingWater.concat(newWater).sort((left, right) => Number(right.ts) - Number(left.ts));
        wx.setStorageSync('cal_water', water);

        // 目标与档案只在覆盖模式下同步，合并时保留当前设置。
        if (replace) {
            if(parsed.configuration)configBackup.apply(parsed.configuration);
            if (Number(parsed.goal) > 0) {
                settings.setGoal(parsed.goal);
            }
            if (parsed.profile) {
                const current = settings.getProfile() || {};
                settings.setProfile(Object.assign({}, current, parsed.profile));
            }
            if (parsed.macroTargets) {
                const currentMacro = settings.getMacroTargets() || {};
                settings.setMacroTargets(Object.assign({}, currentMacro, parsed.macroTargets));
            }
            if (Number(parsed.waterGoal) > 0) {
                settings.setWaterGoal(parsed.waterGoal);
            }
        }

        const profile=settings.getProfile() || {},filled=Object.assign({},profile);
        const latestHeight=measurements.find(row=>row.heightCm),latestWeight=weights.slice().sort((a,b)=>b.ts-a.ts)[0];
        if(!Number(profile.height) && latestHeight)filled.height=latestHeight.heightCm;
        if(!Number(profile.weight) && latestWeight)filled.weight=latestWeight.kg;
        if(JSON.stringify(filled)!==JSON.stringify(profile))settings.setProfile(filled);
        return {
            measurements:newMeasurements.length,
            records: newRecords.length,
            weights: newWeights.length,
            waters: newWater.length,
        };
    },

    handleExport() {
        if (this.data.busy) {
            return;
        }
        const that = this;
        this.setData({ busy: true, exportHint: '' });
        Promise.all([store.list(), weightStore.list()]).then(([recordRes, weightRes]) => {
            const records = recordRes.error ? [] : recordRes.data;
            const weights = weightRes.error ? [] : weightRes.data;
            let waters = [];
            try {
                const raw = wx.getStorageSync('cal_water');
                waters = Array.isArray(raw) ? raw : [];
            } catch (err) {
                waters = [];
            }
            // Settings can be backed up without any meal or body records.
            const text = that.buildExportText(records, weights, waters);
            that.setData({ busy: false, fallbackText: text });
            wx.setClipboardData({
                data: text,
                success() {
                    that.setData({ exportHint: '已复制到剪贴板，可粘贴到备忘录或表格' });
                },
                fail() {
                    that.setData({ showFallback: true, exportHint: '当前环境无法访问剪贴板，可长按下方文本手动复制' });
                },
            });
        });
    },

    // 完整备份：记录 + 目标 + 档案 + 单位，能原样导回
    buildExportJson(records, weights, waters) {
        const profile = settings.getProfile();
        const macroTargets = settings.getMacroTargets();

        const sortedRecords = records.slice().sort((left, right) => {
            if (left.date === right.date) {
                return Number(right.createdAt || 0) - Number(left.createdAt || 0);
            }
            return String(right.date).localeCompare(String(left.date));
        });
        const waterByDate = this.groupWater(waters);
        const waterDates = Object.keys(waterByDate).sort((left, right) => right.localeCompare(left));
        const payload = {
            app: 'calorie-tracker',
            version: 3,
            configuration:configBackup.collect(),
            measurements:require('../../utils/body-measurements').sanitize(this.readArray('cal_body_measurements')),
            foods: require('../../utils/personal-foods').sanitize(this.readArray('cal_foods')),
            exportedAt: formatDate(new Date()),
            unit: 'kcal/kg',
            goal: settings.getGoal(),
            waterGoal: settings.getWaterGoal(),
            nickname: settings.getNickname(),
            profile: importer.parseProfile(profile),
            macroTargets: importer.parseMacroTargets(macroTargets),
            counts: {
                records: records.length,
                weights: weights.length,
                measurements:require('../../utils/body-measurements').sanitize(this.readArray('cal_body_measurements')).length,
                waterDays: waterDates.length,
            },
            records: sortedRecords.map(item => ({
                date: item.date,
                meal: item.meal,
                nutritionStatus: item.nutritionStatus,
                timeKnown: item.timeKnown,
                name: item.name,
                kcal: Math.round(Number(item.kcal) || 0),
                protein: item.protein === null ? null : Number(item.protein) || 0,
                carb: item.carb === null ? null : Number(item.carb) || 0,
                fat: item.fat === null ? null : Number(item.fat) || 0,
                unit: typeof item.unit === 'string' ? item.unit : '',
                qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
                note: typeof item.note === 'string' ? item.note : '',
            })),
            weights: weights
                .slice()
                .sort((left, right) => String(right.date).localeCompare(String(left.date)))
                .map(item => ({ date: item.date, kg: Math.round(Number(item.kg) * 10) / 10 })),
            waters: waterDates.map(date => ({ date: date, ml: waterByDate[date] })),
        };
        return JSON.stringify(payload, null, 2);
    },

    groupWater(waters) {
        const map = {};
        const list = Array.isArray(waters) ? waters : [];
        for (let i = 0; i < list.length; i += 1) {
            const item = list[i] || {};
            const date = item.date || formatDate(new Date(Number(item.ts) || Date.now()));
            map[date] = (map[date] || 0) + (Number(item.ml) || 0);
        }
        return map;
    },

    handleExportJson() {
        if (this.data.jsonBusy) {
            return;
        }
        const that = this;
        this.setData({ jsonBusy: true, jsonHint: '', showFallback: false });
        Promise.all([store.list(), weightStore.list()]).then(([recordRes, weightRes]) => {
            const records = recordRes.error ? [] : recordRes.data;
            const weights = weightRes.error ? [] : weightRes.data;
            let waters = [];
            try {
                const raw = wx.getStorageSync('cal_water');
                waters = Array.isArray(raw) ? raw : [];
            } catch (err) {
                waters = [];
            }
            // Settings can be backed up without any meal or body records.
            const text = that.buildExportJson(records, weights, waters);
            that.setData({ jsonBusy: false });
            that.writeAndShareJson(text);
        });
    },

    writeAndShareJson(text) {
        const that = this;
        const stamp = formatDate(new Date()).replace(/-/g, '');
        const fileName = 'calorie-backup-' + stamp + '.json';
        let filePath = '';
        try {
            const fs = wx.getFileSystemManager();
            filePath = wx.env.USER_DATA_PATH + '/' + fileName;
            fs.writeFileSync(filePath, text, 'utf8');
        } catch (err) {
            that.copyJsonText(text, '生成文件失败');
            return;
        }

        // 电脑版微信可以选目录直接存盘
        if (typeof wx.saveFileToDisk === 'function') {
            wx.saveFileToDisk({
                filePath: filePath,
                success() {
                    that.setData({ jsonHint: '已保存到电脑：' + fileName });
                },
                fail() {
                    that.shareJsonFile(filePath, fileName, text);
                },
            });
            return;
        }
        this.shareJsonFile(filePath, fileName, text);
    },

    // 手机端：发到聊天（文件传输助手）即可长期保存
    shareJsonFile(filePath, fileName, text) {
        const that = this;
        if (typeof wx.shareFileMessage === 'function') {
            wx.shareFileMessage({
                filePath: filePath,
                fileName: fileName,
                success() {
                    that.setData({ jsonHint: '已发出，在聊天里点开即可存到手机' });
                },
                fail() {
                    that.copyJsonText(text, '当前环境不能直接存文件');
                },
            });
            return;
        }
        this.copyJsonText(text, '当前环境不能直接存文件');
    },

    copyJsonText(text, reason) {
        const that = this;
        wx.setClipboardData({
            data: text,
            success() {
                that.setData({ jsonHint: reason + '，JSON 已复制到剪贴板' });
            },
            fail() {
                that.setData({
                    jsonHint: reason + '，可长按下方文本手动复制',
                    showFallback: true,
                    fallbackText: text,
                });
            },
        });
    },

    handleClear() {
        if (!this.data.confirmClear) {
            this.setData({ confirmClear: true, exportHint: '' });
            const that = this;
            this.clearTimer = setTimeout(() => {
                that.clearTimer = null;
                that.setData({ confirmClear: false });
            }, 4000);
            return;
        }
        this.clearCountdown();
        for (let i = 0; i < CLEAR_KEYS.length; i += 1) {
            try {
                wx.removeStorageSync(CLEAR_KEYS[i]);
            } catch (err) {
                // 单个 key 删除失败不影响其它
            }
        }
        this.setData({ confirmClear: false, exportHint: '数据已清空' });
        wx.showToast({ title: '已清空', icon: 'none' });
        this.refresh();
    },

    clearCountdown() {
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
            this.clearTimer = null;
        }
    },
}));
