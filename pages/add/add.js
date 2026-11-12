const {withTheme}=require('../../utils/theme');
const { createRecordStore, formatDate } = require('../../utils/record-store.js');
const { createFoodStore } = require('../../utils/food-store.js');
const foodDb = require('../../utils/food-db.js');
const units = require('../../utils/units.js');
const settings = require('../../utils/settings.js');
const recognizer = require('../../utils/photo-recognize.js');
const voiceRecognizer = require('../../utils/voice-recognize.js');
const voiceRecorder = require('../../utils/voice-note.js');
const advice = require('../../utils/advice.js');
const customUnits = require('../../utils/custom-units.js');
const mealCatalog = require('../../utils/meal-catalog');
function portionText(row) {
    const unit = row.unit || '份';
    const grams = row.weightBasis && row.weightBasis.gramsPerUnit || row.grams;
    return '1' + unit + (Number.isFinite(grams) && grams > 0 ? ' ≈ ' + formatMacro(grams) + ' g' : '');
}
function inputEnergy(kcal){const factor=units.getEnergyUnit()==='kj'?units.KCAL_TO_KJ:1;return String(Math.round(Number(kcal)*factor*10000)/10000);}


const MEAL_OPTIONS = [
    { key: 'breakfast', label: '早餐' },
    { key: 'lunch', label: '午餐' },
    { key: 'dinner', label: '晚餐' },
    { key: 'snack', label: '加餐' },
];

const UNIT_OPTIONS = customUnits.DEFAULTS;

// 键盘面板可编辑的数字字段：maxLen 限位，macro 标记走营养素手动逻辑
const KEYPAD_FIELDS = {
    formQty: { maxLen: 4, macro: false },
    formGramsPerUnit:{maxLen:5,macro:false},
    formKcal: { maxLen: 6, macro: false },
    formCarb: { maxLen: 5, macro: true },
    formProtein: { maxLen: 5, macro: true },
    formFat: { maxLen: 5, macro: true },
};

function isValidDay(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// chip 上的日期说人话：今天 / 昨天 / X月X日（跨年才补年份）
function dayLabelOf(value) {
    const parts = value.split('-');
    const now = new Date();
    const target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((midnight.getTime() - target.getTime()) / 86400000);
    if (diffDays === 1) {
        return '昨天';
    }
    const monthDay = Number(parts[1]) + '月' + Number(parts[2]) + '日';
    return target.getFullYear() === now.getFullYear() ? monthDay : parts[0] + '年' + monthDay;
}

// 备注按钮上最多显示 6 个字，超出用省略号
function noteLabelOf(note) {
    const text = typeof note === 'string' ? note.trim() : '';
    if (text === '') {
        return '备注';
    }
    return text.length > 6 ? text.slice(0, 6) + '…' : text;
}

// 用户还没攒够记录时，下拉里垫一批最常见的食物
const COMMON_FOOD_NAMES = ['米饭', '牛肉面', '鸡蛋', '牛奶', '全麦面包', '鸡胸肉', '苹果', '香蕉', '酸奶', '玉米', '西兰花', '豆浆'];
const FOOD_MENU_LIMIT = 8;

const recordStore = createRecordStore({ storageKey: 'cal_records' });
const foodStore = createFoodStore({ storageKey: 'cal_foods' });

// 清单项与保存批次的递增序号：只用于页面内 key 生成，不参与持久化。
let itemSeq = 0;
let batchSeq = 0;

// 页面参数可能已被基础库解码过一次，遇到含 % 的串时兜底返回原值。
function safeDecode(value) {
    if (typeof value !== 'string' || value === '') {
        return '';
    }
    try {
        return decodeURIComponent(value);
    } catch (err) {
        return value;
    }
}

// 营养素展示：整数不带小数点，其余保留一位。
function formatMacro(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        return '0';
    }
    const rounded = Math.round(num * 10) / 10;
    return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

function round1(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        return 0;
    }
    return Math.round(num * 10) / 10;
}

// 用户没填就用自动估算值，填了（含填 0）以用户为准。
function resolveMacroValue(raw, fallback) {
    const text = raw === undefined || raw === null ? '' : String(raw).trim();
    if (text === '') {
        return round1(fallback);
    }
    const num = Number(text);
    if (!Number.isFinite(num) || num < 0) {
        return round1(fallback);
    }
    return round1(num);
}

// 按食物品种 + 每份热量估算一份的三大营养素；算不出来时三项为 0。
function estimateMacro(name, perUnit, unit) {
    const local=unit ? require('../../utils/nutrition').lookup(name,unit) : null;
    if(local && ['p','c','f'].every(key=>Number.isFinite(local[key])))return {p:local.p*perUnit/local.kcal,c:local.c*perUnit/local.kcal,f:local.f*perUnit/local.kcal};
    const estimate = foodDb.findMacro(name, perUnit);
    if (estimate === null) {
        return { p: 0, c: 0, f: 0 };
    }
    return { p: estimate.p, c: estimate.c, f: estimate.f };
}

function buildBatchId() {
    batchSeq = (batchSeq + 1) % 10000;
    return 'b' + Date.now() + '-' + batchSeq;
}

