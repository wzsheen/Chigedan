const {withTheme}=require('../../utils/theme');
const dietState = require('../../utils/diet-state');
const knowledge = require('../../utils/knowledge');
const { createRecordStore, formatDate } = require('../../utils/record-store.js');
const { createWaterStore, createWeightStore } = require('../../utils/body-store.js');
const settings = require('../../utils/settings.js');
const appUpdate = require('../../utils/app-update.js');
const units = require('../../utils/units.js');
const mealDetail = require('../../utils/meal-detail.js');
const { buildAnalysis } = require('../../utils/analysis.js');
const { buildAdviceLine, resolveMood, MACRO_COLORS, MACRO_COLORS_DARK } = require('../../utils/advice.js');

const MEAL_LABELS = [
    { key: 'breakfast', label: '早餐', icon: '🌅' },
    { key: 'lunch', label: '午餐', icon: '🍛' },
    { key: 'dinner', label: '晚餐', icon: '🌙' },
    { key: 'snack', label: '加餐', icon: '🍎' },
];

const store = createRecordStore({ storageKey: 'cal_records' });
const waterStore = createWaterStore({ storageKey: 'cal_water' });

// 自动检查更新的节流：以前是一整个进程只查一次，App 退到后台再回来就再也不查了。
// 现在冷启动必查，之后每 5 分钟最多查一次；失败 2 分钟后允许重试。
const UPDATE_RECHECK_GAP = 5 * 60 * 1000;
const UPDATE_RETRY_GAP = 2 * 60 * 1000;
const weightStore = createWeightStore({ storageKey: 'cal_weight' });

// 一张卡两种材质：
// 没记录 → 浅色玻璃卡，跟页面其他卡片同一套白玻璃，只在左上角留一团橙光；
// 有记录 → 深色卡，底色由当天合理度的状态色深混而来，红黄绿一眼能分出来。
const LIGHT_CARD = {
    surface: 'radial-gradient(120% 90% at 16% -8%, rgba(255, 107, 53, 0.13) 0%, rgba(255, 107, 53, 0) 66%), rgba(255, 255, 255, 0.62)',
    number: '#1f2329',
    hint: '#c25a24',
    pill: 'background: rgba(58, 140, 200, 0.10); box-shadow: inset 0 0 0 1px rgba(58, 140, 200, 0.30); color: #2f78aa;',
};
const DARK_PILL = 'background: rgba(121, 200, 245, 0.16); box-shadow: inset 0 0 0 1px rgba(121, 200, 245, 0.34); color: #a8dcff;';

// BMI 分级（中国成人标准）
function classifyBmi(bmi) {
    if (bmi < 18.5) {
        return { text: '偏瘦', tone: 'metric-low' };
    }
    if (bmi < 24) {
        return { text: '正常', tone: 'metric-normal' };
    }
    if (bmi < 28) {
        return { text: '超重', tone: 'metric-high' };
    }
    return { text: '肥胖', tone: 'metric-danger' };
}

