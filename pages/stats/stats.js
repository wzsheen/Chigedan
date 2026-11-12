const {withTheme}=require('../../utils/theme');
const { createRecordStore } = require('../../utils/record-store.js');
const settings = require('../../utils/settings.js');
const { buildStats } = require('../../utils/stats.js');
const units = require('../../utils/units.js');

const store = createRecordStore({ storageKey: 'cal_records' });

Page(withTheme({
    data: {
        viewState: 'loading',
        dayCount: 0,
        streak: 0,
        goodDays: 0,
        avgKcal: 0,
        totalRecords: 0,
        goal: 2000,
        days: [],
        macro: { p: 0, c: 0, f: 0, pPct: 0, cPct: 0, fPct: 0, hasData: false },
        topFoods: [],
        hasAny: false,
        energyUnit: 'kcal',
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
        const that = this;
        return store.list().then(result => {
            if (result.error) {
                that.setData({ viewState: 'error' });
                return;
            }
            const stats = buildStats(result.data, settings.getGoal(), new Date());
            that.setData({
                viewState: stats.hasAny ? 'ready' : 'empty',
                dayCount: stats.dayCount,
                streak: stats.streak,
                goodDays: stats.goodDays,
                avgKcal: units.toDisplayEnergy(stats.avgKcal),
                totalRecords: stats.totalRecords,
                goal: units.toDisplayEnergy(stats.goal),
                days: stats.days.map(item => ({
                    key: item.key,
                    label: item.label,
                    text: item.kcal > 0 ? String(units.toDisplayEnergy(item.kcal)) : '',
                    height: item.height,
                    tone: item.tone,
                })),
                macro: stats.macro,
                topFoods: stats.topFoods.map(item => ({
                    name: item.name,
                    count: item.count,
                    countText: item.countText,
                    kcalText: units.energyText(item.kcal),
                })),
                energyUnit: units.energyUnitLabel(),
                hasAny: stats.hasAny,
            });
        });
    },

    handleGoBack() {
        wx.navigateBack();
    },

    handleGoAdd() {
        wx.navigateTo({ url: '/pages/add/add' });
    },
}));