Page(withTheme({
    data: {
        mealOptions: MEAL_OPTIONS,
        selectedMeal: 'lunch',
        unitOptions: UNIT_OPTIONS,
        selectedUnit: '碗',
        unitIndex: 0,
        unitOpen: false,
        unitMenuPos:{left:0,top:0,width:100},
        foods: [],
        formName: '',
        formQty: '1',
        formGramsPerUnit:'',
        formKcal: '',
        formProtein: '',
        formCarb: '',
        formFat: '',
        formNote: '',
        formError: '',
        totalKcalText: '',
        energyUnit: 'kcal',
        suggestions: [],
        autoFillHint: '',
        macroHint: '',
        submitting: false,foodLearningPending:false,
        photoPath: '',
        // 编辑面板：动手记与拍照识别结果共用，日期/食物/吃多少/备注都集成在里面
        manualOpen: false,
        foodQuery: '',
        portionMatches: [],
        portionFood: null,
        portionPreview: null,
        foodCategories: mealCatalog.categories,
        foodCategoryPages: [mealCatalog.categories.slice(0, 10), mealCatalog.categories.slice(10)],
        catalogCategory: '',
        catalogRows: [],
        catalogColumns: [],
        catalogStripWidth: 100,
        catalogColumnWidth: 100 / mealCatalog.visibleColumns,
        catalogVisibleColumns: mealCatalog.visibleColumns,
        catalogPointer: 10,
        catalogRowEnd: -1,
        catalogPage: 0,
        catalogAdding: '',
        catalogFormCategories: mealCatalog.categories.filter(item => !['常吃', '我的'].includes(item.name)),
        personalCatalog: [],
        portionBreakdown: false,
        recordingFromSearch: false,
        voiceStarting: false,
        recognizing: false,
        photoSourceOpen: false,
        photoSourceText: '',
        // 本餐清单：一次「保存本餐」写出 items.length 条记录，共用同一个 batchId。
        items: [],
        itemsCount: 0,
        mealTotalKcalText: '',
        mealMacroText: '',mealAiEstimated:false,
        saveButtonText: '保存',
        editingIndex: -1,
        confirmClear: false,
        // 记录日期：默认今天，补记时可以往回挑月/日；具体时刻不选，按保存那一刻算
        dateOpen: false, dateDays: [], dateWeekdays: ['日','一','二','三','四','五','六'],
        dateMonthLabel: '', dateMenuPos: {left:12,top:100,width:300},
        datePrevDisabled: false, dateNextDisabled: false,
        dateValue: '',
        dateLabel: '今天',
        datePicked: false,
        todayValue: '',
        // 长按中间按钮录下的语音便签（进入本页时从全局取）
        voiceNote: { path: '', duration: 0 },
        voicePlaying: false,
        voiceRecognizing: false,
        voiceHint: '',
        voiceStage:'idle',voiceStatusText:'',voiceTranscript:'',voiceTranscriptOpen:false,
        pendingFoods: [],
        multipleVoiceMeals: false,
        nutritionEstimating: false,
        // 键盘面板：常驻底部，activeField 是当前正在输入的字段，keypadValue 是键盘缓冲
        activeField: 'formQty',
        keypadValue: '1',
        pendingCalculation:false,
        // 名称行的备注：点开弹窗里写，收起后按钮上显示前几个字
        noteOpen: false,
        noteDraft: '',
        noteLabel: '备注',
        // 名称行的常见食物下拉：按用户记录频率排序，不够再用内置库补
        foodMenu: [],
        foodMenuHeight: 0,
        foodMenuPos: { left: 0, top: 0, width: 0 },
        foodMenuOpen: false,
    },

    onLoad(options) {
        this.setData({unitOptions:customUnits.list()});
        const hour = new Date().getHours();
        this.resetManualState();
        const today = formatDate(new Date());
        this.setData({
            // 默认餐次按当前时段：早上进来停早餐，晚上停晚餐（与建议页/食谱库共用同一映射）
            selectedMeal: advice.mealOfHour(hour),
            energyUnit: units.energyUnitLabel(),
            dateValue: today,
            todayValue: today,
        });
        this.loadFoods();
        this.applyPrefill(options);
        this.consumeVoiceNote();
        this.consumeQuickMeal();
        if (options && MEAL_OPTIONS.some(item => item.key === options.meal)) this.setData({ selectedMeal: options.meal });
        this.entryMode = options && options.mode;
    },
    onReady() {
        // The manual form opens only after tapping 添加食物到本餐.
        if (this.entryMode === 'photo') this.handlePhotoRecord();
    },

    onUnload() {
        this.disposed = true;
        if (this.searchVoiceSession) { this.searchVoiceSession = null; voiceRecorder.stop(true); }
        this.voiceRequestToken=null;
        this.clearClearTimer();
        this.stopVoicePlayback();
    },

    // ---------- 记录日期 ----------
    handleDateToggle(event) {
        if (this.data.dateOpen) { this.setData({dateOpen:false}); return; }
        const parts = this.currentDate().split('-').map(Number);
        this.renderDateMonth(parts[0], parts[1]-1);
        this.setData({unitOpen:false, foodMenuOpen:false});
        wx.createSelectorQuery().select(event && event.currentTarget && event.currentTarget.dataset.anchor === 'header' ? '.entry-date' : '.kp-time').boundingClientRect(rect => {
            const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const width = Math.min(308, win.windowWidth-24);
            const left = Math.max(12, Math.min(rect ? rect.left : 12, win.windowWidth-width-12));
            const top = Math.max(12, Math.min(rect ? rect.bottom+6 : 100, win.windowHeight-340));
            this.setData({dateOpen:true,dateMenuPos:{left,top,width}});
        }).exec();
    },
    renderDateMonth(year, month) {
        this.dateMonth = new Date(year,month,1);
        const y=this.dateMonth.getFullYear(), m=this.dateMonth.getMonth();
        const days= new Date(y,m+1,0).getDate(), offset=this.dateMonth.getDay();
        const today=formatDate(new Date()), cells=[];
        for(let i=0;i<offset;i++) cells.push({key:'blank'+i,day:'',value:'',disabled:true});
        for(let d=1;d<=days;d++) {
            const value=formatDate(new Date(y,m,d));
            cells.push({key:value,day:d,value,disabled:value>today || value<'2020-01-01'});
        }
        const now=new Date();
        this.setData({dateDays:cells,dateMonthLabel:y+'年'+(m+1)+'月',
            datePrevDisabled:y===2020&&m===0,
            dateNextDisabled:y===now.getFullYear()&&m===now.getMonth()});
    },
    handleDateMonth(event) {
        const step=Number(event.currentTarget.dataset.step);
        if ((step!==-1&&step!==1) || (step<0&&this.data.datePrevDisabled) || (step>0&&this.data.dateNextDisabled)) return;
        this.renderDateMonth(this.dateMonth.getFullYear(),this.dateMonth.getMonth()+step);
    },
    handleDatePick(event) {
        this.manualDatePicked=true;
        const value=event.currentTarget.dataset.value;
        if (!isValidDay(value) || value<'2020-01-01' || value>formatDate(new Date())) return;
        this.applyDate(value);
    },
    handleDateChange(event) {
        this.manualDatePicked=true;
        const value = typeof event.detail.value === 'string' ? event.detail.value : '';
        if (!isValidDay(value)) {
            return;
        }
        this.applyDate(value);
    },

    handleDateReset() {
        this.manualDatePicked=true;
        this.applyDate(formatDate(new Date()));
    },

    // 选今天等于「现在」；选过去的日期才算补记
    applyDate(value) {
        const today = formatDate(new Date());
        const picked = value !== today;
        this.setData({
            dateOpen: false,
            dateValue: value,
            todayValue: today,
            dateLabel: picked ? dayLabelOf(value) : '今天',
            datePicked: picked,
        });
    },

    // 补记到过去某天时落 createdAt：统计里的进食时段、进食窗口都按它算。
    // 时刻取保存这一刻，且不许超过现在（数据层会把未来时间当成脏值丢掉）。
    buildCreatedAt() {
        if (!this.data.datePicked) {
            return null;
        }
        const parts = String(this.data.dateValue).split('-');
        if (parts.length !== 3) {
            return null;
        }
        const now = new Date();
        const target = new Date(
            Number(parts[0]),
            Number(parts[1]) - 1,
            Number(parts[2]),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds()
        );
        const ts = target.getTime();
        if (!Number.isFinite(ts) || ts <= 0) {
            return null;
        }
        return Math.min(ts, now.getTime());
    },

    // 这条记录算哪一天：没选过就用今天
    currentDate() {
        return isValidDay(this.data.dateValue) ? this.data.dateValue : formatDate(new Date());
    },

    // ---------- 语音便签 ----------
    handleSearchVoice() {
        if (this.data.voiceStarting || this.data.voiceRecognizing || this.data.recognizing) return;
        if (this.data.recordingFromSearch) {
            this.setData({ recordingFromSearch: false, voiceStarting: true });
            voiceRecorder.stop(false);
            return;
        }
        if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
        const token = {};
        this.searchVoiceSession = token;
        this.setData({ voiceStarting: true, foodQuery: '', portionMatches: [], catalogCategory: '' });
        voiceRecorder.start(result => {
            if (this.disposed || this.searchVoiceSession !== token) return;
            this.searchVoiceSession = null;
            this.setData({ recordingFromSearch: false, voiceStarting: false });
            if (result.ok) this.runVoiceRecognition({ path: result.path, duration: result.duration, recordedAt: Date.now() });
            else if (!result.canceled && result.error) wx.showToast({ title: result.error, icon: 'none' });
        }).then(started => {
            if (this.disposed || this.searchVoiceSession !== token) { if (started) voiceRecorder.stop(true); return; }
            if (!started) { this.searchVoiceSession = null; this.setData({ voiceStarting: false }); return; }
            this.setData({ recordingFromSearch: true, voiceStarting: false });
        }).catch(() => {
            if (this.searchVoiceSession !== token) return;
            this.searchVoiceSession = null;
            this.setData({ recordingFromSearch: false, voiceStarting: false });
            wx.showToast({ title: '录音启动失败', icon: 'none' });
        });
    },
    handleSearchVoiceCancel() {
        if (!this.searchVoiceSession) return;
        this.searchVoiceSession = null;
        this.setData({ recordingFromSearch: false, voiceStarting: false });
        voiceRecorder.stop(true);
    },
    consumeVoiceNote() {
        const app=getApp(),note=app && app.globalData ? app.globalData.voiceNote : null;
        if(note && typeof note.path==='string' && note.path){app.globalData.voiceNote=null;return this.runVoiceRecognition(note);}
    },
    consumeQuickMeal() {
        const app = getApp(), text = app && app.globalData && app.globalData.quickMealText;
        if (!text) return;
        app.globalData.quickMealText = '';
        const result = require('../../utils/voice-parser').parse(text);
        const context = result.context || {};
        if (context.meal) this.setData({ selectedMeal: context.meal });
        if (context.date) this.applyDate(context.date);
        const items = (result.multipleMeals ? [] : result.items).filter(item => item && item.name && item.qty > 0 && Number.isFinite(item.kcal) && item.kcal >= 0).map(item => {
            const qty = Number(item.qty);
            return { weightBasis: require('../../utils/food-weight').sanitize(item.weightBasis), key: 'quick-' + (++itemSeq), name: item.name, unit: item.unit || '份', qty, perUnit: item.kcal / qty, kcal: item.kcal,
                protein: Number.isFinite(item.protein) ? round1(item.protein) : null, carb: Number.isFinite(item.carb) ? round1(item.carb) : null, fat: Number.isFinite(item.fat) ? round1(item.fat) : null,
                nutritionStatus: item.nutritionStatus || 'incomplete', note: item.note || '食库参考，请核对', manual: { protein: true, carb: true, fat: true }, qtyText: qty + (item.unit || '份'), kcalText: units.energyText(item.kcal) };
        });
        const pending = result.multipleMeals ? [{ name: '涉及多餐', requiresDetail: true, reason: '请按餐次分别添加食物，再移除此提示' }] : (result.pending || []);
        this.setData({ items: this.data.items.concat(items), pendingFoods: pending, multipleVoiceMeals: false, voiceHint: '快捷记：' + text + ' · 请核对后保存' });
        this.recalcMeal();
    },
    runVoiceRecognition(note){
        if(this.data.voiceRecognizing || this.disposed)return;
        this.voiceSourceNote=note;
        const token={},originalMeal=this.data.selectedMeal,originalDate=this.data.dateValue;
        this.voiceRequestToken=token;
        this.setData({voiceNote:{path:note.path,duration:note.duration || 0},voiceRecognizing:true,voiceStage:'working',voiceStatusText:'',voiceTranscript:'',voiceTranscriptOpen:false,voiceHint:'',formError:''});
        return voiceRecognizer.recognize(note).then(result=>{
            if(this.disposed || this.voiceRequestToken!==token)return;
                if(result.ok) this.voiceContextApplied=true;
                const context=result.context || {};
                if(context.meal && !this.manualMealPicked && this.data.selectedMeal===originalMeal) this.setData({selectedMeal:context.meal});
                if(context.date && !this.manualDatePicked && this.data.dateValue===originalDate) this.applyDate(context.date);
                this.setData({pendingFoods:result.pending || [], multipleVoiceMeals:!!result.multipleMeals});
                const items = result.ok ? result.items.filter(item => item && typeof item.name === 'string' && item.name.trim() && Number(item.qty) > 0 && Number(item.kcal) >= 0).map(item => {
                    const qty = Number(item.qty);
                    return { weightBasis:require('../../utils/food-weight').sanitize(item.weightBasis),key: 'voice-' + (++itemSeq), name: item.name.trim(), unit: item.unit || '份', qty, perUnit: Number(item.kcal) / qty,
                        kcal: Number(item.kcal), protein:Number.isFinite(item.protein)?round1(item.protein):null,carb:Number.isFinite(item.carb)?round1(item.carb):null,fat:Number.isFinite(item.fat)?round1(item.fat):null,nutritionStatus:item.nutritionStatus || (['protein','carb','fat'].every(key=>Number.isFinite(item[key]))?'estimated':'incomplete'),aiEstimated:item.source==='ai-estimate' || (result.source==='ai' && !['personal','usda','local','recipe-estimate'].includes(item.source)),note: item.note || '语音识别估算，请核对', manual: {carb: true, protein: true, fat: true},
                        qtyText: qty + (item.unit || '份'), kcalText: units.energyText(Number(item.kcal)) };
                }) : [];
            this.setData({voiceRecognizing:false,voiceStage:result.ok ? 'ready' : 'error',voiceTranscript:result.text || '',voiceStatusText:result.ok ? (result.pending && result.pending.length ? '已整理，部分食物待补全' : result.multipleMeals ? '涉及多餐，请分别核对记录' : items.length ? '已整理，请核对食物与份量' : '已识别文字，请手动添加食物') : (result.error || '识别未完成，可重试或手动添加')});
            if(items.length){this.setData({items:this.data.items.concat(items)});this.recalcMeal();}
        }).catch(()=>{
            if(!this.disposed && this.voiceRequestToken===token)this.setData({voiceRecognizing:false,voiceStage:'error',voiceStatusText:'识别未完成，录音已保留，可重试'});
        });
    },
    handleTranscriptToggle(){this.setData({voiceTranscriptOpen:!this.data.voiceTranscriptOpen});},
    handleCancelVoiceRecognition(){
        this.voiceRequestToken=null;
        this.setData({voiceRecognizing:false,voiceStage:'canceled',voiceStatusText:'已取消等待，可重试或手动添加'});
    },
    handleVoiceRetry(){if(!this.data.voiceRecognizing && this.voiceSourceNote && this.data.voiceNote.path)return this.runVoiceRecognition(this.voiceSourceNote);},

    handleVoicePlay() {
        if (this.data.voicePlaying) {
            this.stopVoicePlayback();
            this.setData({ voicePlaying: false });
            return;
        }
        const path = this.data.voiceNote.path;
        if (typeof path !== 'string' || path === '') {
            return;
        }
        const that = this;
        if (!this.audio) {
            this.audio = wx.createInnerAudioContext();
            this.audio.onEnded(() => that.setData({ voicePlaying: false }));
            this.audio.onError(() => {
                that.setData({ voicePlaying: false });
                wx.showToast({ title: '播放失败', icon: 'none' });
            });
        }
        this.audio.src = path;
        this.audio.play();
        this.setData({ voicePlaying: true });
    },

    stopVoicePlayback() {
        if (this.audio) {
            try { this.audio.stop(); } catch (err) { /* 忽略 */ }
        }
    },

    handleEstimateNutrition() {
        const name=this.data.formName.trim(), unit=this.data.selectedUnit;
        if (!name || this.data.nutritionEstimating) return;
        const fields=['formName','selectedUnit','formQty','formGramsPerUnit','formKcal','formProtein','formCarb','formFat'];
        const signature=JSON.stringify(fields.map(key=>this.data[key]));
        const qty=Number(this.data.formQty)||1;
        this.setData({nutritionEstimating:true,formError:''});
        require('../../utils/ai-runtime').estimateFood(name,unit).then(row=>{
            if(this.disposed || !this.data.manualOpen || JSON.stringify(fields.map(key=>this.data[key]))!==signature) return;
            this.loadWeightBasis(row.weightBasis);this.unitKcal=row.kcal;
            this.setData({formKcal:inputEnergy(row.kcal),formProtein:String(round1(row.protein*qty)),formCarb:String(round1(row.carb*qty)),formFat:String(round1(row.fat*qty)),autoFillHint:'AI 估算，未经检测；请核对后加入本餐。',formNote:'AI 营养估算，用户核对'});
            this.macroManual={carb:true,protein:true,fat:true};
        }).catch(error=>{if(!this.disposed)this.setData({formError:error.message});}).finally(()=>{if(!this.disposed)this.setData({nutritionEstimating:false});});
    },
    handlePendingEstimate(event) {
        const row=(this.data.pendingFoods || [])[Number(event.currentTarget.dataset.index)];
        if(!row || this.data.nutritionEstimating)return;
        if(row.requiresDetail){this.handlePendingFill(event);this.setData({formError:row.reason});return;}
        if(!(Number(row.qty)>0)){this.handlePendingFill(event);this.setData({formError:'先确认份量，再点击AI营养估算'});return;}
        const signature=JSON.stringify([row.name,row.unit,row.qty]);
        this.setData({nutritionEstimating:true});
        return require('../../utils/ai-runtime').estimateFood(row.name,row.unit).then(estimate=>{
            if(this.disposed || !(this.data.pendingFoods || []).some(item=>JSON.stringify([item.name,item.unit,item.qty])===signature))return;
            const qty=Number(row.qty),kcal=estimate.kcal*qty;
            const item={key:'estimate-'+(++itemSeq),name:row.name,unit:row.unit,qty,weightBasis:estimate.weightBasis,perUnit:estimate.kcal,kcal,protein:round1(estimate.protein*qty),carb:round1(estimate.carb*qty),fat:round1(estimate.fat*qty),manual:{carb:true,protein:true,fat:true},nutritionStatus:'estimated',note:'AI营养估算，请核对做法与份量',qtyText:qty+row.unit,kcalText:units.energyText(kcal)};
            const pending=this.data.pendingFoods.slice(),index=pending.findIndex(item=>JSON.stringify([item.name,item.unit,item.qty])===signature);if(index>=0)pending.splice(index,1);
            this.setData({pendingFoods:pending,items:this.data.items.concat(item)});this.recalcMeal();
        }).catch(error=>{if(!this.disposed)this.setData({voiceHint:error.message,formError:error.message});}).finally(()=>{if(!this.disposed)this.setData({nutritionEstimating:false});});
    },
    handlePendingFill(event) {
        const index=Number(event.currentTarget.dataset.index), row=(this.data.pendingFoods || [])[index];
        if (!row) return;
        this.pendingEditingName=row.name;
        this.pendingEditingSignature=JSON.stringify([row.name,row.unit,row.qty,row.reason]);
        this.unitKcal=0;
        this.setData({editingIndex:-1,formNote:'',autoFillHint:'',totalKcalText:'',formName:row.name,formQty:String(row.qty || 1),formKcal:'',formProtein:'',formCarb:'',formFat:'',manualOpen:true,macroHint:'请核对食物名称、干熟状态及份量'});
        this.resetManualState();
        this.setUnit(row.needsCapacity?'毫升':row.needsWeight?'克':row.unit);
        if(row.needsCapacity || row.needsWeight){
            const reference=foodDb.findByUnit(row.name,this.data.selectedUnit);this.unitKcal=reference?reference.kcal:0;
            this.setData({formQty:'',keypadValue:'',activeField:'formQty',formKcal:reference?inputEnergy(reference.kcal):'',autoFillHint:'已识别'+row.qty+row.unit+'；请填实际吃喝的总'+(row.needsCapacity?'容量（毫升）':'重量（克）'),macroHint:row.reason});
        }
    },
    handlePendingRemove(event) {
        const rows=(this.data.pendingFoods || []).slice(); rows.splice(Number(event.currentTarget.dataset.index),1);
        this.setData({pendingFoods:rows});
    },
    handleVoiceRemove() {
        this.voiceRequestToken=null;this.voiceSourceNote=null;
        this.setData({voiceRecognizing:false,voiceStage:'idle',voiceStatusText:'',voiceTranscript:'',voiceTranscriptOpen:false,voiceHint:''});
        this.setData({multipleVoiceMeals:false});
        this.stopVoicePlayback();
        this.setData({ voiceNote: { path: '', duration: 0 }, voicePlaying: false });
    },

    // ---------- 键盘面板 ----------
    // 点字段 chip 切换输入目标，键盘缓冲装入该字段当前值
    selectField(event) {
        if(!this.finishKeypadCalculation())return;
        this.foodMenuToken=(this.foodMenuToken || 0)+1;
        this.setData({foodMenuOpen:false});
        const field = event.currentTarget.dataset.field;
        if (KEYPAD_FIELDS[field] === undefined) {
            return;
        }
        const gramsTotal = field === 'formKcal' && this.data.selectedUnit === '克';
        const value = gramsTotal && this.data.formKcal !== '' && Number(this.data.formQty) > 0
            ? formatMacro(Number(this.data.formKcal) * Number(this.data.formQty)) : this.data[field];
        this.setData({ activeField: field, keypadValue: String(value || '') });
    },

    loadWeightBasis(raw){
        this.formWeightBasis=require('../../utils/food-weight').sanitize(raw);
        this.setData({formGramsPerUnit:this.formWeightBasis?String(this.formWeightBasis.gramsPerUnit):''});
    },
    recalculateWeight(){
        const grams=Number(this.data.formGramsPerUnit),qty=Number(this.data.formQty);
        if(!this.formWeightBasis)return;
        const basis=Object.assign({},this.formWeightBasis,{gramsPerUnit:grams});
        const value=require('../../utils/food-weight').forUnit(basis,qty);
        if(!value){this.setData({formError:'请输入有效份量和每单位克重'});return;}
        this.formWeightBasis=basis;this.unitKcal=value.kcal/qty;this.macroManual={carb:false,protein:false,fat:false};
        this.setData({formKcal:inputEnergy(this.unitKcal),formProtein:formatMacro(value.protein),formCarb:formatMacro(value.carb),formFat:formatMacro(value.fat),formError:'',autoFillHint:'参考每'+this.data.selectedUnit+grams+'g，共'+formatMacro(value.totalGrams)+'g；按每100g营养换算'});
        this.updateTotal();
    },
    // 数值即输即生效：每敲一键就直接写回表单字段并刷新联动（合计 / 自动估算）
    commitField(field, value) {
        const cfg = KEYPAD_FIELDS[field];
        if (!cfg) {
            return;
        }
        const patch = { keypadValue: value };
        if(field==='formGramsPerUnit'){this.setData({formGramsPerUnit:value,keypadValue:value});this.recalculateWeight();return;}
        if(field==='formKcal' && this.formWeightBasis){this.formWeightBasis=null;patch.formGramsPerUnit='';}
        const totalEnergyInput = field === 'formKcal' && this.data.selectedUnit === '克';
        const quantity = Number(this.data.formQty);
        const fieldValue = totalEnergyInput && value !== '' && quantity > 0 ? String(Number(value) / quantity) : value;
        patch[field] = fieldValue;
        if (cfg.macro) {
            this.setData(patch, () => {
                this.handleMacroInput(field, value);
            });
            return;
        }
        if (field === 'formKcal') {
            patch.autoFillHint = '';
            const typed = units.toKcal(fieldValue);
            if (Number.isFinite(typed) && typed > 0) {
                this.unitKcal = typed;
            }
        }
        if (field === 'formQty') {
            this.setData(patch, () => {
                this.syncQtyDerived();
            });
            return;
        }
        this.setData(patch, () => {
            this.updateTotal();
            this.applyAutoMacro({
                name: this.data.formName,
                kcal: this.resolvePerUnit(),
                qty: this.data.formQty,
            });
        });
    },

    keypadTap(event) {
        const key = event.currentTarget.dataset.key;
        const field = this.data.activeField;
        const cfg = KEYPAD_FIELDS[field];
        if (!cfg) {
            return;
        }
        if(key==='equals'){this.finishKeypadCalculation();return;}
        const operator={add:'+',subtract:'−',multiply:'×',divide:'÷'}[key];
        if(operator){const value=(this.data.keypadValue||'0').replace(/[+−×÷]$/,'');if(value.length<70)this.setData({keypadValue:value+operator,pendingCalculation:true,formError:''});return;}
        if(this.data.pendingCalculation){
            let value=this.data.keypadValue;
            if(key==='clear'){this.setData({pendingCalculation:false});this.commitField(field,'');return;}
            if(key==='back')value=value.slice(0,-1);
            else if(key==='dot'){const last=value.split(/[+−×÷]/).pop();if(!last.includes('.'))value+=(last?'':'0')+'.';}
            else if(/^\d$/.test(key)&&value.length<80)value+=key;
            this.setData({keypadValue:value,formError:''});return;
        }
        let value = this.data.keypadValue;
        if (key === 'back') {
            value = value.slice(0, -1);
        } else if (key === 'clear') {
            value = '';
        } else if (key === 'dot') {
            if (value.indexOf('.') === -1) {
                value = value === '' ? '0.' : value + '.';
            }
        } else if (/^\d$/.test(key)) {
            if (value === '0') {
                value = key;
            } else if (value === '0.' || value.indexOf('.') !== -1) {
                // 小数位最多 1 位
                const decimals = value.split('.')[1] || '';
                if (decimals.length < 1) {
                    value += key;
                }
            } else if (value.length < cfg.maxLen) {
                value += key;
            }
        }
        this.commitField(field, value);
    },

    finishKeypadCalculation(){
        if(!this.data.pendingCalculation)return true;
        try{const value=require('../../utils/calculator').calculate(this.data.keypadValue),cfg=KEYPAD_FIELDS[this.data.activeField];if(!cfg||value<0||value>=Math.pow(10,cfg.maxLen))throw Error('计算结果超出此项可填写范围');this.setData({pendingCalculation:false,formError:''});this.commitField(this.data.activeField,String(value));return true;}
        catch(error){this.setData({formError:error.message});return false;}
    },
    noop() {},

    // ---------- 功能入口：动手记 / 拍照记 ----------
    handlePortionSearch(event) {
        const query = event.detail.value;
        clearTimeout(this.catalogSearchTimer);
        const searchToken = {};
        this.catalogSearchToken = searchToken;
        const matches = this.getCatalog().filter(row => [row.name].concat(row.aliases || []).some(name => name.includes(query.trim()))).map(row => Object.assign({}, row, { portionText: portionText(row) }));
        const fallback = foodDb.searchFoods(query);
        this.setData({
            foodQuery: query,
            portionMatches: query.trim() ? matches.concat(fallback.filter(row => !matches.some(match => match.name === row.name)).map(row => Object.assign({}, row, { portionText: portionText(row) }))).slice(0, 100) : [],
            catalogCategory: '',
            portionFood: null,
            portionPreview: null,
            formError: '',
        });
        if (query.trim().length < 2) return;
        this.catalogSearchTimer = setTimeout(() => {
            require('../../utils/builtin-ai').searchFoods(query.trim()).then(foods => {
                if (this.disposed || this.catalogSearchToken !== searchToken || this.data.foodQuery !== query) return;
                const local = this.data.portionMatches;
                const extra = foods.filter(food => food.unit === 'g' && food.per100 &&
                    ['kcal','protein','carb','fat'].every(key => Number.isFinite(food.per100[key]) && food.per100[key] >= 0) &&
                    !local.some(row => row.name === food.name)).map(food => {
                    // 库里按每100克存、另存一份克重：成品菜一份常有 400-600 克，按100克给量会低估好几倍。
                    const portion = Number(food.serving_g);
                    const grams = portion > 0 && portion <= 10000 ? portion : 100;
                    const scale = grams / 100;
                    const label = grams === 100 && !portion ? '每100克' : '一份约' + Math.round(grams) + '克';
                    return {
                        name: food.name, unit: '份', grams, kcal: food.per100.kcal * scale,
                        p: food.per100.protein * scale, c: food.per100.carb * scale, f: food.per100.fat * scale,
                        source: 'food-library', portionHint: '食库参考' + (food.serving_label ? ' · ' + food.serving_label : ''),
                        portionText: '食库参考 · ' + label,
                        weightBasis: {gramsPerUnit:grams, per100g:food.per100},
                    };
                });
                this.setData({portionMatches:local.concat(extra).slice(0,100)});
            }).catch(() => {});
        },350);
    },

    handlePortionClear() {
        this.handlePortionSearch({ detail: { value: '' } });
    },

    getCatalog() {
        let counts = {};
        try { counts = wx.getStorageSync('cal_food_selections') || {}; } catch (_) {}
        return mealCatalog.rows(this.data.personalCatalog, counts);
    },

    handleCatalogDismiss() {
        if (this.data.catalogCategory) this.setData({ catalogCategory: '' });
    },

    handleCatalogPageScroll() {
        if (this.data.catalogCategory) this.setData({ catalogCategory: '' });
    },

    handleCatalogCategory(event) {
        const category = event.currentTarget.dataset.category;
        if (category === this.data.catalogCategory) {
            this.handleCatalogDismiss();
            return;
        }
        this.showCatalog(category);
    },

    showCatalog(category) {
        const rows = this.getCatalog();
        const filtered = category === '常吃' ? rows.slice(0, 24)
            : rows.filter(row => category === '我的' ? row.personal : row.category === category);
        const tiles = [{ name: '新增', icon: mealCatalog.addIcon, add: true }].concat(filtered.map((row, index) => ({
            name: row.name, icon: row.icon, index,
        })));
        const columns = [];
        const visible = mealCatalog.visibleColumns;
        for (let start = 0; start < tiles.length; start += visible * 2) {
            for (let col = 0; col < visible && start + col < tiles.length; col++) {
                columns.push({ key: start + col, top: tiles[start + col], bottom: tiles[start + col + visible] || null });
            }
        }
        const categoryIndex = this.data.foodCategories.findIndex(item => item.name === category);
        this.setData({ catalogCategory: category, catalogRows: filtered, catalogColumns: columns,
            catalogRowEnd: Math.floor((categoryIndex % 10) / 5) * 5 + 4,
            catalogStripWidth: Math.max(visible, columns.length) * 100 / visible,
            catalogColumnWidth: 100 / Math.max(visible, columns.length),
            catalogPointer: (categoryIndex % 5) * 20 + 10,
            foodQuery: '', portionMatches: [] });
    },

    handleCatalogTile(event) {
        const { add, index } = event.currentTarget.dataset;
        if (add) {
            const category = ['常吃', '我的'].includes(this.data.catalogCategory) ? '小吃' : this.data.catalogCategory;
            this.setData(Object.assign(this.emptyFormPatch(), { catalogAdding: category, selectedUnit: '份' }));
            this.handleOpenManual();
            return;
        }
        this.selectPortionFood(this.data.catalogRows[index]);
    },

    handleCatalogSave() {
        if (this.data.nutritionEstimating || this.catalogSaving || !this.finishKeypadCalculation()) return;
        const built = this.buildItemFromForm();
        if (!built.item) { this.setData({ formError: built.error }); return; }
        const item = built.item;
        const category = this.data.catalogAdding;
        const grams = Number(this.data.formGramsPerUnit);
        const perUnit = (field, value) => String(this.data[field]).trim() && Number.isFinite(value) ? value / item.qty : null;
        this.catalogSaving = true;
        foodStore.upsertMany([{
            name: item.name, unit: item.unit, kcal: item.perUnit, weightBasis: item.weightBasis,
            grams, category, nutrition: {
                p: perUnit('formProtein', item.protein), c: perUnit('formCarb', item.carb), f: perUnit('formFat', item.fat),
            },
        }]).then(result => {
            if (this.disposed) return;
            if (result.error) { this.setData({ formError: '未能存入食物库，请重试' }); return; }
            const current = this.data.catalogCategory;
            this.catalogSaving = false;
            this.handleSheetClose();
            return this.loadFoods().then(() => { if (!this.disposed && current) this.showCatalog(current); });
        }).finally(() => { this.catalogSaving = false; });
    },

    handleCatalogFormCategory(event) {
        const options = this.data.catalogFormCategories;
        const category = options[Number(event.detail.value)];
        if (category) this.setData({ catalogAdding: category.name });
    },

    handlePortionPick(event) {
        this.selectPortionFood(this.data.portionMatches[event.currentTarget.dataset.index]);
    },

    selectPortionFood(row) {
        if (!row || !(row.kcal > 0)) return;
        const nutrition = require('../../utils/nutrition');
        const imported = require('../../utils/china-food-index').lookup(row.name);
        const reference = row.source === 'food-library' ? row : imported || nutrition.lookup(row.name, row.unit);
        const food = row.personal ? Object.assign({}, row, row.nutrition, { source: 'personal' }) : row.parts ? row : reference || row;
        const grams = food.weightBasis ? food.weightBasis.gramsPerUnit : food.grams;
        const canWeigh = Number.isFinite(grams) && grams > 0;
        const rice = canWeigh && food.source === 'usda' && food.name === '熟白米饭';
        const volume = canWeigh && !row.personal && require('../../utils/food-portions').isDrink(food.name)
            && /毫升|杯|罐|瓶|升/.test(food.unit);
        const presets = food.parts ? [{ label: '半份', grams: grams / 2 }, { label: '标准份', grams }]
            : rice ? [{ label: '小碗', grams: 150 }, { label: '标准碗', grams: 200 }, { label: '大碗', grams: 250 }]
            : canWeigh && grams > 1 ? [{ label: '1' + food.unit, grams }] : [];
        if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
        this.setData({ foodQuery: row.name, portionMatches: [], catalogCategory: '', portionBreakdown: false, portionBasisAdjusted: false, portionBasisInput: canWeigh ? String(grams) : '', portionBasisError: '', portionFood: {
            name: row.name, referenceName: food.name || row.name, unit: food.unit, grams: canWeigh ? grams : null, presets, editableBasis: !canWeigh, category: row.category,
            measure: volume ? 'mL' : 'g',
            recordUnit: volume ? '毫升' : '克',
            icon: row.icon || mealCatalog.decorate(row).icon,
            parts: food.parts || null,
            max: Math.max(400, Math.ceil((grams || 0) * 2)),
            kcal: food.kcal, protein: food.p, carb: food.c, fat: food.f,
            sourceLabel: food.parts ? '套餐估算 · 荤菜参考烤鸡胸，素菜参考煮豌豆'
                : food.source === 'usda' ? 'USDA 成分数据 · 份量为参考估算'
                : food.source === 'personal' ? '个人确认数据' : (food.name !== row.name ? '参考：' + food.name + ' · ' : '') + (food.portionHint || '本地食物参考'),
        } });
        this.updatePortionPreview(rice ? 200 : volume && grams === 1 ? 200 : canWeigh ? grams : null);
    },

    updatePortionPreview(grams, adjustedParts) {
        const food = this.data.portionFood;
        if (!food) return;
        const scale = food.grams ? grams / food.grams : 1;
        const parts = adjustedParts || (food.parts && food.parts.map(part => Object.assign({}, part, { grams: round1(part.grams * scale) })));
        const totals = parts ? ['kcal', 'p', 'c', 'f'].map(key => parts.reduce((sum, part) => sum + part[key] * part.grams, 0))
            : [food.kcal, food.protein, food.carb, food.fat].map(value => Number.isFinite(value) ? value * scale : null);
        const display = value => Number.isFinite(value) ? formatMacro(value) : '—';
        this.setData({ portionPreview: {
            grams, parts, totals,
            kcal: units.energyText(totals[0]),
            protein: display(totals[1]), carb: display(totals[2]), fat: display(totals[3]),
        } });
    },

    handlePortionBasisInput(event) {
        this.setData({ portionBasisInput: event.detail.value, portionBasisError: '' });
    },

    handlePortionBasisSave() {
        const food = this.data.portionFood;
        const grams = Number(this.data.portionBasisInput);
        if (!food || !food.editableBasis || this.portionBasisSaving) return;
        if (!Number.isFinite(grams) || grams < 0.1 || grams > 10000) {
            this.setData({ portionBasisError: '请输入 0.1 至 10000 克' }); return;
        }
        this.portionBasisSaving = true;
        foodStore.upsertMany([{ name: food.name, unit: food.unit, kcal: food.kcal, grams,
            category: food.category, nutrition: { p: food.protein, c: food.carb, f: food.fat } }]).then(result => {
            this.portionBasisSaving = false;
            if (this.disposed) return;
            if (result.error) { this.setData({ portionBasisError: '保存失败，请重试' }); return; }
            this.loadFoods();
            if (this.data.portionFood !== food) return;
            this.setData({ portionFood: Object.assign({}, food, { grams, sourceLabel: '个人确认数据', max: Math.max(400, Math.ceil(grams * 2)), presets: [{ label: '1' + food.unit, grams }] }), portionBasisAdjusted: true, portionBasisInput: String(grams), portionBasisError: '' });
            this.updatePortionPreview(grams);
        });
    },

    handlePortionClose() {
        this.handlePortionClear();
    },

    handlePortionBreakdown() {
        this.setData({ portionBreakdown: !this.data.portionBreakdown });
    },

    handlePortionPart(event) {
        const value = Number(event.detail.value);
        const parts = this.data.portionPreview.parts;
        if (!parts || !event.detail.value.trim() || !Number.isFinite(value) || value < 0 || value > this.data.portionFood.max) return;
        const changed = parts.map((part, index) => index === Number(event.currentTarget.dataset.index)
            ? Object.assign({}, part, { grams: round1(value) }) : part);
        const total = round1(changed.reduce((sum, part) => sum + part.grams, 0));
        if (total > 0 && total <= this.data.portionFood.max) this.updatePortionPreview(total, changed);
    },

    handlePortionWeight(event) {
        const food = this.data.portionFood;
        if (!food || !food.grams) return;
        const grams = Number(event.currentTarget.dataset.grams || event.detail.value);
        if (Number.isFinite(grams) && grams >= 0.1 && grams <= food.max) {
            this.updatePortionPreview(round1(grams));
        } else {
            this.updatePortionPreview(this.data.portionPreview.grams);
        }
    },

    handlePortionAction() {
        const name = this.data.foodQuery.trim();
        if (!name || this.data.manualOpen || this.data.recognizing || this.photoPicking || this.data.submitting) return;
        const food = this.data.portionFood;
        if (!food) {
            if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
            this.setData(Object.assign(this.emptyFormPatch(), {
                formName: name, foodQuery: '', portionMatches: [], selectedUnit: '份',
                catalogAdding: mealCatalog.decorate({ name }).category,
            }));
            this.handleOpenManual();
            return;
        }
        const grams = this.data.portionPreview.grams;
        const [kcal, protein, carb, fat] = this.data.portionPreview.totals;
        const macro = value => Number.isFinite(value) ? round1(value) : null;
        const qty = grams || 1;
        const unit = grams ? food.recordUnit : food.unit;
        const item = {
            key: 'item-' + (++itemSeq), name, unit, qty, qtyText: formatMacro(qty) + unit,
            kcal: round1(kcal), kcalText: units.energyText(kcal), perUnit: kcal / qty,
            protein: macro(protein), carb: macro(carb), fat: macro(fat),
            note: food.sourceLabel, manual: { protein: true, carb: true, fat: true },
            skipFoodLearning: true,
            nutritionStatus: [food.protein, food.carb, food.fat].every(Number.isFinite) ? 'estimated' : 'incomplete',
        };
        if (grams && item.nutritionStatus !== 'incomplete') {
            const factor = 100 / grams;
            item.weightBasis = require('../../utils/food-weight').sanitize({
                gramsPerUnit: 1,
                per100g: {
                    kcal: kcal * factor, protein: protein * factor,
                    carb: carb * factor, fat: fat * factor,
                },
            });
        }
        try {
            const counts = wx.getStorageSync('cal_food_selections') || {};
            wx.setStorageSync('cal_food_selections', Object.assign({}, counts, { [name]: (Number(counts[name]) || 0) + 1 }));
        } catch (_) {}
        this.setData({
            items: this.data.items.concat(item), foodQuery: '', portionMatches: [],
            portionFood: null, portionPreview: null, confirmClear: false, formError: '',
        }, () => this.recalcMeal());
    },

    handleOpenManual() {
        this.setData({
            manualOpen: true,
            formError: '',
            activeField: 'formQty',
            keypadValue: String(this.data.formQty || ''),
        });
    },

    // 拍照或从相册选一张图片，两种来源共用识别草稿。
    handlePhotoRecord() {
        if (this.disposed || this.photoPicking || this.data.recognizing) return;
        this.setData({ photoSourceOpen: true });
    },

    handlePhotoSourceCancel() {
        this.setData({ photoSourceOpen: false });
    },

    handlePhotoSourcePick(event) {
        const source = event.currentTarget.dataset.source;
        if (!['camera', 'album'].includes(source) || this.disposed || this.photoPicking || this.data.recognizing) return;
        this.photoPicking = true;
        this.setData({ photoSourceOpen: false });
        const that = this;
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: [source],
            success(res) {
                that.photoPicking = false;
                const file = res && res.tempFiles && res.tempFiles[0];
                if (that.disposed || !file || !file.tempFilePath) return;
                const path = file.tempFilePath;
                that.setData({ photoPath: path, photoSourceText: '', recognizing: true });
                recognizer.recognize(path).then(result => {
                    if (that.disposed) return;
                    that.applyRecognize(result);
                });
            },
            fail() {
                // 取消拍摄或选图后可以重新打开选择器。
                that.photoPicking = false;
            },
        });
    },

    // 识别结果落到表单字段：全部可编辑，AI 给的营养素不再被自动估算覆盖
    applyRecognize(result) {
        if(result && result.ok && Array.isArray(result.items) && result.items.length>1) {
            const rows=result.items.filter(row=>row && row.name && Number(row.qty)>0 && Number(row.kcal)>0 && ['protein','carb','fat'].every(key=>Number.isFinite(row[key]) && row[key]>=0)).map(row=>({key:'photo-'+(++itemSeq),name:row.name,unit:row.unit || '份',qty:row.qty,perUnit:row.kcal/row.qty,kcal:row.kcal,protein:row.protein,carb:row.carb,fat:row.fat,manual:{protein:true,carb:true,fat:true},note:'AI 照片估算，请核对',nutritionStatus:'estimated',qtyText:row.qty+(row.unit || '份'),kcalText:units.energyText(row.kcal)}));
            if(rows.length===result.items.length){this.setData({recognizing:false,manualOpen:false,items:this.data.items.concat(rows),photoSourceText:'已逐项识别，请点击每项核对份量与营养'});this.recalcMeal();return;}
        }
        const patch = { recognizing: false, manualOpen: true };
        const source = result && result.source ? result.source : 'none';
        const unconfigured = source === 'unconfigured';

        if (!result || !result.ok) {
            patch.photoSourceText = (result && result.error ? result.error : '识别失败') + '，请对照照片手动填写';
            patch.activeField = 'formQty';
            patch.keypadValue = String(this.data.formQty || '');
            this.setData(patch);
            return;
        }

        const item = result.item;
        if (item && typeof item === 'object') {
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            if (name !== '') {
                patch.formName = name;
            }
            const qty = Number(item.qty);
            if (Number.isFinite(qty) && qty > 0) {
                patch.formQty = String(qty);
            }
            const kcal = Number(item.kcal);
            if (Number.isFinite(kcal) && kcal > 0) {
                // 识别给的是「这一份量」的合计热量，先换算成每份热量，
                // 这样面板里的热量字段与数量×热量 的关系一致，改数量也能自己算
                const baseQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
                this.unitKcal = Math.round((kcal / baseQty) * 10) / 10;
                patch.formKcal = inputEnergy(this.unitKcal);
            }
            const carb = Number(item.carb);
            const protein = Number(item.protein);
            const fat = Number(item.fat);
            if (Number.isFinite(carb) && carb > 0) {
                patch.formCarb = formatMacro(carb);
            }
            if (Number.isFinite(protein) && protein > 0) {
                patch.formProtein = formatMacro(protein);
            }
            if (Number.isFinite(fat) && fat > 0) {
                patch.formFat = formatMacro(fat);
            }
            if (customUnits.valid(customUnits.normalize(item.unit))) {
                const unitOptions=customUnits.add(item.unit);
                patch.selectedUnit = item.unit;
                patch.unitOptions=unitOptions;
                patch.unitIndex = unitOptions.indexOf(item.unit);
            }
            // 三项营养素都识别出来了就视为可信值，不再自动重算
            if (patch.formCarb !== undefined && patch.formProtein !== undefined && patch.formFat !== undefined) {
                this.macroManual = { carb: true, protein: true, fat: true };
            }
            patch.photoSourceText = unconfigured
                ? '视觉识别未启动，请对照照片填写并保存'
                : 'AI 识别初值，请核对无误后保存';
            // AI 识别出的份量对应热量合计要同步刷新，键盘定位到数量
            patch.activeField = 'formQty';
            patch.keypadValue = patch.formQty !== undefined ? patch.formQty : String(this.data.formQty || '');
            this.setData(patch, () => {
                this.updateTotal();
            });
            return;
        }

        patch.photoSourceText = unconfigured
            ? '视觉识别未启动，请对照照片手动填写'
            : '没有识别出具体食物，请手动填写';
        this.setData(patch);
    },

    // 收起面板：面板里的内容没有点「加入本餐」就视为放弃，照片一并清掉
    handleSheetClose() {
        if (this.catalogSaving) return;
        this.foodMenuToken=(this.foodMenuToken || 0)+1;
        this.pendingEditingName=null;
        this.setData({unitOpen:false,foodMenuOpen:false,dateOpen:false});
        this.setData(Object.assign({
            manualOpen: false,
            photoPath: '',
            photoSourceText: '',
            formError: '',
        }, this.emptyFormPatch()), () => {
            this.recalcMeal();
        });
    },

    // 从饮食建议 / 食谱库点「记一笔」过来时，整套搭配作为一项直接进清单，用户可以接着加别的。
    // 营养素是算好的真值，三项都标成手动，避免被库外名称的通用供能比覆盖。
    applyPrefill(options) {
        const config = options || {};
        if (config.recipe) {
            const recipe = advice.getRecipe(config.recipe);
            if (!recipe) return;
            const items = advice.buildRecipeLines(recipe).map(line => ({
                key: 'recipe-' + (++itemSeq), name: line.name, unit: line.unit, qty: line.qty,
                qtyText: line.qty + line.unit, perUnit: round1(line.kcal / line.qty),
                kcal: line.kcal, kcalText: units.energyText(line.kcal), protein: line.protein,
                carb: line.carb, fat: line.fat, note: '食谱参考份量',
                manual: {carb:true,protein:true,fat:true},
            }));
            this.setData({items: this.data.items.concat(items), selectedMeal: recipe.meal}, () => this.recalcMeal());
            return;
        }
        const name = safeDecode(config.name).trim();
        if (name === '') {
            return;
        }
        const rawUnit = safeDecode(config.unit);
        const unit = customUnits.valid(customUnits.normalize(rawUnit)) ? customUnits.normalize(rawUnit) : '份';
        const perUnit = units.toKcal(Number(config.kcal));
        const protein = Number(config.p);
        const carb = Number(config.c);
        const fat = Number(config.f);
        const item = {
            nutritionStatus: [protein,carb,fat].every(Number.isFinite) ? 'estimated' : 'incomplete',
            key: 'item-' + (itemSeq += 1),
            name: name,
            unit: unit,
            qty: 1,
            qtyText: '1' + unit,
            perUnit: Number.isFinite(perUnit) && perUnit > 0 ? round1(perUnit) : 0,
            kcal: Number.isFinite(perUnit) && perUnit > 0 ? round1(perUnit) : 0,
            kcalText: Number.isFinite(perUnit) && perUnit > 0 ? units.energyText(perUnit) : '—',
            protein: Number.isFinite(protein) && protein > 0 ? round1(protein) : 0,
            carb: Number.isFinite(carb) && carb > 0 ? round1(carb) : 0,
            fat: Number.isFinite(fat) && fat > 0 ? round1(fat) : 0,
            note: '',
            manual: { carb: true, protein: true, fat: true },
        };
        const patch = {
            items: this.data.items.concat([item]),
            macroHint: '',
            formError: '',
        };
        const meal = config.meal;
        if (meal === 'breakfast' || meal === 'lunch' || meal === 'dinner' || meal === 'snack') {
            patch.selectedMeal = meal;
        }
        this.setData(patch, () => {
            this.recalcMeal();
        });
    },

    loadFoods() {
        const that = this;
        return foodStore.list().then(result => {
            if (result.error) {
                return;
            }
            const recent=result.data.slice(0,8);
            const fallback=['米饭','鸡蛋','鸡胸肉','豆腐','无糖豆浆'].map(name=>{const row=foodDb.findExact(name);return row && Object.assign({},row,{id:'builtin-'+name});}).filter(Boolean);
            const foods = (recent.length ? recent : fallback).map(item => ({
                id: item.id,
                name: item.name,
                kcal: item.kcal,
                unit: item.unit,
                chipText: item.name + ' · 1' + item.unit + ' · ' + units.energyText(item.kcal),
            }));
            that.setData({ foods: foods, personalCatalog: result.data });
            that.loadFoodMenu(result.data);
        });
    },

    handleMealSelect(event) {
        this.manualMealPicked=true;
        this.setData({ selectedMeal: event.currentTarget.dataset.key });
    },

    // 统一设置单位：同步维护 selectedUnit 与下拉选中项。
    setUnit(unit) {
        unit=customUnits.normalize(unit);
        if(!customUnits.valid(unit)) return;
        const options=customUnits.add(unit);
        const index = options.indexOf(unit);
        this.setData({
            unitOptions:options,
            selectedUnit: unit,
            unitIndex: index === -1 ? 0 : index,
            unitOpen: false,
        });
    },

    handleUnitChange(event) {
        const unit = this.data.unitOptions[Number(event.detail.value)];
        if (unit) this.handleUnitPick({ currentTarget: { dataset: { key: unit } } });
    },

    handleUnitToggle() {
        if(this.data.unitOpen){this.setData({unitOpen:false});return;}
        this.setData({foodMenuOpen:false,dateOpen:false});
        wx.createSelectorQuery().select('.kp-unit-wrap').boundingClientRect(rect=>{
            const width=Math.max(rect && rect.width || 70,96);
            this.setData({unitOpen:true,unitMenuPos:{left:rect ? rect.left : 12,top:rect ? rect.bottom+4 : 320,width}});
        }).exec();
    },
    handleUnitInput(event) {this.setData({selectedUnit:event.detail.value,unitOpen:false,formError:''});},
    handleUnitCommit() {
        try {this.setUnit(this.data.selectedUnit);}
        catch(error){this.setData({formError:'单位未能保存，请检查后重试'});}
    },

    handleWeightFieldTap(event) {
        if (this.data.selectedUnit !== '两') this.selectField(event);
    },

    handleUnitPick(event) {
        const key = event.currentTarget.dataset.key;
        if (this.data.unitOptions.indexOf(key) !== -1) {
            const previousBasis = this.formWeightBasis;
            this.setUnit(key);
            if (key === '两') {
                const perGram = foodDb.findByUnit(this.data.formName, '克');
                const basis = previousBasis || (perGram && ['kcal', 'p', 'c', 'f'].every(field => Number.isFinite(perGram[field])) && require('../../utils/food-weight').sanitize({
                    gramsPerUnit: 50, per100g: { kcal: perGram.kcal * 100, protein: perGram.p * 100, carb: perGram.c * 100, fat: perGram.f * 100 },
                }));
                this.formWeightBasis = basis ? Object.assign({}, basis, { gramsPerUnit: 50 }) : null;
                const patch = { formGramsPerUnit: '50', formError: '' };
                if (!this.formWeightBasis) {
                    this.unitKcal = 0;
                    Object.assign(patch, { formKcal: '', formProtein: '', formCarb: '', formFat: '', autoFillHint: '每两为50克，请补充或估算营养' });
                }
                this.setData(patch, () => { if (this.formWeightBasis) this.recalculateWeight(); else this.updateTotal(); });
            } else {
                this.loadWeightBasis((foodDb.findByUnit(this.data.formName, key) || {}).weightBasis);
                if (this.formWeightBasis) this.recalculateWeight();
                this.setData({ formError: '' });
            }
        }
    },

    // 常用食物点一下直接进清单：一份、热量与营养素按库里数据算好，不打断连续添加。
    handleFoodChip(event) {
        const id = event.currentTarget.dataset.id;
        let selected = null;
        for (let i = 0; i < this.data.foods.length; i += 1) {
            if (this.data.foods[i].id === id) {
                selected = this.data.foods[i];
                break;
            }
        }
        if (selected === null) {
            return;
        }
        this.addQuickItem(selected.name, selected.kcal, selected.unit);
    },

    handleNameInput(event) {
        this.formWeightBasis=null;this.setData({formGramsPerUnit:'',pendingCalculation:false});
        const name = event.detail.value;
        this.setData({ formName: name, formError: '' });
        this.showFoodMatches(name);
        this.autoMatch(name);
    },

    // 输入名称后自动匹配内置热量库：完全命中直接填入每份热量、单位与营养素，否则给出候选。
    autoMatch(name) {
        if (typeof name !== 'string' || name.trim() === '') {
            this.setData({ suggestions: [], autoFillHint: '' });
            this.applyAutoMacro({ name: '', kcal: '', qty: this.data.formQty });
            return;
        }
        const exact = require('../../utils/nutrition').lookup(name) || foodDb.findExact(name);
        if (exact !== null) {
            this.resetManualState();
            // 记住这份食物的单位热量：数量重填时据此把热量和营养素补回来
            this.unitKcal = exact.kcal;
            this.loadWeightBasis(exact.weightBasis);
            this.setData({
                suggestions: [],
                formKcal: inputEnergy(exact.kcal),
                autoFillHint: (exact.source === 'usda' ? 'USDA 数据，家庭份量为估算；已按「' : exact.source === 'personal' ? '个人确认数据；已按「' : '家庭份量估算；已按「') + exact.name + ' 1' + exact.unit + ' ≈ ' + units.energyText(exact.kcal) + '」自动填入，可修改',
            }, () => {
                this.setUnit(exact.unit);
                this.updateTotal();
                this.applyAutoMacro({ name: exact.name, kcal: exact.kcal, qty: this.data.formQty });
            });
            return;
        }
        const matches = foodDb.searchFoods(name).map(item => ({
            name: item.name,
            unit: item.unit,
            kcal: item.kcal,
            chipText: item.name + ' · 1' + item.unit + ' ≈ ' + units.energyText(item.kcal),
        }));
        this.setData({ suggestions: matches, autoFillHint: '' });
        this.applyAutoMacro({ name: name, kcal: units.toKcal(this.data.formKcal), qty: this.data.formQty });
    },

    // 输入候选与下拉选项一样先回填，核对后由用户加入本餐。
    handleSuggestion(event) {
        this.handlePickFood(event);
    },

    handleQtyInput(event) {
        this.setData({ formQty: event.detail.value, keypadValue: event.detail.value, pendingCalculation: false, formError: '' }, () => {
            this.syncQtyDerived();
        });
    },

    handleKcalInput(event) {
        const typed = units.toKcal(event.detail.value);
        if (Number.isFinite(typed) && typed > 0) {
            this.unitKcal = typed;
        }
        this.setData({ formKcal: event.detail.value, formError: '', autoFillHint: '' }, () => {
            this.updateTotal();
            this.applyAutoMacro({ name: this.data.formName, kcal: this.resolvePerUnit(), qty: this.data.formQty });
        });
    },

    // 按食物品种与每份热量自动拆分三大营养素（碳水 / 蛋白 / 脂肪）。
    // 已手填的项不会被覆盖，未填的项随名称 / 份量 / 热量自动重算。
    applyAutoMacro(options) {
        const source = options || {};
        const manual = this.ensureManualState();
        if (manual.carb && manual.protein && manual.fat) {
            return;
        }
        const name = typeof source.name === 'string' ? source.name.trim() : '';
        const rawPerUnit = Number(source.kcal);
        // 热量输入框被清空时用这道菜的单位热量兜底，数量一填就能算出全部数值
        const perUnit = Number.isFinite(rawPerUnit) && rawPerUnit > 0 ? rawPerUnit : this.resolvePerUnit();
        const count = Number(source.qty);
        if (!Number.isFinite(count) || count <= 0) {
            this.clearAutoMacro(manual);
            return;
        }
        const qty = count;
        // 单字名称只在命中成分库时才算（「虾」「鱼」「梨」），避免打字过程中乱猜。
        const known = name !== '' && foodDb.findExact(name) !== null;
        const usable = (name.length >= 2 || known) && Number.isFinite(perUnit) && perUnit > 0;

        const local = usable ? require('../../utils/nutrition').lookup(name,this.data.selectedUnit) : null;
        const estimate = local && ['p','c','f'].every(key=>Number.isFinite(local[key])) ? {p:local.p*perUnit/local.kcal,c:local.c*perUnit/local.kcal,f:local.f*perUnit/local.kcal,source:'table',matchedName:local.name} : usable ? foodDb.findMacro(name, perUnit) : null;
        if (estimate === null) {
            this.clearAutoMacro(manual);
            return;
        }

        const hasManual = manual.carb || manual.protein || manual.fat;
        const patch = { macroHint: this.buildMacroHint(estimate, name, qty, hasManual) };
        if (!manual.carb) {
            patch.formCarb = formatMacro(estimate.c * qty);
        }
        if (!manual.protein) {
            patch.formProtein = formatMacro(estimate.p * qty);
        }
        if (!manual.fat) {
            patch.formFat = formatMacro(estimate.f * qty);
        }
        this.setData(patch);
    },

    ensureManualState() {
        if (!this.macroManual || typeof this.macroManual !== 'object') {
            this.macroManual = { carb: false, protein: false, fat: false };
        }
        return this.macroManual;
    },

    // 换一道菜时重新跟随自动估算。
    resetManualState() {
        this.formWeightBasis=null;this.setData({formGramsPerUnit:'',pendingCalculation:false});
        this.macroManual = { carb: false, protein: false, fat: false };
    },

    clearAutoMacro(manual) {
        const patch = {};
        if (!manual.carb) {
            patch.formCarb = '';
        }
        if (!manual.protein) {
            patch.formProtein = '';
        }
        if (!manual.fat) {
            patch.formFat = '';
        }
        patch.macroHint = '';
        this.setData(patch);
    },

    buildMacroHint(estimate, name, qty, hasManual) {
        const prefix = qty > 1 ? '合计 ' : '';
        const detail = prefix
            + '碳水 ' + formatMacro(estimate.c * qty) + 'g'
            + ' · 蛋白 ' + formatMacro(estimate.p * qty) + 'g'
            + ' · 脂肪 ' + formatMacro(estimate.f * qty) + 'g';
        const verb = hasManual ? '补齐未填项：' : '填入：';
        if (estimate.source === 'table') {
            return '已按「' + estimate.matchedName + '」参考估算' + verb + detail;
        }
        if (estimate.source === 'similar') {
            return '按相近的「' + estimate.matchedName + '」换算' + verb + detail;
        }
        if (estimate.source === 'category') {
            return '库里没有「' + name + '」，按' + estimate.matchedName + '类供能比' + verb + detail;
        }
        return '按通用供能比' + verb + detail + '，建议按包装标示修改';
    },

    updateTotal() {
        const qty = Number(this.data.formQty);
        const perUnit = this.resolvePerUnit();
        if (Number.isFinite(qty) && qty > 0 && perUnit > 0) {
            this.setData({ totalKcalText: '≈ ' + units.energyText(qty * perUnit) });
        } else {
            this.setData({ totalKcalText: '' });
        }
    },

    // 手动改过的那一项不再被覆盖，其余项继续随食物与份量自动重算，避免「改了蛋白，碳水还按 1 份算」。
    handleMacroInput(key, value) {
        this.formWeightBasis=null;this.setData({formGramsPerUnit:''});
        const fieldMap = { formCarb: 'carb', formProtein: 'protein', formFat: 'fat' };
        const manual = this.ensureManualState();
        manual[fieldMap[key]] = true;
        const patch = {};
        patch[key] = value;
        this.setData(patch, () => {
            this.applyAutoMacro({ name: this.data.formName, kcal: this.resolvePerUnit(), qty: this.data.formQty });
        });
    },

    handleProteinInput(event) {
        this.handleMacroInput('formProtein', event.detail.value);
    },

    handleCarbInput(event) {
        this.handleMacroInput('formCarb', event.detail.value);
    },

    handleFatInput(event) {
        this.handleMacroInput('formFat', event.detail.value);
    },

    // 每份热量：以输入框为准；清空后回落到这道菜记下的单位热量，
    // 这样「数量清空 → 重填」时热量与营养素都能自己长回来。
    resolvePerUnit() {
        const typed = units.toKcal(this.data.formKcal);
        if (Number.isFinite(typed) && typed > 0) {
            return typed;
        }
        const cached = Number(this.unitKcal);
        return Number.isFinite(cached) && cached > 0 ? cached : 0;
    },

    // 数量是「上游」：一改就把热量（缺则补回每份值）与全部营养素重算一遍。
    // 数量被清空时，合计与自动算出来的营养素一起清掉，不留上一份的残值。
    syncQtyDerived() {
        if(this.formWeightBasis){this.recalculateWeight();return;}
        const qty = Number(this.data.formQty);
        const valid = Number.isFinite(qty) && qty > 0;
        const patch = {};

        if (!valid) {
            const manual = this.ensureManualState();
            if (!manual.carb) {
                patch.formCarb = '';
            }
            if (!manual.protein) {
                patch.formProtein = '';
            }
            if (!manual.fat) {
                patch.formFat = '';
            }
            patch.macroHint = '';
            patch.totalKcalText = '';
            this.setData(patch);
            return;
        }

        const perUnit = this.resolvePerUnit();
        if (String(this.data.formKcal).trim() === '' && perUnit > 0) {
            patch.formKcal = inputEnergy(perUnit);
        }
        this.setData(patch, () => {
            this.updateTotal();
            this.applyAutoMacro({ name: this.data.formName, kcal: this.resolvePerUnit(), qty: this.data.formQty });
        });
    },

    // ---------- 备注弹窗（挂在名称行，点开再写） ----------
    handleOpenNote() {
        this.setData({ noteOpen: true, noteDraft: this.data.formNote });
    },

    handleNoteDraft(event) {
        this.setData({ noteDraft: event.detail.value });
    },

    handleNoteCancel() {
        this.setData({ noteOpen: false, noteDraft: this.data.formNote });
    },

    handleNoteSave() {
        const note = typeof this.data.noteDraft === 'string' ? this.data.noteDraft.trim() : '';
        this.setData({ noteOpen: false, formNote: note, noteLabel: noteLabelOf(note) });
    },

    // ---------- 常见食物下拉（按用户记录频率排序） ----------
    // 与单位共用悬浮层样式，列表锚定食物输入框，不挤占键盘空间。
    handleFoodFocus() { this.showFoodMatches(this.data.formName); },
    handleFoodKeyboardChange() {
        if(this.data.foodMenuOpen)this.showFoodMatches(this.data.formName);
    },
    showFoodMatches(name) {
        const query=typeof name==='string' ? name.trim() : '';
        const rows=query ? foodDb.searchFoods(query).map(row=>({name:row.name,unit:row.unit,kcal:row.kcal,metaText:portionText(row)})) : (this.baseFoodMenu || this.buildFoodMenu([],{},{}));
        const token=(this.foodMenuToken || 0)+1;this.foodMenuToken=token;
        clearTimeout(this.foodSearchTimer);
        if(query.length>=2) this.foodSearchTimer=setTimeout(()=>{
            require('../../utils/builtin-ai').searchFoods(query).then(foods=>{
                if(this.disposed || token!==this.foodMenuToken || !this.data.foodMenuOpen)return;
                const extra=[];
                foods.forEach(food=>{
                    const p=food.per100;
                    if(food.unit!=='g' || !p || !['kcal','protein','carb','fat'].every(k=>Number.isFinite(p[k]) && p[k]>=0))return;
                    if(rows.some(row=>row.name===food.name))return;
                    // 库里存了份量就按「一份」列出：620 克的一盘盖饭按 100 克给量会低估六倍。
                    const portion=Number(food.serving_g);
                    const grams=portion>0 && portion<=10000 ? portion : 1;
                    const unit=grams>1 ? '份' : '克';
                    const scale=grams/100;
                    if(!(p.kcal*scale>0))return;
                    const entry={name:food.name,unit,grams,kcal:p.kcal*scale,p:p.protein*scale,c:p.carb*scale,f:p.fat*scale,source:'local',
                        portionHint:'食库参考'+(food.serving_label?' · '+food.serving_label:''),weightBasis:{gramsPerUnit:grams,per100g:p}};
                    if(!foodDb.findByUnit(food.name,unit))foodDb.FOOD_DB.push(entry);
                    extra.push({name:food.name,unit,kcal:entry.kcal,metaText:grams>1?'食库参考 · 一份约'+Math.round(grams)+'克':'食库参考 · 按克记录'});
                });
                const merged=rows.concat(extra);
                this.setData({foodMenu:merged,foodMenuHeight:Math.min(Math.max(merged.length,1),3)*88});
            }).catch(()=>{});
        },350);
        const apply=rect=>{
            if(this.disposed || token!==this.foodMenuToken)return;
            this.setData({foodMenuOpen:true,unitOpen:false,dateOpen:false,foodMenu:rows,foodMenuQuery:query,
                foodMenuHeight:Math.min(Math.max(rows.length,1),3)*88,
                foodMenuPos:rect && rect.width>0 ? {left:rect.left,top:rect.bottom+4,width:rect.width} : {left:12,top:320,width:260}});
        };
        if(typeof wx.createSelectorQuery==='function')wx.createSelectorQuery().select('.kp-name-wrap').boundingClientRect(apply).exec();
        else apply(null);
    },
    handleCloseFoodMenu() {
        this.foodMenuToken=(this.foodMenuToken || 0)+1;
        this.setData({foodMenuOpen:false});
    },
    handleToggleFoodMenu() {
        if(this.data.foodMenuOpen){this.handleCloseFoodMenu();return;}
        this.showFoodMatches(this.data.formName);
    },

    // 下拉里点一项：名称、每份热量、单位一起填好，营养素按成分表算
    handlePickFood(event) {
        const name = event.currentTarget.dataset.name;
        const unit = event.currentTarget.dataset.unit;
        const kcal = Number(event.currentTarget.dataset.kcal);
        if (typeof name !== 'string' || name.trim() === '' || !Number.isFinite(kcal) || kcal <= 0) {
            return;
        }
        this.foodMenuToken=(this.foodMenuToken || 0)+1;
        this.resetManualState();
        this.unitKcal = kcal;
        this.loadWeightBasis((foodDb.findByUnit(name,unit)||{}).weightBasis);
        const qty = this.data.formQty;
        this.setData({
            formName: name,
            formKcal: inputEnergy(kcal),
            formNote: this.data.formNote,
            foodMenuOpen: false,
            suggestions: [],
            autoFillHint: '已按「' + name + ' 1' + unit + ' ≈ ' + units.energyText(kcal) + '」自动填入，可修改',
            manualOpen: true,
            activeField: 'formQty',
            keypadValue: String(qty === '' ? '' : qty),
        }, () => {
            this.setUnit(unit);
            this.updateTotal();
            this.applyAutoMacro({ name: name, kcal: kcal, qty: qty });
        });
    },

    // 下拉内容：先按用户吃过的次数排（记录 + 常用食物库），不够再拿内置库最常见的补齐
    buildFoodMenu(foods, recordCounts, recordHints) {
        const counts = recordCounts || {};
        const hints = recordHints || {};
        const unitOf = {};
        const kcalOf = {};
        for (let i = 0; i < foods.length; i += 1) {
            const food = foods[i];
            unitOf[food.name] = food.unit;
            kcalOf[food.name] = food.kcal;
            counts[food.name] = Math.max(counts[food.name] || 0, food.count || 0);
        }

        const names = Object.keys(counts).filter(name => counts[name] > 0);
        for (let i = 0; i < COMMON_FOOD_NAMES.length; i += 1) {
            const name = COMMON_FOOD_NAMES[i];
            if (counts[name] === undefined) {
                counts[name] = 0;
                names.push(name);
            }
        }
        // 次数高的在前，同次数保持「最近用过」的顺序（foodStore 读出来就是最近优先）
        names.sort((left, right) => (counts[right] || 0) - (counts[left] || 0));

        const menu = [];
        for (let i = 0; i < names.length && menu.length < FOOD_MENU_LIMIT; i += 1) {
            const name = names[i];
            const row = foodDb.findExact(name);
            // 自定义食物（库里没有）用记录里最近一次的每份热量兜底，别把用户吃过的丢掉
            const hint = hints[name];
            const kcal = kcalOf[name] !== undefined ? kcalOf[name] : (hint ? hint.kcal : (row ? row.kcal : 0));
            if (!Number.isFinite(kcal) || kcal <= 0) {
                continue;
            }
            const unit = unitOf[name] || (hint ? hint.unit : '') || (row ? row.unit : '份');
            menu.push({
                name: name,
                unit: unit,
                kcal: kcal,
                hot: (counts[name] || 0) >= 2,
                metaText: portionText(Object.assign({}, foodDb.findByUnit(name, unit) || {}, foods.find(food => food.name === name && food.unit === unit) || {}, { name, unit })),
            });
        }
        return menu;
    },

    // 记录里出现过的食物名次数，作为「吃得多不多」的依据（含导入的旧数据）；
    // 顺手记下每个名字最近一次的每份热量与单位，自定义食物也能进下拉。
    loadFoodMenu(foods) {
        const that = this;
        const counts = {};
        const hints = {};
        recordStore.list().then(result => {
            if (!result.error) {
                for (let i = 0; i < result.data.length; i += 1) {
                    const row = result.data[i];
                    const name = typeof row.name === 'string' ? row.name.trim() : '';
                    if (name === '') {
                        continue;
                    }
                    counts[name] = (counts[name] || 0) + 1;
                    const kcal = Number(row.kcal);
                    const qty = Number(row.qty);
                    if (!Number.isFinite(kcal) || kcal <= 0 || hints[name] !== undefined) {
                        continue;
                    }
                    const perUnit = Number.isFinite(qty) && qty > 0 ? kcal / qty : kcal;
                    hints[name] = {
                        kcal: Math.round(perUnit * 10000) / 10000,
                        unit: typeof row.unit === 'string' && row.unit !== '' ? row.unit : '份',
                    };
                }
            }
            const menu = that.buildFoodMenu(foods, counts, hints);
            that.baseFoodMenu=menu;
            if(that.data.foodMenuOpen){that.showFoodMatches(that.data.formName);return;}
            // scroll-view 需要显式高度才能滚：最多露 5 行（每行 88rpx），不足 5 行按实际收；空列表留一行高放提示
            that.setData({
                foodMenu: menu,
                foodMenuHeight: Math.min(Math.max(menu.length, 1), 5) * 88,
            });
        });
    },

    // ---------- 本餐清单 ----------

    // 表单 → 清单项。校验不过返回 error，供「加入本餐」和「保存本餐」共用。
    buildItemFromForm() {
        const name = this.data.formName.trim();
        const qty = Number(this.data.formQty);
        const perUnit = units.toKcal(this.data.formKcal);
        const hasInput = name !== '' || String(this.data.formKcal).trim() !== '';

        if (name === '') {
            return { item: null, error: '请填写食物名称', hasInput: hasInput };
        }
        const unit=customUnits.normalize(this.data.selectedUnit);
        if(!customUnits.valid(unit)) return {item:null,error:'请填写 1–8 个字的有效单位',hasInput};
        if (!Number.isFinite(qty) || qty <= 0) {
            return { item: null, error: '请填写有效的数量', hasInput: hasInput };
        }
        if(this.formWeightBasis&&!(Number(this.data.formGramsPerUnit)>0&&Number(this.data.formGramsPerUnit)<=10000))return {item:null,error:'请填写有效的每单位克重',hasInput};
        if (!Number.isFinite(perUnit) || perUnit <= 0) {
            return { item: null, error: '请填写每份的有效卡路里', hasInput: hasInput };
        }

        const manual = this.ensureManualState();
        try {this.setUnit(unit);} catch(error){return {item:null,error:'单位未能保存，请检查后重试',hasInput};}
        const estimate = estimateMacro(name, perUnit, unit);
        const item = {
            weightBasis:require('../../utils/food-weight').sanitize(this.formWeightBasis),
            nutritionStatus: ['formProtein','formCarb','formFat'].every(key=>String(this.data[key]).trim()!=='') || (foodDb.findByUnit(name,unit) && ['p','c','f'].every(key=>Number.isFinite(foodDb.findByUnit(name,unit)[key]))) ? 'estimated' : 'incomplete',
            key: 'item-' + (itemSeq += 1),
            name: name,
            unit: this.data.selectedUnit,
            qty: round1(qty),
            qtyText: formatMacro(qty) + this.data.selectedUnit,
            perUnit: Math.round(perUnit*10000)/10000,
            kcal: round1(qty * perUnit),
            kcalText: units.energyText(qty * perUnit),
            carb: resolveMacroValue(this.data.formCarb, estimate.c * qty),
            protein: resolveMacroValue(this.data.formProtein, estimate.p * qty),
            fat: resolveMacroValue(this.data.formFat, estimate.f * qty),
            note: this.data.formNote.trim(),
            manual: { carb: !!manual.carb, protein: !!manual.protein, fat: !!manual.fat },
        };
        if(item.weightBasis){item.note=[item.note.replace(/(?:AI)?参考(?:1|每)[^；]*g/g,'').replace(/^[；\s]+|[；\s]+$/g,''),'参考每'+item.unit+item.weightBasis.gramsPerUnit+'g，共'+formatMacro(item.weightBasis.gramsPerUnit*item.qty)+'g'].filter(Boolean).join('；');}
        if(item.nutritionStatus==='incomplete'){for(const key of ['protein','carb','fat']){const field='form'+key[0].toUpperCase()+key.slice(1);if(String(this.data[field]).trim()==='')item[key]=null;}}
        return { item: item, error: '', hasInput: true };
    },

    // 常用食物 / 建议直接入单：一份，营养素按库估算。
    addQuickItem(name, perUnit, unit) {
        const kcal = Math.round(perUnit*10000)/10000;
        if (kcal <= 0) {
            return;
        }
        const estimate = estimateMacro(name, kcal, unit);
        const unitText = customUnits.valid(customUnits.normalize(unit)) ? customUnits.normalize(unit) : '份';
        const item = {
            nutritionStatus: foodDb.findByUnit(name,unit) && ['p','c','f'].every(key=>Number.isFinite(foodDb.findByUnit(name,unit)[key])) ? 'estimated' : 'incomplete',
            key: 'item-' + (itemSeq += 1),
            name: name,
            unit: unitText,
            qty: 1,
            qtyText: '1' + unitText,
            perUnit: kcal,
            kcal: kcal,
            kcalText: units.energyText(kcal),
            carb: round1(estimate.c),
            protein: round1(estimate.p),
            fat: round1(estimate.f),
            note: '',
            manual: { carb: false, protein: false, fat: false },
        };
        if(item.nutritionStatus==='incomplete')for(const key of ['protein','carb','fat'])item[key]=null;
        const items = this.data.items.concat([item]);
        const patch = { items: items, formError: '', confirmClear: false };
        // 正在修改某一项时点常用食物，视为放弃修改，回到新增状态。
        if (this.data.editingIndex >= 0) {
            Object.assign(patch, this.emptyFormPatch());
        }
        this.setData(patch, () => {
            this.recalcMeal();
        });
    },

    handleAddItem() {
        if (this.catalogSaving || (this.data.catalogAdding && this.data.nutritionEstimating)) return;
        if(!this.finishKeypadCalculation())return;
        const built = this.buildItemFromForm();
        if (built.item === null) {
            this.setData({ formError: built.error });
            return;
        }
        if (this.pendingEditingName) {
            const pending=(this.data.pendingFoods || []).slice(),index=pending.findIndex(row=>JSON.stringify([row.name,row.unit,row.qty,row.reason])===this.pendingEditingSignature);
            if(index<0){this.setData({formError:'待补全项已变化，请重新选择'});return;}pending.splice(index,1);this.setData({pendingFoods:pending});
            this.pendingEditingName=null;
        }
        const editing = this.data.editingIndex;
        if (this.data.catalogAdding) built.item.skipFoodLearning = true;
        let items;
        if (editing >= 0 && editing < this.data.items.length) {
            // 更新：保留原来的 key，清单顺序不变。
            items = this.data.items.slice();
            const previous = items[editing];
            items[editing] = Object.assign({}, built.item, {
                key: previous.key, skipFoodLearning: previous.skipFoodLearning,
            });
        } else {
            items = this.data.items.concat([built.item]);
        }
        this.setData(Object.assign({
            items: items,
            confirmClear: false,
            manualOpen: false,
            photoPath: '',
            photoSourceText: '',
        }, this.emptyFormPatch()), () => {
            this.recalcMeal();
        });
    },

    // 点清单行：回填到表单继续改，按钮变成「更新这一项」。
    handleEditItem(event) {
        const index = Number(event.currentTarget.dataset.index);
        const item = this.data.items[index];
        if (!item) {
            return;
        }
        this.unitKcal = item.perUnit;
        this.loadWeightBasis(item.weightBasis);
        this.macroManual = {
            carb: !!(item.manual && item.manual.carb),
            protein: !!(item.manual && item.manual.protein),
            fat: !!(item.manual && item.manual.fat),
        };
        this.setData({
            formName: item.name,
            formQty: String(item.qty),
            formKcal: inputEnergy(item.perUnit),
            formCarb: item.nutritionStatus==='incomplete' ? '' : formatMacro(item.carb),
            formProtein: item.nutritionStatus==='incomplete' ? '' : formatMacro(item.protein),
            formFat: item.nutritionStatus==='incomplete' ? '' : formatMacro(item.fat),
            formNote: item.note,
            noteLabel: noteLabelOf(item.note),
            noteDraft: item.note,
            selectedUnit: item.unit,
            unitIndex: Math.max(0, this.data.unitOptions.indexOf(item.unit)),
            unitOpen: false,
            editingIndex: index,
            manualOpen: true,
            activeField: 'formQty',
            keypadValue: String(item.qty),
            suggestions: [],
            autoFillHint: '',
            macroHint: '',
            formError: '',
            totalKcalText: '≈ ' + units.energyText(item.kcal),
        });
    },

    handleCancelEdit() {
        this.setData(Object.assign({
            formError: '',
            manualOpen: false,
            photoPath: '',
            photoSourceText: '',
        }, this.emptyFormPatch()), () => {
            this.recalcMeal();
        });
    },

    // 清单内的删除只是从草稿里移掉，还没写存储，所以不需要二次确认。
    handleRemoveItem(event) {
        const index = Number(event.currentTarget.dataset.index);
        if (!Number.isFinite(index) || index < 0 || index >= this.data.items.length) {
            return;
        }
        const items = this.data.items.slice();
        items.splice(index, 1);
        const patch = { items: items, formError: '' };
        const editing = this.data.editingIndex;
        if (editing === index) {
            Object.assign(patch, this.emptyFormPatch());
        } else if (editing > index) {
            patch.editingIndex = editing - 1;
        }
        this.setData(patch, () => {
            this.recalcMeal();
        });
    },

    // 清空本餐：预览环境没有 showModal，沿用项目里的内联二次确认（3 秒后自动复位）。
    handleClearMeal() {
        if (this.data.confirmClear) {
            this.clearClearTimer();
            this.setData(Object.assign({ items: [], confirmClear: false }, this.emptyFormPatch()), () => {
                this.recalcMeal();
            });
            return;
        }
        this.setData({ confirmClear: true });
        this.clearClearTimer();
        this.clearTimer = setTimeout(() => {
            this.setData({ confirmClear: false });
        }, 3000);
    },

    clearClearTimer() {
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
            this.clearTimer = null;
        }
    },

    // 清空添加区，保留餐次与单位。
    emptyFormPatch() {
        this.resetManualState();
        // 记住的单位热量一起清掉，下一道菜别继承上一道菜的数
        this.unitKcal = 0;
        return {
            catalogAdding: '',
            formName: '',
            formKcal: '',
            formQty: '1',
            formGramsPerUnit:'',
            pendingCalculation:false,
            formProtein: '',
            formCarb: '',
            formFat: '',
            formNote: '',
            noteLabel: '备注',
            noteDraft: '',
            noteOpen: false,
            foodMenuOpen: false,
            suggestions: [],
            autoFillHint: '',
            macroHint: '',
            totalKcalText: '',
            editingIndex: -1,
        };
    },

    recalcMeal() {
        const items = this.data.items;
        let kcal = 0;
        let carb = 0;
        let protein = 0;
        let fat = 0;
        for (let i = 0; i < items.length; i += 1) {
            kcal += items[i].kcal;
            carb += items[i].carb;
            protein += items[i].protein;
            fat += items[i].fat;
        }
        const count = items.length;
        this.setData({
            itemsCount: count,
            mealTotalKcalText: count > 0 ? units.energyText(kcal) : '',
            mealMacroText: items.some(item=>item.nutritionStatus==='incomplete') ? '部分食物营养未补全，营养合计暂不完整' : count > 0
                ? '碳水 ' + formatMacro(carb) + 'g · 蛋白 ' + formatMacro(protein) + 'g · 脂肪 ' + formatMacro(fat) + 'g'
                : '',
            mealAiEstimated:items.some(item=>item.aiEstimated || /AI.*估算|AI.*照片/.test(item.note || '')),
            saveButtonText: count > 0 ? '保存本餐（' + count + ' 样）' : '保存',
        });
    },

    handleRemovePhoto() {
        this.setData({ photoPath: '', photoSourceText: '' });
    },

    // 有内容没保存就退出：保存整餐是显式动作，这里只做轻提示，不拦截。
    handleCancel() {
        if(this.data.submitting)return;
        wx.navigateBack();
    },

    // 偏好设置为「留在本页」时，清空清单继续记下一餐，餐次保留。
    resetForNext() {
        this.foodLearningItems=null;this.setData({foodLearningPending:false});
        this.voiceRequestToken=null;this.voiceSourceNote=null;
        this.setData({voiceRecognizing:false,voiceStage:'idle',voiceStatusText:'',voiceTranscript:'',voiceTranscriptOpen:false});
        this.voiceContextApplied=false;
        this.manualDatePicked=false;
        this.manualMealPicked=false;
        this.clearClearTimer();
        this.setData(Object.assign({
            items: [],
            pendingFoods: [],
            multipleVoiceMeals: false,
            voiceHint: '',
            voiceNote: {path:'',duration:0},
            formError: '',
            submitting: false,
            confirmClear: false,
            // 连续记录时餐次跟着当前时段走：跨到下一餐的时段就自动切过去
            selectedMeal: advice.mealOfHour(new Date().getHours()),
        }, this.emptyFormPatch()), () => {
            this.recalcMeal();
        });
    },

    // 保存本餐：清单里每一项写一条记录，共用同一个 batchId。
    // 表单里填了但没点「加入本餐」的内容一并计入，避免用户以为存了却没存。
    handleSave() {
        if(!this.finishKeypadCalculation())return;
        if(this.data.foodLearningPending){if(!this.data.submitting)return this.learnSavedMeal(this.foodLearningItems);return;}
        if(this.data.voiceRecognizing || this.data.recognizing || this.data.nutritionEstimating){this.setData({formError:'请等待识别或估算完成后再保存'});return;}
        if(!this.data.itemsCount && !this.data.manualOpen && !this.data.formName){this.setData({formError:'先添加一样食物再保存'});return;}
        if ((this.data.pendingFoods || []).length || this.data.multipleVoiceMeals) {
            this.setData({formError:this.data.multipleVoiceMeals ? '这段录音涉及多餐，请分别记录并移除这条语音便签' : '还有未补全的食物，请补全或明确移除后保存'});
            return;
        }
        if (this.data.submitting) {
            return;
        }
        const built = this.buildItemFromForm();
        if (built.item === null && built.hasInput) {this.setData({formError:built.error});return;}
        let items = this.data.items.slice();

        if (built.item !== null) {
            const editing = this.data.editingIndex;
            if (editing >= 0 && editing < items.length) {
                items[editing] = Object.assign({}, built.item, { key: items[editing].key });
            } else {
                items = items.concat([built.item]);
            }
        } else if (items.length === 0) {
            this.setData({ formError: built.error });
            return;
        }

        if (items.length === 0) {
            this.setData({ formError: '先加一样食物再保存' });
            return;
        }

        this.setData({ submitting: true, formError: '' });
        this.saveItems(items).then(result => {
            if (result.error) {
                this.setData({ submitting: false, formError: result.message || '保存失败，请重试' });
                return;
            }
            return this.learnSavedMeal(items);
        });
    },

    learnSavedMeal(items){
        this.foodLearningItems=items;
        this.setData({submitting:true,formError:''});
        const rows=items.filter(item=>!item.skipFoodLearning).map(item=>({weightBasis:item.weightBasis,name:item.name,kcal:item.perUnit,unit:item.unit,nutrition:item.nutritionStatus==='incomplete'?null:{p:item.protein/item.qty,c:item.carb/item.qty,f:item.fat/item.qty}}));
        if (!rows.length) {
            this.foodLearningItems = null;
            this.finishSave(items);
            return Promise.resolve();
        }
        return foodStore.upsertMany(rows).then(result=>{
            if(this.disposed)return;
            if(result.error){this.setData({submitting:false,foodLearningPending:true,formError:'本餐已保存，但食物库未能更新。请点击重试，不会重复保存本餐。'});return;}
            this.setData({foodLearningPending:false});this.foodLearningItems=null;this.finishSave(items);
        });
    },

    // 保存成功的收尾：补记到过去某天就跳到「历史」让用户看见那条记录，
    // 否则回首页（首页只显示今天，补记的记录在那儿看不到）。
    finishSave(items) {
        const backdated = this.data.datePicked;
        if(!backdated) getApp().globalData.mascotEvent={kind:'success',time:Date.now()};
        const label = this.data.dateLabel;
        const text = backdated
            ? '已补记到 ' + label
            : '已记 ' + items.length + ' 样';
        wx.showToast({ title: text, icon: backdated ? 'none' : 'success' });
        if (settings.getAfterSave() === 'stay') {
            this.resetForNext();
            return;
        }
        setTimeout(() => {
            if (backdated) {
                wx.redirectTo({ url: '/pages/history/history' });
                return;
            }
            wx.navigateBack();
        }, 600);
    },

    // 串行写入，任意一条失败就把已写进去的删掉，保证「一餐」不会只存半截。
    saveItems(items) {
        const date = this.currentDate();
        const meal = this.data.selectedMeal;
        const batchId = buildBatchId();
        const createdAt = this.buildCreatedAt();
        const voicePath = this.data.voiceNote.path || '';
        const savedIds = [];
        let chain = Promise.resolve();

        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            const payload = {
                date: date,
                meal: meal,
                name: item.name,
                kcal: item.kcal,
                protein: item.protein,
                carb: item.carb,
                fat: item.fat,
                unit: item.unit,
                qty: item.qty,
                note: item.note,
                nutritionStatus: item.nutritionStatus || 'estimated',
                timeKnown: !this.voiceContextApplied && !this.data.voiceNote.path && !this.data.datePicked,
                batchId: batchId,
                createdAt: createdAt,
                voice: voicePath,
            };
            chain = chain.then(() => recordStore.create(payload).then(result => {
                if (result.error) {
                    const error = result.error;
                    error.message = error.message || '保存失败，请重试';
                    return Promise.reject(error);
                }
                savedIds.push(result.data.id);
            }));
        }

        return chain.then(() => ({ ids: savedIds, error: null })).catch(error => {
            return this.rollback(savedIds).then(() => ({
                ids: [],
                error: { message: (error && error.message) || '保存失败，请重试' },
            }));
        });
    },

    rollback(ids) {
        if (!ids || ids.length === 0) {
            return Promise.resolve();
        }
        return Promise.all(ids.map(id => recordStore.remove(id))).then(() => undefined).catch(() => undefined);
    },
}));
