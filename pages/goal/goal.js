const {withTheme}=require('../../utils/theme');
const settings = require('../../utils/settings.js');
const units = require('../../utils/units.js');

// Mifflin-St Jeor 公式：BMR = 10*kg + 6.25*cm - 5*age + (男 +5 / 女 -161)
// label 是下拉里显示的完整名称（久坐不动 / 轻度活动 …），模板不再拼「活动」后缀
const ACTIVITIES = [
    { key: 'sedentary', label: '久坐不动', factor: 1.2, desc: '几乎不运动' },
    { key: 'light', label: '轻度活动', factor: 1.375, desc: '每周运动 1-3 次' },
    { key: 'moderate', label: '中度活动', factor: 1.55, desc: '每周运动 3-5 次' },
    { key: 'high', label: '高度活动', factor: 1.725, desc: '每周运动 6-7 次' },
];

const GOAL_TYPES = [
    { key: 'lose', label: '减脂', adjust: -500 },
    { key: 'keep', label: '维持', adjust: 0 },
    { key: 'gain', label: '增肌', adjust: 300 },
];

const MIN_KCAL = 1200;
const KEYPAD_FIELDS = {
    ageText: { label: '年龄', unit: '岁', max: 3, decimal: false },
    heightText: { label: '身高', max: 5, decimal: true },
    weightText: { label: '体重', max: 6, decimal: true },
    waterGoalText: { label: '每日饮水', unit: 'ml', max: 4, decimal: false },
};
const KEYPAD_ORDER = ['ageText', 'heightText', 'weightText', 'waterGoalText'];

