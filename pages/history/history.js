const {withTheme}=require('../../utils/theme');
const { createRecordStore, formatDate } = require('../../utils/record-store.js');
const settings = require('../../utils/settings.js');
const measurements = require('../../utils/body-measurements');
const units = require('../../utils/units.js');

const MEAL_LABELS = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '加餐',
};

const DAY_COUNT = 14;

const store = createRecordStore({ storageKey: 'cal_records' });

Page(withTheme({
    data: {
        viewState: 'loading',
        days: [],
        goal: 2000,
        pendingDeleteId: '',
        historyTab: 'food', bodyMetric: 'kg', bodyRows: [], bodyGroups: [], bodyError: '', bodyDeleting: false,
    },

    onLoad(options) { if (options && options.tab === 'body') this.setData({ historyTab: 'body' }); },
    switchHistoryTab(event) {
        const tab = event.currentTarget.dataset.tab;
        if (tab !== 'food' && tab !== 'body') return;
        this.clearDeleteTimer(); this.setData({ historyTab: tab, pendingDeleteId: '' });
    },
    switchBodyMetric(event) {
        const metric = event.currentTarget.dataset.metric;
        if (!['kg', 'waistCm', 'hipCm'].includes(metric)) return;
        this.clearDeleteTimer();
        this.setData({ bodyMetric: metric, pendingDeleteId: '' });
    },
    refreshBody() {
        try {
            this.bodySource = measurements.history();
            const fields = [{ key: 'kg', label: '体重' }, { key: 'waistCm', label: '腰围' }, { key: 'hipCm', label: '臀围' }];
            const groups = fields.map(field => ({ key: field.key, label: field.label, rows: this.bodySource.map((row, index) => {
                if (!Number.isFinite(row[field.key])) return null;
                const date = new Date(row.ts);
                const value = field.key === 'kg' ? units.toDisplayWeight(row.kg).toFixed(1) + ' ' + units.weightUnitLabel() : row[field.key] + ' cm';
                return { index, key: field.key + '-' + index, date: row.date, time: ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2), value };
            }).filter(Boolean) }));
            this.setData({ bodyGroups: groups, bodyRows: this.bodySource, bodyError: '' });
        } catch (_) { this.setData({ bodyGroups: [], bodyRows: [], bodyError: '身体记录读取失败，请重试' }); }
    },
    handleDeleteBody(event) {
        if (this.data.bodyDeleting) return;
        const index = Number(event.currentTarget.dataset.index), field = event.currentTarget.dataset.field;
        const row = this.bodySource && this.bodySource[index];
        if (!row || !Number.isFinite(row[field])) return;
        const id = 'body-' + field + '-' + index;
        if (this.data.pendingDeleteId !== id) { this.startDeleteConfirm(id); return; }
        this.clearDeleteTimer(); this.setData({ pendingDeleteId: '', bodyDeleting: true });
        measurements.remove(row, field).then(result => {
            this.setData({ bodyDeleting: false });
            if (result.error) { wx.showToast({ title: result.error.message, icon: 'none' }); return; }
            wx.showToast({ title: '已删除', icon: 'success' }); this.refreshBody();
        });
    },
    onShow() {
        this.refresh();
        this.refreshBody();
    },

    onPullDownRefresh() {
        this.refresh().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    refresh() {
        const goal = settings.getGoal();
        return store.list().then(result => {
            if (result.error) {
                this.setData({ viewState: 'error' });
                return;
            }

            const records = result.data;
            if (records.length === 0) {
                this.setData({ viewState: 'empty', days: [], goal: goal });
                return;
            }

            const dayMap = {};
            for (let i = 0; i < records.length; i += 1) {
                const record = records[i];
                if (!dayMap[record.date]) {
                    dayMap[record.date] = [];
                }
                dayMap[record.date].push(record);
            }

            const dates = Object.keys(dayMap).sort().reverse().slice(0, DAY_COUNT);
            const days = [];
            for (let i = 0; i < dates.length; i += 1) {
                const date = dates[i];
                const items = dayMap[date];
                let total = 0;
                const listItems = [];
                for (let j = 0; j < items.length; j += 1) {
                    total += items[j].kcal;
                    listItems.push({
                        id: items[j].id,
                        name: items[j].name,
                        mealLabel: MEAL_LABELS[items[j].meal] || '加餐',
                        kcalText: units.energyText(items[j].kcal),
                        hasVoice: typeof items[j].voice === 'string' && items[j].voice !== '',
                    });
                }
                days.push({
                    date: date,
                    dateText: this.buildDateText(date),
                    totalText: units.energyText(total),
                    overGoal: total > goal,
                    percentText: goal > 0 ? Math.round((total / goal) * 100) + '%' : '',
                    barStyle: this.buildBarStyle(total, goal),
                    // 折叠状态记在实例上：刷新重建 days 时保留用户上次的展开/收起
                    open: this.openSet ? this.openSet[date] !== false : true,
                    items: listItems,
                });
            }

            this.setData({ viewState: 'ready', days: days, goal: goal });
        });
    },

    // 点日期头折叠/展开当日明细；箭头跟着转，用户能看出这行是可以点的。
    toggleDay(event) {
        const date = event.currentTarget.dataset.date;
        if (typeof date !== 'string' || date === '') {
            return;
        }
        if (!this.openSet) {
            this.openSet = {};
        }
        const days = this.data.days;
        for (let i = 0; i < days.length; i += 1) {
            if (days[i].date !== date) {
                continue;
            }
            const open = !days[i].open;
            this.openSet[date] = open;
            // setData 用「路径写法」只更新这一项，不用整包重发
            const patch = {};
            patch['days[' + i + '].open'] = open;
            this.setData(patch);
            return;
        }
    },

    buildDateText(dateStr) {
        const parts = dateStr.split('-');
        const month = Number(parts[1]);
        const day = Number(parts[2]);
        const today = formatDate(new Date());
        const label = dateStr === today ? '今天' : month + '月' + day + '日';
        const weekday = new Date(Number(parts[0]), month - 1, day).getDay();
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        return label + ' · 周' + weekdays[weekday];
    },

    buildBarStyle(total, goal) {
        const ratio = goal > 0 ? Math.min(total / goal, 1) : 0;
        const color = total > goal ? '#e5484d' : '#e1b13c';
        return 'width: ' + Math.max(Math.round(ratio * 100), 4) + '%; background: ' + color + ';';
    },

    // 与首页一致：点一次待确认，再点一次才删除，不依赖 showModal。
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

    handleGoToday() {
        wx.redirectTo({ url: '/pages/index/index' });
    },

    onUnload() {
        this.clearDeleteTimer();
    },
}));