const mascotState=require('../../utils/mascot-state');
const mascotAnimation=require('../../utils/mascot-animation');
const mascotScheduling=require('../../utils/mascot-scheduler');
const festival=require('../../utils/festival');
// Shared by home page instances so navigation cannot reset reminder cooldowns.
const mascotSchedule=mascotScheduling.createScheduler();
Page(withTheme({
    data: {
        homeTopInset:42,
        planGuideOpen:false,
        planGuideError:'',
        planGuideStep:0,
        planGuideSpotStyle:'',
        planGuideTipStyle:'',
        sloganMaxWidth:240,
        scienceArticles: knowledge.ARTICLES,
        scienceIndex: 0,
        scienceAutoplay: true,
        scienceEnabled:true,
        mascotAnimation:true,
        waterShortcuts:[100,250,500],
        dateText: '',
        viewState: 'loading',
        goal: 2000,
        todayKcalText: '0',
        energyDigits:[],
        energyEmpty:true,
        mascotState:'idle',
        mascotEventToken:0,
        leftText: '',
        leftStyle: '',
        hintStyle: '',
        moodKey: 'empty',
        hintTarget: 'advice',
        percentText: '0%',
        cardTone: 'light',
        cardStyle: '',
        glowStyle: '',
        numStyle: '',
        pillStyle: '',
        calFillStyle: '',
        hasMacro: false,
        hintText: '',
        hintTone: 'neutral',
        overGoal: false,
        groups: [],
        totalCount: 0,
        ringLegend: [],
        waterTotalText: '0',
        waterPercentText: '0%',
        waterBarStyle: 'width: 0%;',
        waterGoalText: '1500',
        waterGoalOpen:false,
        waterGoalDraft:'1500',
        waterGoalError:'',
        weightText: '',
        weightValueText:'—',
        weightUnitText:'kg',
        weightHint: '',
        heightText: '未设置',
        heightValueText:'—',
        heightEmpty: true,
        bmiText: '—',
        bmiLevelText: '—',
        bmiToneClass: 'metric-empty',
        healthScoreText: '—',
        healthRingText: '健康分 —',
        healthLevelText: '暂无数据',
        healthHint: '记录几天后自动生成',
        healthReady: false,
        bmiFlash: false,
        pendingDeleteId: '',
    },

    onLoad() {
        const windowInfo=typeof wx.getWindowInfo==='function' ? wx.getWindowInfo() : (typeof wx.getSystemInfoSync==='function' ? wx.getSystemInfoSync() : {});
        const width=Number(windowInfo.windowWidth)||375;
        const capsule=typeof wx.getMenuButtonBoundingClientRect==='function' ? wx.getMenuButtonBoundingClientRect() : null;
        this.setData({homeTopInset:(Number(windowInfo.statusBarHeight)||20)+22,sloganMaxWidth:Math.max(120,(capsule && capsule.left || width-80)-width*28/750-12)});
        this.bodyRevision = this.readBodyRevision();
    },

    // 从子页面（体重 / 喝水 / 目标 / 添加记录）返回时重新读取本地数据，
    // BMI、身高、体重、饮水、热量全部跟着变。子页面改过身体数据时闪一下高亮。
    onShow() {
        this.homeVisible=true;
        clearInterval(this.mascotClock);
        clearTimeout(this.mascotTimer);
        const display=settings.getHomeDisplay();
        this.setData({scienceEnabled:display.scienceAutoplay,scienceAutoplay:display.scienceAutoplay,mascotAnimation:display.mascotAnimation,waterShortcuts:settings.getWaterShortcuts()});
        this.checkUpdateOnStartup(display.autoUpdate);
        if(display.mascotAnimation)this.mascotClock=setInterval(()=>this.updateMascot(),60000);
        else {this.mascotEvent=null;this.setData({mascotState:'idle'});}
        const revision = this.readBodyRevision();
        const changed = revision > this.bodyRevision;
        this.bodyRevision = revision;
        this.refresh().then(() => {
            if(this.homeVisible===false)return;
            this.refreshPlanGuide();
            const app=getApp();
            const event=app.globalData.mascotEvent;
            if(event && Date.now()-event.time<12000){app.globalData.mascotEvent=null;this.playMascot(event.kind);}
            this.startDailyGoalReminder();
            if (changed) {
                this.flashBmi();
            }
        });
    },

    checkUpdateOnStartup(enabled) {
        if(!enabled)return;
        const now=Date.now();
        if(this.updateNextCheckAt && now<this.updateNextCheckAt)return;
        this.updateNextCheckAt=now+UPDATE_RECHECK_GAP;
        const that=this;
        appUpdate.check().then(result=>{
            // 检查失败不静默地卡住整轮：2 分钟后允许重试，尤其断网恢复后能自己补上
            if(!result || !result.ok){that.updateNextCheckAt=Date.now()+UPDATE_RETRY_GAP;return;}
            that.updateNextCheckAt=Date.now()+UPDATE_RECHECK_GAP;
            if(that.homeVisible===false || result.status!=='new')return;
            // 24 小时内只弹一次：上一次弹窗不管是被关掉、点了更新没装成、还是按返回键走了，
            // 只要展示过就用掉这次的额度，第二天之前不再打断。
            if(appUpdate.isPromptCooling() || appUpdate.isDismissed(result.remoteVersion))return;
            const app=getApp();
            app.globalData.pendingUpdateInfo={
                version:result.remoteVersion,notes:result.notes||'',downloadUrl:result.downloadUrl||'',releaseUrl:result.releaseUrl||'',
                sizeText:result.sizeText||appUpdate.formatSize(result.assetSize),dateText:result.dateText||appUpdate.formatDate(result.publishedAt),
                delta:result.delta,
                assetName:result.assetName||''
            };
            wx.navigateTo({url:'/pages/about/about?autoUpdate=1'});
        }).catch(()=>{that.updateNextCheckAt=Date.now()+UPDATE_RETRY_GAP;});
    },
    onHide() { this.planGuideRequest=(this.planGuideRequest||0)+1;this.setData({planGuideOpen:false,waterGoalOpen:false,goalReminderVisible:false});if(this.mascotEvent)mascotSchedule.finish(Date.now());this.homeVisible=false;this.setData({ scienceAutoplay: false });clearTimeout(this.mascotTimer);clearInterval(this.mascotClock);this.mascotEvent=null; },
    startDailyGoalReminder() {
        if(this.homeVisible===false || this.data.mascotAnimation===false || !['empty','ready'].includes(this.data.viewState) || this.data.planGuideOpen || this.mascotEvent)return false;
        try {
            if(settings.needsPlanGuide())return false;
            const date=formatDate(new Date());
            if(wx.getStorageSync('cal_goal_reminder_date')===date)return false;
            clearTimeout(this.mascotTimer);
            this.mascotEvent='goal';
            this.setData({mascotState:'goal',goalReminderVisible:true,mascotEventToken:this.data.mascotEventToken+1});
            this.mascotTimer=setTimeout(()=>{
                if(this.homeVisible===false || this.mascotEvent!=='goal')return;
                try { wx.setStorageSync('cal_goal_reminder_date',date); } catch (_) {}
                this.mascotEvent=null;
                this.setData({goalReminderVisible:false});
                mascotSchedule.finish(Date.now());
                this.updateMascot();
                this.mascotTimer=setTimeout(()=>{this.mascotTimer=null;this.updateMascot();},mascotScheduling.IDLE_GAP);
            },mascotAnimation.duration('goal')*3);
            return true;
        } catch (_) { return false; }
    },
    updateMascot() {
        if(this.homeVisible===false)return;
        if(this.data.mascotAnimation===false)return;
        if(this.mascotEvent){this.setData({mascotState:this.mascotEvent});return;}
        const input={kind:this.data.diet && this.data.diet.kind,count:this.data.totalCount || 0,hour:new Date().getHours(),water:Number(this.data.waterTotalText),waterGoal:Number(this.data.waterGoalText)};
        const next=mascotSchedule.next(input,Date.now());
        if(next){this.startMascot(next);return;}
        this.setData({mascotState:input.hour>=21 || input.hour<6 ? 'rest' : (festival.festival(new Date()) || 'idle')});
    },
    playMascot(kind) {
        if(this.mascotEvent==='goal')return;
        if(kind==='success' || kind==='water')this.startMascot(kind);
    },
    startMascot(kind) {
        if(this.homeVisible===false)return;
        if(this.data.mascotAnimation===false)return;
        const duration=mascotSchedule.begin(kind,Date.now());
        if(!duration)return;
        clearTimeout(this.mascotTimer);
        this.mascotEvent=kind;
        this.setData({mascotState:kind,mascotEventToken:this.data.mascotEventToken+1});
        this.mascotTimer=setTimeout(()=>{
            this.mascotEvent=null;
            mascotSchedule.finish(Date.now());
            if(this.startDailyGoalReminder())return;
            this.updateMascot();
            this.mascotTimer=setTimeout(()=>{this.mascotTimer=null;this.updateMascot();},mascotScheduling.IDLE_GAP);
        },duration);
    },
    pauseScience() { this.setData({ scienceAutoplay: false }); },
    resumeScience() { this.setData({ scienceAutoplay:this.data.scienceEnabled!==false && this.homeVisible!==false }); },
    handleScienceChange(event) { this.setData({ scienceIndex: event.detail.current }); },
    handleKnowledge(event) {
        const id = event.currentTarget.dataset.id || '';
        wx.navigateTo({ url: '/pages/knowledge/knowledge' + (id ? '?id=' + id : '') });
    },
    refreshPlanGuide() {
        try {
            if(!settings.needsPlanGuide()){this.setData({planGuideOpen:false});return;}
            const show=()=>{if(this.homeVisible!==false)this.showPlanGuideStep(0);};
            if(typeof wx.pageScrollTo==='function')wx.pageScrollTo({scrollTop:0,duration:0,complete:show});else show();
        } catch(error) { this.setData({planGuideOpen:false}); }
    },
    showPlanGuideStep(step) {
        const request=this.planGuideRequest=(this.planGuideRequest||0)+1;
        const measure=()=>{
            if(this.homeVisible===false || request!==this.planGuideRequest)return;
            const apply=rect=>{
                if(this.homeVisible===false || request!==this.planGuideRequest || !rect || !rect.width || !rect.height)return;
                const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
                const width=info.windowWidth || 375,height=info.windowHeight || 667;
                const left=Math.max(4,rect.left-5),top=Math.max(4,rect.top-5),right=Math.min(width-4,rect.right+5),bottom=Math.min(height-4,rect.bottom+5);
                const tipTop=step===1 || (step===2 && bottom+236>height)?Math.max(18,top-210):Math.min(bottom+18,height-218);
                this.setData({planGuideOpen:true,planGuideStep:step,planGuideError:'',planGuideSpotStyle:'left:'+left+'px;top:'+top+'px;width:'+(right-left)+'px;height:'+(bottom-top)+'px;',planGuideTipStyle:'top:'+Math.max(12,tipTop)+'px;'});
            };
            if(step===0)this.createSelectorQuery().select('.energy-copy').boundingClientRect(apply).exec();
            else if(step===1){const dock=this.selectComponent('#home-dock');if(dock && dock.measureAddTarget)dock.measureAddTarget(apply);}
            else this.createSelectorQuery().select('.water-amount').boundingClientRect(apply).exec();
        };
        const ready=()=>{if(typeof wx.nextTick==='function')wx.nextTick(measure);else measure();};
        if(step===2 && typeof wx.pageScrollTo==='function')wx.pageScrollTo({selector:'.water-card',duration:0,complete:ready});else ready();
    },
    handlePlanGuideNext() {
        if(this.data.planGuideStep<2)this.showPlanGuideStep(this.data.planGuideStep+1);
        else this.handlePlanGuideSkip();
    },
    handlePlanGuideSkip() {
        try { settings.dismissPlanGuide();this.planGuideRequest=(this.planGuideRequest||0)+1;this.setData({planGuideOpen:false,planGuideError:''});this.startDailyGoalReminder(); }
        catch(error) { this.setData({planGuideError:'暂时无法保存偏好，请重试'}); }
    },
    onResize() { if(this.data.planGuideOpen)this.showPlanGuideStep(this.data.planGuideStep); },
    preventGuideScroll() {},
    handleAdviceOpen() { wx.navigateTo({ url: '/pages/advice/advice' }); },

    onPullDownRefresh() {
        this.refresh().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    onUnload() {
        if(this.mascotEvent)mascotSchedule.finish(Date.now());
        this.homeVisible=false;
        clearInterval(this.mascotClock);
        clearTimeout(this.mascotTimer);
        if (this.flashTimer) {
            clearTimeout(this.flashTimer);
            this.flashTimer = null;
        }
        this.clearDeleteTimer();
    },

    readBodyRevision() {
        const app = getApp();
        const data = app && app.globalData ? app.globalData : null;
        return data && Number(data.bodyRevision) > 0 ? Number(data.bodyRevision) : 0;
    },

    // 身体数据被改动后的轻量提示：卡片描边闪一下，避免用户以为没生效。
    flashBmi() {
        const that = this;
        if (this.flashTimer) {
            clearTimeout(this.flashTimer);
        }
        this.setData({ bmiFlash: true });
        this.flashTimer = setTimeout(() => {
            that.flashTimer = null;
            that.setData({ bmiFlash: false });
        }, 1500);
    },

    buildDateText(date) {
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return month + '月' + day + '日 周' + weekdays[date.getDay()];
    },

    refresh() {
        const that = this;
        const today = formatDate(new Date());
        const goal = settings.getGoal();
        const macroTargets = settings.getMacroTargets();

        this.setData({ dateText: this.buildDateText(new Date()) });

        const recordTask = store.list({ preserveMissing: true }).then(result => {
            if (result.error) {
                that.setData({ viewState: 'error' });
                return null;
            }
            const records = result.data.filter(item => item.date === today);
            that.applyRecords(records, goal, macroTargets);
            return that.loadHealth(result.data, goal, macroTargets);
        });

        const waterTask = waterStore.getToday().then(result => {
            const waterGoal = settings.getWaterGoal();
            const total = result.error ? 0 : result.data.total;
            const ratio = waterGoal > 0 ? Math.min(total / waterGoal, 1) : 0;
            that.setData({
                waterTotalText: String(total),
                waterPercentText: Math.round((total / waterGoal) * 100) + '%',
                waterBarStyle: 'width: ' + Math.round(ratio * 100) + '%;',
                waterGoalText: String(waterGoal),
            });
        });

        const bodyTask = this.loadWeight();

        // 出错时不要静默吞掉：之前这里只 return null，页面会一直停在 loading，
        // 现在记日志并把页面切到 error 态，至少能看到「加载失败」而不是无限转圈。
        return Promise.all([recordTask, waterTask, bodyTask]).then(result=>{this.updateMascot();return result;}).catch(error => {
            console.error('[index] refresh failed', error);
            that.setData({ viewState: 'error' });
            return null;
        });
    },

    // 首页只展示近 7 天健康分与一句结论，详细分析在分析页。
    loadHealth(allRecords, goal, macroTargets) {
        const that = this;
        return weightStore.list().then(result => {
            const weights = result.error ? [] : result.data;
            const waterEntries = wx.getStorageSync('cal_water');
            const analysis = buildAnalysis({
                records: allRecords,
                weights: weights,
                waterEntries: Array.isArray(waterEntries) ? waterEntries : [],
                goal: goal,
                waterGoal: settings.getWaterGoal(),
                macroTargets: macroTargets,
                days: 7,
            });

            if (!analysis.hasData) {
                that.setData({
                    healthReady: false,
                    healthScoreText: '—',
                    healthRingText: '健康分 —',
                    healthLevelText: '暂无数据',
                    healthHint: '记录几天后自动生成',
                });
                return;
            }

            that.setData({
                healthReady: true,
                healthScoreText: String(analysis.score.total),
                healthRingText: '健康分 ' + analysis.score.total,
                healthLevelText: analysis.score.level.text,
                healthHint: analysis.conclusions[0] || '',
            });
        });
    },

    handleOpenAnalysis() {
        wx.navigateTo({ url: '/pages/analysis/analysis' });
    },

    // 环下第一行：已经吃过东西就进饮食建议，还没记录就直接去记一笔。
    handleAdviceTap() {
        if (this.data.diet && this.data.diet.target === 'add') {
            wx.navigateTo({ url: '/pages/add/add' });
            return;
        }
        wx.navigateTo({ url: '/pages/advice/advice' });
    },

    applyRecords(records, goal, macroTargets) {
        let total = 0;
        let protein = 0;
        let carb = 0;
        let fat = 0;
        const groups = [];
        for (let i = 0; i < MEAL_LABELS.length; i += 1) {
            const mealKey = MEAL_LABELS[i].key;
            const items = records.filter(item => item.meal === mealKey);
            let mealTotal = 0;
            const listItems = [];
            for (let j = 0; j < items.length; j += 1) {
                mealTotal += items[j].kcal;
                protein += items[j].protein;
                carb += items[j].carb;
                fat += items[j].fat;
                const detail = mealDetail.build(items[j]);
                listItems.push({
                    id: items[j].id,
                    name: items[j].name,
                    qtyText: detail.qtyText,
                    macroText: detail.macroText,
                    sourceText: detail.sourceText,
                    kcalText: units.energyText(items[j].kcal),
                });
            }
            if (listItems.length > 0 || mealKey !== 'snack') {
                groups.push({
                    key: mealKey,
                    label: MEAL_LABELS[i].label,
                    icon: MEAL_LABELS[i].icon,
                    totalText: units.energyText(mealTotal),
                    totalValueText:String(units.toDisplayEnergy(mealTotal)),
                    items: listItems,
                    summary: listItems.map(item => item.name).join(' · '),
                });
            }
            total += mealTotal;
        }

        // 三大营养素只留一行供能比：名字灰、数字用各自颜色，不再画条也不写克数。
        // 深底用亮版，浅底用本色版，否则白底上的亮黄看不见。
        const isEmpty = records.length === 0;
        const palette = isEmpty ? MACRO_COLORS : MACRO_COLORS_DARK;
        const macroEnergy = carb * 4 + protein * 4 + fat * 9;
        const shareOf = kcal => macroEnergy > 0 ? Math.round((kcal / macroEnergy) * 100) + '%' : '—';
        const ringLegend = [
            { key: 'carb', label: '碳水', color: palette.carb, percentText: shareOf(carb * 4) },
            { key: 'protein', label: '蛋白', color: palette.protein, percentText: shareOf(protein * 4) },
            { key: 'fat', label: '脂肪', color: palette.fat, percentText: shareOf(fat * 9) },
        ];

        const overGoal = total > goal;
        const hour = new Date().getHours();
        // 第一行改成「某项占比 + 动作」，格式和下面的「目标 xxx · 调整 ›」对齐：
        // 超标给纠偏入口，正常给一句鼓励，点进去都是饮食建议页。
        const line = buildAdviceLine({
            count: records.length,
            total: total,
            goal: goal,
            protein: protein,
            carb: carb,
            fat: fat,
            hour: hour,
        });
        // 第一张卡的颜色跟着今天吃得合不合理走：越合理越绿，越离谱越红；没记录保持本色。
        const mood = resolveMood({
            count: records.length,
            total: total,
            goal: goal,
            protein: protein,
            carb: carb,
            fat: fat,
            hour: hour,
        });

        const targets = macroTargets || { protein: goal * .25 / 4, carb: goal * .45 / 4, fat: goal * .30 / 9 };
        const macroCards = [['protein', '蛋白质', protein], ['carb', '碳水', carb], ['fat', '脂肪', fat]].map(([key, label, value]) => {
            const target = Number(targets[key]) || 0;
            return { key, label, value: String(Math.round(value * 10) / 10), target: target ? String(Math.round(target)) : '—', width: target ? Math.min(100, value / target * 100) : 0 };
        });
        const diet = dietState.buildState({ nutritionMissing: records.some(item=>item.nutritionStatus==='incomplete'), count: records.length, total, goal, protein, carb, fat, hour });
        this.setData({
            diet,
            macroCards,
            energyUnit: units.energyUnitLabel(),
            goalValueText:String(units.toDisplayEnergy(goal)),
            remainingValueText:String(units.toDisplayEnergy(Math.abs(goal-total))),
            progressWidth: Math.min(100, total / goal * 100),
            remainingText: (overGoal ? '超出 ' : '还剩 ') + units.energyText(Math.abs(goal - total)),
            viewState: records.length === 0 ? 'empty' : 'ready',
            goal: goal,
            ringLegend: ringLegend,
            todayKcalText: String(units.toDisplayEnergy(total)),
            energyDigits:records.length === 0 ? [] : String(units.toDisplayEnergy(total)).split(''),
            energyEmpty:records.length === 0,
            goalText: units.energyText(goal),
            percentText: Math.round((total / goal) * 100) + '%',
            leftText: overGoal
                ? '已超出 ' + units.energyText(total - goal)
                : '还可吃 ' + units.energyText(goal - total),
            leftStyle: 'color: ' + mood.headerHex + '; background: ' + mood.soft + ';',
            // 卡片材质：空态浅色玻璃，有记录走深染（底色由状态色深混）
            // background-size 放大到 300%，配 wxss 里的无规律 keyframes 让渐变在卡面上游走
            cardTone: isEmpty ? 'light' : 'dark',
            cardStyle: isEmpty
                ? 'background: ' + LIGHT_CARD.surface + ';'
                : 'background: ' + mood.cardBg + '; background-size: 300% 300%;',
            // 流光层只下发 background-image：尺寸/位置/扫动节奏都由 wxss 统一管，
            // 用 background 简写会把 wxss 里的 background-size/repeat 一并重置掉
            glowStyle: 'background-image: ' + mood.cardGlow + ';',
            numStyle: isEmpty ? 'color: ' + LIGHT_CARD.number + ';' : 'color: #ffffff;',
            pillStyle: isEmpty ? LIGHT_CARD.pill : DARK_PILL,
            // 深色卡上的提示字用亮版状态色，浅色卡上用同色系压深一档
            hintStyle: isEmpty ? 'color: ' + LIGHT_CARD.hint + ';' : 'color: ' + mood.bright + ';',
            moodKey: mood.key,
            calFillStyle: this.buildCalFill(total, goal, isEmpty ? '#ff6b35' : mood.bright),
            hasMacro: macroEnergy > 0,
            hintText: line.text,
            hintTone: line.tone,
            hintTarget: line.target,
            overGoal: overGoal,
            groups: groups,
            totalCount: records.length,
        });
    },

    // 身高来自身体档案，体重取最新一条记录；每次进入首页都重算，子页面改完立即同步。
    loadWeight() {
        const that = this;
        const profile = settings.getProfile();
        const heightCm = profile && Number(profile.height) > 0 ? Number(profile.height) : 0;
        const heightBase = {
            heightText: heightCm > 0 ? heightCm + ' cm' : '未设置',
            heightValueText:heightCm>0 ? String(heightCm) : '—',
            heightEmpty: heightCm <= 0,
        };

        return weightStore.list().then(result => {
            const items = result.error ? [] : result.data;
            if (items.length === 0 && !(profile && Number(profile.weight) > 0)) {
                that.setData(Object.assign({}, heightBase, {
                    weightText: '—',
                    weightValueText:'—',
                    weightUnitText:units.weightUnitLabel(),
                    weightHint: heightCm > 0 ? '还没有记录，点进去记一笔' : '还没有记录，先填身高才能算 BMI',
                    bmiText: '—',
                    bmiLevelText: '—',
                    bmiToneClass: 'metric-empty',
                }));
                return;
            }
            const current=require('../../utils/body-measurements').current().kg;
            const latest={kg:current.value,date:current.date};
            const hint = latest.date === formatDate(new Date())
                ? '今天已称重'
                : !latest.date ? '身体资料中的体重，点击记录最新值' : '上次记录：' + latest.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2月$3日');

            let bmiText = '—';
            let bmiLevelText = '—';
            let bmiToneClass = 'metric-empty';
            if (heightCm > 0) {
                const bmi = latest.kg / Math.pow(heightCm / 100, 2);
                const rounded = Math.round(bmi * 10) / 10;
                const level = classifyBmi(rounded);
                bmiText = rounded.toFixed(1);
                bmiLevelText = level.text;
                bmiToneClass = level.tone;
            }

            that.setData(Object.assign({}, heightBase, {
                weightText: units.weightText(latest.kg),
                weightValueText:units.toDisplayWeight(latest.kg).toFixed(1).replace(/\.0$/,''),
                weightUnitText:units.weightUnitLabel(),
                weightHint: hint,
                bmiText: bmiText,
                bmiLevelText: bmiLevelText,
                bmiToneClass: bmiToneClass,
            }));
        });
    },

    // 进度线：宽度就是热量进度，颜色由今天的合理度决定（没记录时传本色 #ff6b35）。
    buildCalFill(total, goal, color) {
        const ratio = goal > 0 ? Math.min(total / goal, 1) : 0;
        const width = Math.round(ratio * 1000) / 10;
        return 'width: ' + width + '%; background: ' + (color || '#ff6b35') + ';';
    },

    handleMealTap(event) {
        const key = event.currentTarget.dataset.key;
        this.setData({ expandedMeal: this.data.expandedMeal === key ? '' : key });
    },
    handleAddMeal(event) {
        wx.navigateTo({ url: '/pages/add/add?mode=manual&meal=' + event.currentTarget.dataset.key });
    },
    handleHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
    handleOpenGoal() {
        wx.navigateTo({ url: '/pages/goal/goal' });
    },

    handleOpenBody(){wx.navigateTo({url:'/pages/weight/weight'});},

    handleOpenWater() {
        try { this.setData({waterGoalOpen:true,waterGoalDraft:String(settings.getWaterGoal()),waterGoalError:''}); }
        catch(error) { wx.showToast({title:'读取饮水目标失败，请重试',icon:'none'}); }
    },
    closeWaterGoal() {
        this.setData({waterGoalOpen:false,waterGoalError:''});
        if(typeof wx.hideKeyboard==='function')wx.hideKeyboard();
    },
    inputWaterGoal(event) { this.setData({waterGoalDraft:event.detail.value,waterGoalError:''}); },
    stepWaterGoal(event) {
        const delta=Number(event.currentTarget.dataset.delta);
        if(![-100,100].includes(delta))return;
        const current=Number(this.data.waterGoalDraft);
        this.setData({waterGoalDraft:String(Math.max(300,Math.min(6000,(Number.isFinite(current) && current>0?current:settings.getWaterGoal())+delta))),waterGoalError:''});
    },
    saveWaterGoal() {
        const value=Number(this.data.waterGoalDraft);
        if(!Number.isInteger(value) || value<300 || value>6000){this.setData({waterGoalError:'每日目标请填写300–6000之间的整数（ml）'});return;}
        try {
            const saved=settings.setWaterGoal(value),total=Number(this.data.waterTotalText)||0;
            this.setData({waterGoalText:String(saved),waterPercentText:Math.round(total/saved*100)+'%',waterBarStyle:'width: '+Math.min(100,Math.round(total/saved*100))+'%;'});
            this.closeWaterGoal();
            wx.showToast({title:'饮水目标已更新',icon:'none'});
        } catch(error) { this.setData({waterGoalError:'保存失败，请重试'}); }
    },

    handleWaterAdd(event) {
        const ml = Number(event.currentTarget.dataset.ml);
        const that = this;
        return waterStore.add(ml).then(result => {if(!result.error) that.playMascot('water');return that.refresh();});
    },

    handleWaterUndo() {
        const that = this;
        waterStore.removeLast().then(() => that.refresh());
    },

    // 删除改成「点一次待确认、再点一次真正删除」：不依赖 showModal，
    // 预览环境和禁用弹窗的场景下也不会出现点了没反应。3 秒无操作自动取消。
    handleDelete(event) {
        const id = event.currentTarget.dataset.id;
        if (typeof id !== 'string' || id === '') {
            return;
        }
        if (this.data.pendingDeleteId !== id) {
            this.startDeleteConfirm(id);
            return;
        }
        this.clearDeleteTimer();
        const that = this;
        this.setData({ pendingDeleteId: '' });
        store.remove(id).then(result => {
            if (result.error) {
                wx.showToast({ title: '删除失败，请重试', icon: 'none' });
                return;
            }
            wx.showToast({ title: '已删除', icon: 'success' });
            that.refresh();
        });
    },

    startDeleteConfirm(id) {
        const that = this;
        this.clearDeleteTimer();
        this.setData({ pendingDeleteId: id });
        this.deleteTimer = setTimeout(() => {
            that.deleteTimer = null;
            that.setData({ pendingDeleteId: '' });
        }, 3000);
    },

    clearDeleteTimer() {
        if (this.deleteTimer) {
            clearTimeout(this.deleteTimer);
            this.deleteTimer = null;
        }
    },
}));