Page(withTheme({
    data: {
        activities: ACTIVITIES,
        goalTypes: GOAL_TYPES,
        sex: 'female',
        ageText: '',
        heightText: '',
        weightText: '',
        selectedActivity: 'light',
        selectedGoal: 'lose',
        waterGoalText: '1500',
        weightUnit: 'kg',
        weightPlaceholder: '如 60.5',
        energyUnit: 'kcal',
        result: null,
        error: '',
        showBasis: false,
        currentGoalText: '',
        currentGoalValue:'2000',
        currentTargets:{carb:225,protein:125,fat:67},
        activityIndex: 1,
        activityOpen: false,
        unitMode: 'metric',
        inputWeightKey: 'kg',
        heightUnit: 'cm',
        keypadField: '',
        keypadLabel: '',
        keypadUnit: '',
        keypadDecimal: false,
        keypadReplace: false,
    },

    onLoad() {
        let profile = settings.getProfile();
        try{const latest=require('../../utils/body-measurements').current().kg;if(latest.value)profile=Object.assign({},profile || {},{weight:latest.value});}catch(error){}
        const currentGoal=settings.getGoal();
        // 单位和提示语不依赖档案，没填过档案也要显示，否则「当前体重 ()」是空括号。
        const unitKey = units.getWeightUnit();
        this.setData({
            weightUnit: units.weightUnitLabel(),
            inputWeightKey:unitKey,
            unitMode:unitKey==='lb'?'imperial':'metric',
            heightUnit:unitKey==='lb'?'in':'cm',
            weightPlaceholder: unitKey === 'jin' ? '如 121' : (unitKey === 'lb' ? '如 133' : '如 60.5'),
            energyUnit: units.energyUnitLabel(),
            adjustHint: '减脂每日约减少 ' + units.energyText(500) + ' 缺口，增肌约增加 ' + units.energyText(300) + ' 盈余',
            minHint: '按碳水 45% / 蛋白 25% / 脂肪 30% 供能比换算，最低不低于 ' + units.energyText(1200),
            waterGoalText: String(settings.getWaterGoal()),
            currentGoalText: units.energyText(currentGoal),
            currentGoalValue:String(units.toDisplayEnergy(currentGoal)),
            currentTargets:settings.getMacroTargets() || {carb:Math.round(currentGoal*.45/4),protein:Math.round(currentGoal*.25/4),fat:Math.round(currentGoal*.30/9)},
        });
        if (profile) {
            this.setData({
                sex: profile.sex === 'male' ? 'male' : 'female',
                ageText: profile.age !== undefined ? String(profile.age) : '',
                heightText: profile.height !== undefined ? String(unitKey==='lb' ? Math.round(profile.height/2.54*100)/100 : profile.height) : '',
                weightText: profile.weight !== undefined ? String(units.toDisplayWeight(profile.weight)) : '',
                selectedActivity: profile.activity || 'light',
                activityIndex:Math.max(0,ACTIVITIES.findIndex(item=>item.key===(profile.activity || 'light'))),
                selectedGoal: profile.goalType || 'lose',
            });
        }
        this.rememberBodyInputs(profile && Number(profile.weight),profile && Number(profile.height));
        this.refreshPreview();
    },

    refreshPreview() {
        const age=Number(this.data.ageText), height=this.inputHeightCm(), weight=this.inputWeightKg();
        if(age>0 && age<=120 && height>=80 && height<=250 && weight>0 && weight<=500) this.handleCompute();
        else this.setData({result:null});
    },

    handleBasis() { this.setData({showBasis:!this.data.showBasis}); },

    handleSex(event) {
        this.setData({ sex: event.currentTarget.dataset.key });
        this.refreshPreview();
    },

    rememberBodyInputs(kg,cm) {
        this.bodyInputBaseline={kg,cm,weightText:this.data.weightText,heightText:this.data.heightText,weightUnit:this.data.inputWeightKey,heightUnit:this.data.heightUnit};
    },
    inputWeightKg() {
        const base=this.bodyInputBaseline;
        if(base && Number.isFinite(base.kg) && base.kg>0 && base.weightUnit===this.data.inputWeightKey && String(base.weightText)===String(this.data.weightText))return base.kg;
        return units.WEIGHT_UNITS[this.data.inputWeightKey].toKg(Number(this.data.weightText));
    },
    inputHeightCm() {
        const base=this.bodyInputBaseline;
        if(base && Number.isFinite(base.cm) && base.cm>0 && base.heightUnit===this.data.heightUnit && String(base.heightText)===String(this.data.heightText))return base.cm;
        return Number(this.data.heightText)*(this.data.heightUnit==='in'?2.54:1);
    },
    handleUnitMode(event) {
        const mode=event.currentTarget.dataset.mode;
        if(!['metric','imperial'].includes(mode) || mode===this.data.unitMode) return;
        const kg=this.inputWeightKg(),cm=this.inputHeightCm();
        const key=mode==='imperial'?'lb':'kg';
        this.setData({unitMode:mode,inputWeightKey:key,weightUnit:key,heightUnit:mode==='imperial'?'in':'cm',
            weightText:this.data.weightText?String(Math.round(units.WEIGHT_UNITS[key].fromKg(kg)*100)/100):'',
            heightText:this.data.heightText?String(Math.round((mode==='imperial'?cm/2.54:cm)*100)/100):'',
            weightPlaceholder:mode==='imperial'?'133':'60',error:''});
        this.rememberBodyInputs(kg,cm);
        this.refreshPreview();
    },
    closeActivity() {
        if (this.data.activityOpen) this.setData({activityOpen:false});
    },
    handlePageTap() { this.closeActivity(); this.closeKeypad(); },
    noopKeypad() {},
    openKeypad(event) {
        const field = event.currentTarget.dataset.field;
        const config = KEYPAD_FIELDS[field];
        if (!config) return;
        this.closeActivity();
        this.setData({ keypadField: field, keypadLabel: config.label,
            keypadUnit: config.unit || (field === 'heightText' ? this.data.heightUnit : this.data.weightUnit),
            keypadDecimal: config.decimal, keypadReplace: true }, () => this.revealKeypadField(field));
    },
    revealKeypadField(field) {
        if (typeof wx.createSelectorQuery !== 'function' || typeof wx.pageScrollTo !== 'function') return;
        const query = wx.createSelectorQuery();
        query.select('.plan-field-' + field).boundingClientRect();
        query.select('.plan-keypad').boundingClientRect();
        query.selectViewport().scrollOffset();
        query.exec(result => {
            if (this.data.keypadField !== field || !result || !result[0] || !result[1] || !result[2]) return;
            const overlap = result[0].bottom + 16 - result[1].top;
            if (overlap > 0) wx.pageScrollTo({ scrollTop: result[2].scrollTop + overlap, duration: 200 });
        });
    },
    closeKeypad() { if (this.data.keypadField) this.setData({ keypadField: '' }); },
    nextKeypadField() {
        const index = KEYPAD_ORDER.indexOf(this.data.keypadField);
        if (index < 0 || index === KEYPAD_ORDER.length - 1) { this.closeKeypad(); return; }
        this.openKeypad({ currentTarget: { dataset: { field: KEYPAD_ORDER[index + 1] } } });
    },
    handleKeypadKey(event) {
        const field = this.data.keypadField, config = KEYPAD_FIELDS[field];
        if (!config) return;
        const key = String(event.currentTarget.dataset.key);
        let value = String(this.data[field] || '');
        if (key === 'back') value = value.slice(0, -1);
        else if (key === 'clear') value = '';
        else if (key === '.') {
            if (!config.decimal) return;
            if (this.data.keypadReplace) value = '';
            if (value.includes('.')) return;
            value = value ? value + '.' : '0.';
        } else if (/^\d$/.test(key)) {
            if (this.data.keypadReplace) value = '';
            if (value.length >= config.max) return;
            value += key;
        } else return;
        if (value.length > config.max) return;
        this.setData({ keypadReplace: false });
        const handlers = { ageText: 'handleAge', heightText: 'handleHeight', weightText: 'handleWeight', waterGoalText: 'handleWaterInput' };
        this[handlers[field]]({ detail: { value } });
    },
    onPageScroll() { this.closeActivity(); },
    toggleActivity() {
        if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
        this.setData({activityOpen: !this.data.activityOpen});
    },
    handleActivity(event) {
        const key=event.currentTarget.dataset.key;
        const index=key ? ACTIVITIES.findIndex(item=>item.key===key) : Number(event.detail.value);
        if(!ACTIVITIES[index]) return;
        this.setData({ selectedActivity:ACTIVITIES[index].key,activityIndex:index,activityOpen:false });
        this.refreshPreview();
    },

    handleGoalType(event) {
        this.setData({ selectedGoal: event.currentTarget.dataset.key });
        this.refreshPreview();
    },

    /* 饮水目标：与喝水页同一套 300–6000ml 的限制 */
    handleWaterInput(event) {
        this.setData({ waterGoalText: event.detail.value });
    },

    handleWaterMinus() {
        const current = Number(this.data.waterGoalText);
        const next = Math.max(300, (Number.isFinite(current) ? current : 1500) - 100);
        this.setData({ waterGoalText: String(next) });
    },

    handleWaterPlus() {
        const current = Number(this.data.waterGoalText);
        const next = Math.min(6000, (Number.isFinite(current) ? current : 1500) + 100);
        this.setData({ waterGoalText: String(next) });
    },

    handleWaterSave() {
        const value = Number(this.data.waterGoalText);
        if (!Number.isFinite(value) || value < 300 || value > 6000) {
            this.setData({ error: '饮水目标请填 300–6000ml' });
            return;
        }
        settings.setWaterGoal(value);
        this.setData({ error: '' });
        wx.showToast({ title: '饮水目标已更新', icon: 'none' });
    },

    handleAge(event) {
        this.setData({ ageText: event.detail.value, error: '' });
        this.refreshPreview();
    },

    handleHeight(event) {
        this.setData({ heightText: event.detail.value, error: '' });
        this.refreshPreview();
    },

    handleWeight(event) {
        this.setData({ weightText: event.detail.value, error: '' });
        this.refreshPreview();
    },

    handleCompute() {
        this.setData({result:null});
        const age = Number(this.data.ageText);
        const height = this.inputHeightCm();
        const weight = this.inputWeightKg();

        if (!Number.isFinite(age) || age <= 0 || age > 120) {
            this.setData({ error: '请输入有效的年龄' });
            return;
        }
        if (!Number.isFinite(height) || height < 80 || height > 250) {
            this.setData({ error: '请输入有效的身高（cm）' });
            return;
        }
        if (!Number.isFinite(weight) || weight <= 0 || weight > 500) {
            this.setData({ error: '请输入有效的体重（kg）' });
            return;
        }

        let factor = 1.375;
        for (let i = 0; i < ACTIVITIES.length; i += 1) {
            if (ACTIVITIES[i].key === this.data.selectedActivity) {
                factor = ACTIVITIES[i].factor;
                break;
            }
        }
        let adjust = -500;
        for (let i = 0; i < GOAL_TYPES.length; i += 1) {
            if (GOAL_TYPES[i].key === this.data.selectedGoal) {
                adjust = GOAL_TYPES[i].adjust;
                break;
            }
        }

        const sexOffset = this.data.sex === 'male' ? 5 : -161;
        const bmr = 10 * weight + 6.25 * height - 5 * age + sexOffset;
        const tdee = bmr * factor;
        const target = Math.max(Math.round(tdee + adjust), MIN_KCAL);

        this.setData({
            error: '',
            result: {
                bmrText: String(Math.round(bmr)),
                tdeeText: String(Math.round(tdee)),
                kcalText: String(target),
                bmrDisplay: String(units.toDisplayEnergy(bmr)),
                tdeeDisplay: String(units.toDisplayEnergy(tdee)),
                kcalDisplay: String(units.toDisplayEnergy(target)),
                proteinText: String(Math.round(target * 0.25 / 4)),
                carbText: String(Math.round(target * 0.45 / 4)),
                fatText: String(Math.round(target * 0.30 / 9)),
            },
        });
    },

    handleSave() {
        const water=Number(this.data.waterGoalText);
        if (!Number.isFinite(water) || water<300 || water>6000) {
            this.setData({error:'饮水目标请填 300–6000ml'}); return;
        }
        this.handleCompute();
        if (!this.data.result) return;

        const keys=['cal_profile','cal_goal','cal_macro_targets','cal_water_goal'],before={};
        try {
            for(const key of keys)before[key]=wx.getStorageSync(key);
            settings.setProfile(Object.assign({},settings.getProfile() || {},{
                sex: this.data.sex,
                age: Number(this.data.ageText),
                height: this.inputHeightCm(),
                weight: this.inputWeightKg(),
                activity: this.data.selectedActivity,
                goalType: this.data.selectedGoal,
            }));
            settings.setGoal(Number(this.data.result.kcalText));
            settings.setMacroTargets({
                protein: Number(this.data.result.proteinText),
                carb: Number(this.data.result.carbText),
                fat: Number(this.data.result.fatText),
            });

            settings.setWaterGoal(water);
        } catch(error) {
            for(const key of keys)if(Object.prototype.hasOwnProperty.call(before,key)){
                try {if(before[key]===undefined && typeof wx.removeStorageSync==='function')wx.removeStorageSync(key);else wx.setStorageSync(key,before[key]);}catch(ignored){}
            }
            this.setData({error:'保存失败，请检查本机存储后重试'});return;
        }
        const previous=before.cal_profile || {};
        if(Number(previous.height)!==this.inputHeightCm() || Number(previous.weight)!==this.inputWeightKg()){
            const app=typeof getApp==='function'?getApp():null;
            if(app && typeof app.markBodyChanged==='function')app.markBodyChanged();
        }
        wx.showToast({ title: '计划已保存', icon: 'success' });
        setTimeout(() => {
            wx.navigateBack();
        }, 600);
    },
}));
