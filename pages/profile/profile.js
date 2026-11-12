const {withTheme}=require('../../utils/theme');
const { createRecordStore, formatDate } = require('../../utils/record-store.js');
const { createWeightStore } = require('../../utils/body-store.js');
const settings = require('../../utils/settings.js');
const bmiUtil = require('../../utils/bmi.js');
const units = require('../../utils/units.js');
const avatars = require('../../utils/avatars.js');
const avatarImage = require('../../utils/avatar-image.js');

const store = createRecordStore({ storageKey: 'cal_records' });
const weightStore = createWeightStore({ storageKey: 'cal_weight' });

const MENU_GROUPS=[
 {title:'健康管理',items:[{key:'plan',label:'计划制定',icon:'calendar',route:'/pages/goal/goal'},{key:'health',label:'健康档案',icon:'file',route:'/pages/health/health'},{key:'history',label:'历史记录',icon:'clock',route:'/pages/history/history'},{key:'stats',label:'数据总览',icon:'chart',route:'/pages/stats/stats'}]},
 {title:'功能设置',items:[{key:'ai',label:'AI 服务',icon:'robot',route:'/pages/ai/ai'},{key:'prefs',label:'偏好设置',icon:'settings',route:'/pages/prefs/prefs'}]},
 {title:'数据与应用',items:[{key:'data',label:'数据管理',icon:'data',route:'/pages/data/data'},{key:'about',label:'关于与隐私',icon:'info',route:'/pages/about/about'}]},
];
Page(withTheme({
    data: {
        menuGroups:MENU_GROUPS,
        nickname: '我的档案',
        avatarKey: avatars.DEFAULT_AVATAR,
        avatars: avatars.AVATARS,
        avatarImage: '',
        avatarPickerOpen: false,
        editingName: false,
        nameDraft: '',
        nameError: '',
        summaryLine: '还没填身体档案，点下面「计划制定」填一下',
        // 三格数据：身高 / 体重 / 记录天数，点开小悬浮框改
        heightText: '—',
        heightRaw: 0,
        weightText: '—',
        weightRaw: 0,
        weightUnit: 'kg',
        dayCountText: '0',
        popOpen: false,
        popKey: '',
        popTitle: '',
        popSub: '',
        popDesc: '',
        popValue: '',
        popUnit: '',
        popPlaceholder: '',
        popError: '',
        popFocus: false,
        popTop: 300,
        streakText: '0',
        totalText: '0',
        avgText: '—',
        historyHint: '',
        statsHint: '',
        goalHint: '',
        energyUnit: 'kcal',
        prefsHint: '',
    },

    onShow() {
        this.refresh();
    },

    onPullDownRefresh() {
        this.refresh().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    refresh() {
        const today = formatDate(new Date());
        const goal = settings.getGoal();
        const profile = settings.getProfile() || {};

        return Promise.all([store.list(), weightStore.list()]).then(([recordRes, weightRes]) => {
            const records = recordRes.error || !Array.isArray(recordRes.data) ? [] : recordRes.data;
            const weights = weightRes.error || !Array.isArray(weightRes.data) ? [] : weightRes.data;

            const dayMap = {};
            let totalKcal = 0;
            for (let i = 0; i < records.length; i += 1) {
                const item = records[i];
                const kcal = Number(item.kcal);
                if (!item.date) {
                    continue;
                }
                dayMap[item.date] = (dayMap[item.date] || 0) + (Number.isFinite(kcal) ? kcal : 0);
                if (Number.isFinite(kcal)) {
                    totalKcal += kcal;
                }
            }

            const dayCount = Object.keys(dayMap).length;
            const streak = this.countStreak(dayMap, new Date());
            const avg = dayCount > 0 ? Math.round(totalKcal / dayCount) : 0;

            const heightCm = Number(profile.height) > 0 ? Number(profile.height) : 0;
            const latestKg = require('../../utils/body-measurements').current().kg.value || 0;
            const bmi = heightCm > 0 && latestKg > 0 ? bmiUtil.calcBmi(latestKg, heightCm) : null;

            // 身高、体重已经单独占一格，副标题只留 BMI 与目标，避免重复。
            const parts = [];
            if (bmi !== null) {
                parts.push('BMI ' + bmi.text + ' ' + bmi.level.text);
            }
            if (heightCm > 0 || latestKg > 0) {
                parts.push('目标 ' + units.energyText(goal));
            }

            const displayWeight = latestKg > 0 ? units.toDisplayWeight(latestKg) : 0;
            const weightUnit = units.weightUnitLabel();

            this.setData({
                nickname: settings.getNickname(),
                avatarKey: settings.getAvatar(),
                avatarImage: this.resolveAvatarImage(),
                summaryLine: parts.length > 0 ? parts.join(' · ') : '还没填身体档案，点下面「计划制定」填一下',
                heightText: heightCm > 0 ? String(Math.round(heightCm)) : '—',
                heightRaw: heightCm,
                weightText: displayWeight > 0 ? String(displayWeight) : '—',
                weightRaw: latestKg,
                weightUnit: weightUnit,
                dayCountText: String(dayCount),
                streakText: String(streak),
                totalText: String(records.length),
                avgText: dayCount > 0 ? String(avg) : '—',
                historyHint: dayCount > 0 ? dayCount + ' 天' : '还没有记录',
                statsHint: records.length > 0 ? '累计 ' + records.length + ' 条' : '暂无数据',
                goalHint: units.energyText(goal),
                energyUnit: units.energyUnitLabel(),
                prefsHint: units.energyUnitLabel() + ' · ' + weightUnit,
            });
        });
    },

    // 从今天往前数，连续有记录的天数；今天没记就从昨天开始算，避免早上打开就清零。
    countStreak(dayMap, now) {
        const cursor = new Date(now.getTime());
        if (!dayMap[formatDate(cursor)]) {
            cursor.setDate(cursor.getDate() - 1);
        }
        let streak = 0;
        for (let guard = 0; guard < 3650; guard += 1) {
            if (!dayMap[formatDate(cursor)]) {
                break;
            }
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
        }
        return streak;
    },

    latestWeight(weights) {
        let latest = null;
        for (let i = 0; i < weights.length; i += 1) {
            const item = weights[i];
            const kg = Number(item.kg);
            if (!Number.isFinite(kg) || kg <= 0) {
                continue;
            }
            if (latest === null || Number(item.ts) > Number(latest.ts)) {
                latest = item;
            }
        }
        return latest === null ? 0 : Number(latest.kg);
    },

    // 存过路径也可能文件已经不在了（清缓存、系统清理），每次进来校验一次，坏记录顺手清掉。
    resolveAvatarImage() {
        const path = settings.getAvatarImage();
        if (path === '') {
            return '';
        }
        if (avatarImage.exists(path)) {
            return path;
        }
        settings.clearAvatarImage();
        return '';
    },

    handleOpenAvatar() {
        this.setData({ avatarPickerOpen: true });
    },

    handleCloseAvatar() {
        this.setData({ avatarPickerOpen: false });
    },

    // 面板本体不冒泡到遮罩，否则点一下就关
    handleSheetTap() {},

    // 选本地图片：临时路径必须复制到用户目录才留得住，成功后把上一张删掉，避免文件越堆越多。
    handlePickImage() {
        const that = this;
        avatarImage.pickImage().then(picked => {
            if (picked.cancelled) {
                return;
            }
            if (picked.error !== '' || picked.path === '') {
                wx.showToast({ title: picked.error || '没有选到图片', icon: 'none' });
                return;
            }
            avatarImage.saveImage(picked.path).then(saved => {
                if (saved.error !== '' || saved.path === '') {
                    wx.showToast({ title: saved.error || '保存图片失败', icon: 'none' });
                    return;
                }
                const previous = that.data.avatarImage;
                settings.setAvatarImage(saved.path);
                that.setData({ avatarImage: saved.path });
                if (previous !== '' && previous !== saved.path) {
                    avatarImage.removeImage(previous);
                }
                wx.showToast({ title: '头像已换成这张照片', icon: 'none' });
            });
        });
    },

    // 换回预设头像：清掉图片记录与文件，预设 key 还留在原来的选择上。
    handleResetImage() {
        const previous = this.data.avatarImage;
        settings.clearAvatarImage();
        this.setData({ avatarImage: '' });
        if (previous !== '') {
            avatarImage.removeImage(previous);
        }
        wx.showToast({ title: '已恢复预设头像', icon: 'none' });
    },

    // 图片加载失败（文件被删/损坏）：回退到预设头像，别让头像位置空着。
    handleAvatarImageError() {
        const broken = this.data.avatarImage;
        settings.clearAvatarImage();
        this.setData({ avatarImage: '' });
        if (broken !== '') {
            avatarImage.removeImage(broken);
        }
    },

    handlePickAvatar(event) {
        const key = event.currentTarget.dataset.key;
        const saved = settings.setAvatar(key);
        // 选了预设就以预设为准，图片记录一并清掉，否则图片优先级更高会看起来没生效。
        const previous = this.data.avatarImage;
        if (previous !== '') {
            settings.clearAvatarImage();
            avatarImage.removeImage(previous);
        }
        this.setData({ avatarKey: saved, avatarImage: '' });
        wx.showToast({ title: '已换成' + avatars.avatarLabel(saved), icon: 'none' });
    },

    handleEditName() {
        this.setData({
            editingName: true,
            nameDraft: this.data.nickname,
            nameError: '',
        });
    },

    handleNameInput(event) {
        this.setData({ nameDraft: event.detail.value, nameError: '' });
    },

    handleNameSave() {
        const draft = typeof this.data.nameDraft === 'string' ? this.data.nameDraft.trim() : '';
        if (draft === '') {
            this.setData({ nameError: '昵称不能为空' });
            return;
        }
        const saved = settings.setNickname(draft);
        this.setData({
            nickname: saved,
            editingName: false,
            nameDraft: '',
            nameError: '',
        });
        wx.showToast({ title: '昵称已保存', icon: 'none' });
    },

    handleNameCancel() {
        this.setData({ editingName: false, nameDraft: '', nameError: '' });
    },

    handleMenu(event) {
        const key=event.currentTarget.dataset.key;
        const item=MENU_GROUPS.reduce((all,group)=>all.concat(group.items),[]).find(item=>item.key===key);
        if(item)wx.navigateTo({url:item.route});
    },

    handleOpenHistory() {
        wx.navigateTo({ url: '/pages/history/history' });
    },

    handleOpenAnalysis() {
        wx.navigateTo({ url: '/pages/analysis/analysis' });
    },

    handleOpenStats() {
        wx.navigateTo({ url: '/pages/stats/stats' });
    },

    handleOpenHealth() {
        wx.navigateTo({ url: '/pages/health/health' });
    },

    handleOpenGoal() {
        wx.navigateTo({ url: '/pages/goal/goal' });
    },

    // 三格数据：点哪格弹哪个悬浮框。身高、体重可改，记录天数只读。
    handleMetricTap(event) {
        const key = event.currentTarget.dataset.key;
        if (key === 'height') {
            this.setData({
                popOpen: true,
                popKey: 'height',
                popTitle: '身高',
                popSub: '改完 BMI 和健康档案会一起更新',
                popValue: this.data.heightRaw > 0 ? String(Math.round(this.data.heightRaw)) : '',
                popUnit: 'cm',
                popPlaceholder: '如 170',
                popError: '',
                popFocus: true,
            });
        } else if (key === 'weight') {
            this.setData({
                popOpen: true,
                popKey: 'weight',
                popTitle: '体重',
                popSub: '保存后会记成今天的一条体重',
                popValue: this.data.weightRaw > 0 ? String(units.toDisplayWeight(this.data.weightRaw)) : '',
                popUnit: this.data.weightUnit,
                popPlaceholder: this.data.weightUnit === '斤' ? '如 121' : (this.data.weightUnit === 'lb' ? '如 133' : '如 60.5'),
                popError: '',
                popFocus: true,
            });
        } else {
            this.setData({
                popOpen: true,
                popKey: 'days',
                popTitle: '记录天数',
                popDesc: '按有记录的日期统计，共 ' + this.data.dayCountText + ' 天 · 累计 ' + this.data.totalText
                    + ' 条 · 连续 ' + this.data.streakText + ' 天',
                popError: '',
                popFocus: false,
            });
        }
        this.measurePop();
    },

    // 悬浮框从三格数据**下方**浮出来，只盖下面的空白分组区，不挡昵称和摘要文字。
    measurePop() {
        if (typeof wx.createSelectorQuery !== 'function') {
            this.setData({ popTop: 300 });
            return;
        }
        const that = this;
        wx.createSelectorQuery()
            .select('.metric-row')
            .boundingClientRect(rect => {
                if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.height)) {
                    that.setData({ popTop: 300 });
                    return;
                }
                that.setData({ popTop: Math.round(rect.top + rect.height + 12) });
            })
            .exec();
    },

    handlePopInput(event) {
        this.setData({ popValue: event.detail.value, popError: '' });
    },

    handlePopClose() {
        this.setData({ popOpen: false, popError: '', popFocus: false });
    },

    handlePopSave() {
        if (this.data.popKey === 'height') {
            this.saveHeight();
            return;
        }
        if (this.data.popKey === 'weight') {
            this.saveWeight();
        }
    },

    saveHeight() {
        const raw = String(this.data.popValue === undefined ? '' : this.data.popValue).trim();
        const value = Number(raw);
        if (raw === '' || !Number.isFinite(value) || value < 80 || value > 250) {
            this.setData({ popError: '请输入 80–250 之间的身高' });
            return;
        }
        const profile = Object.assign({}, settings.getProfile() || {});
        profile.height = Math.round(value);
        settings.setProfile(profile);
        this.setData({ popOpen: false, popError: '', popFocus: false });
        this.markBody();
        this.refresh();
        wx.showToast({ title: '身高已更新', icon: 'none' });
    },

    saveWeight() {
        const raw = String(this.data.popValue === undefined ? '' : this.data.popValue).trim();
        const value = Number(raw);
        if (raw === '' || !Number.isFinite(value) || value <= 0) {
            this.setData({ popError: '请输入有效的体重' });
            return;
        }
        const kg = units.toKg(value);
        if (!Number.isFinite(kg) || kg < 20 || kg > 300) {
            this.setData({ popError: '体重看起来不对，请检查数值' });
            return;
        }
        const that = this;
        require('../../utils/body-measurements').save({kg}).then(result => {
            if (result.error) {
                that.setData({ popError: '保存失败，请重试' });
                return;
            }
            that.setData({ popOpen: false, popError: '', popFocus: false });
            that.markBody();
            that.refresh();
            wx.showToast({ title: '体重已记录', icon: 'none' });
        });
    },

    // 身高/体重变了要让首页的 BMI 卡知道。
    markBody() {
        const app = typeof getApp === 'function' ? getApp() : null;
        if (app && typeof app.markBodyChanged === 'function') {
            app.markBodyChanged();
        }
    },

    noop() {},

    handleOpenPrefs() {
        wx.navigateTo({ url: '/pages/prefs/prefs' });
    },

    handleOpenAi() {
        wx.navigateTo({ url: '/pages/ai/ai' });
    },

    handleOpenData() {
        wx.navigateTo({ url: '/pages/data/data' });
    },

    handleOpenAbout() {
        wx.navigateTo({ url: '/pages/about/about' });
    },

}));
