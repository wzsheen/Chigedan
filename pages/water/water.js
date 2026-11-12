const {withTheme}=require('../../utils/theme');
const { createWaterStore } = require('../../utils/body-store.js');
const settings = require('../../utils/settings.js');

const waterStore = createWaterStore({ storageKey: 'cal_water' });
const QUICK_OPTIONS = [150, 250, 350, 500];

function pad2(num) {
    return String(num).padStart(2, '0');
}

function timeText(ts) {
    const date = new Date(Number(ts));
    if (!Number.isFinite(date.getTime())) {
        return '--:--';
    }
    return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

Page(withTheme({
    data: {
        totalText: '0',
        goalText: '1500',
        percentText: '0%',
        statusText: '',
        ringStyle: '',
        quickOptions: QUICK_OPTIONS,
        customMl: '',
        goalInput: '1500',
        entries: [],
        hasEntries: false,
        formError: '',
        pendingDeleteTs: 0,
        pendingClear: false,
    },

    onLoad() {
        this.refresh();
    },

    onShow() {
        this.refresh();
    },

    refresh() {
        const that = this;
        const goal = settings.getWaterGoal();
        waterStore.getToday().then(result => {
            if (result.error) {
                that.setData({ formError: '数据读取失败，请重试' });
                return;
            }
            that.apply(result.data.total, result.data.entries, goal);
        });
    },

    apply(total, entries, goal) {
        const percent = goal > 0 ? Math.round((total / goal) * 100) : 0;
        const ratio = goal > 0 ? Math.min(total / goal, 1) : 0;
        const deg = Math.round(ratio * 360);
        let statusText = '';
        if (total === 0) {
            statusText = '今天还没喝水，先来一杯';
        } else if (total >= goal) {
            statusText = '已达标，超出目标 ' + (total - goal) + ' ml';
        } else {
            statusText = '还差 ' + (goal - total) + ' ml';
        }

        const list = (entries || []).map(item => ({
            ts: item.ts,
            timeText: timeText(item.ts),
            mlText: item.ml + ' ml',
        }));

        this.setData({
            totalText: String(total),
            goalText: String(goal),
            goalInput: String(goal),
            percentText: percent + '%',
            statusText: statusText,
            ringStyle: 'background: conic-gradient(' + (total >= goal ? '#2fb37a' : '#3b9ae1') + ' ' + deg + 'deg, rgba(255,255,255,0.85) 0deg);',
            entries: list,
            hasEntries: list.length > 0,
        });
    },

    handleQuickAdd(event) {
        const ml = Number(event.currentTarget.dataset.ml);
        this.addWater(ml);
    },

    addWater(ml) {
        const that = this;
        waterStore.add(ml).then(result => {
            if (result.error) {
                that.setData({ formError: result.error.message || '添加失败' });
                return;
            }
            that.setData({ formError: '', customMl: '' });
            that.refresh();
        });
    },

    handleCustomInput(event) {
        this.setData({ customMl: event.detail.value, formError: '' });
    },

    handleCustomAdd() {
        const value = Number(this.data.customMl);
        if (!Number.isFinite(value) || value <= 0) {
            this.setData({ formError: '请输入有效的水量' });
            return;
        }
        if (value > 5000) {
            this.setData({ formError: '单次最多 5000ml' });
            return;
        }
        this.addWater(value);
    },

    handleGoalInput(event) {
        this.setData({ goalInput: event.detail.value, formError: '' });
    },

    handleGoalMinus() {
        const current = Number(this.data.goalInput);
        const next = Math.max(300, (Number.isFinite(current) ? current : 1500) - 100);
        this.setData({ goalInput: String(next) });
    },

    handleGoalPlus() {
        const current = Number(this.data.goalInput);
        const next = Math.min(6000, (Number.isFinite(current) ? current : 1500) + 100);
        this.setData({ goalInput: String(next) });
    },

    handleGoalSave() {
        const value = Number(this.data.goalInput);
        if (!Number.isFinite(value) || value < 300 || value > 6000) {
            this.setData({ formError: '目标请填 300–6000ml' });
            return;
        }
        settings.setWaterGoal(value);
        this.setData({ formError: '' });
        this.refresh();
        wx.showToast({ title: '目标已更新', icon: 'none' });
    },

    // 删除与清空都改成「点一次待确认、再点一次执行」，不依赖 showModal。
    handleDelete(event) {
        const ts = Number(event.currentTarget.dataset.ts);
        if (!Number.isFinite(ts) || ts <= 0) {
            return;
        }
        if (this.data.pendingDeleteTs !== ts) {
            this.startConfirm({ pendingDeleteTs: ts });
            return;
        }
        this.clearDeleteTimer();
        const that = this;
        this.setData({ pendingDeleteTs: 0 });
        waterStore.remove(ts).then(result => {
            if (result.error) {
                wx.showToast({ title: '删除失败，请重试', icon: 'none' });
                return;
            }
            wx.showToast({ title: '已删除', icon: 'success' });
            that.refresh();
        });
    },

    handleClear() {
        if (!this.data.pendingClear) {
            this.startConfirm({ pendingClear: true });
            return;
        }
        this.clearDeleteTimer();
        const that = this;
        this.setData({ pendingDeleteTs: 0, pendingClear: false });
        waterStore.clearToday().then(result => {
            if (result.error) {
                wx.showToast({ title: '清空失败，请重试', icon: 'none' });
                return;
            }
            wx.showToast({ title: '已清空', icon: 'success' });
            that.refresh();
        });
    },

    startConfirm(patch) {
        const that = this;
        this.clearDeleteTimer();
        this.setData(Object.assign({ pendingDeleteTs: 0, pendingClear: false }, patch));
        this.deleteTimer = setTimeout(() => {
            that.deleteTimer = null;
            that.setData({ pendingDeleteTs: 0, pendingClear: false });
        }, 3000);
    },

    clearDeleteTimer() {
        if (this.deleteTimer) {
            clearTimeout(this.deleteTimer);
            this.deleteTimer = null;
        }
    },

    onUnload() {
        this.clearDeleteTimer();
    },
}));
