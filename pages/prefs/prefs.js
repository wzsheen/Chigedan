const {withTheme}=require('../../utils/theme');
const units = require('../../utils/units.js');
const settings = require('../../utils/settings.js');

Page(withTheme({
    data: {
        energyUnit: 'kcal',
        weightUnit: 'kg',
        afterSave: 'back',
        energyHint: '',
        weightHint: '',
        afterSaveHint: '',
        waterDrafts:['100','250','500'],
        homeDisplay:{mascotAnimation:true,scienceAutoplay:true},
        quickError:'',
    },

    onShow() {
        this.load();
    },

    load() {
        const energyUnit = units.getEnergyUnit();
        const weightUnit = units.getWeightUnit();
        const afterSave = settings.getAfterSave();
        this.setData({
            waterDrafts:settings.getWaterShortcuts().map(String),
            homeDisplay:settings.getHomeDisplay(),
            quickError:'',
            energyUnit: energyUnit,
            weightUnit: weightUnit,
            afterSave: afterSave,
            energyHint: energyUnit === 'kj'
                ? '230 kcal 会显示为 962 kJ'
                : '营养标签上的千焦会按 1 kcal ≈ 4.184 kJ 换算',
            weightHint: weightUnit === 'jin'
                ? '70.0 kg 会显示为 140.0 斤'
                : (weightUnit === 'lb' ? '70.0 kg 会显示为 154.3 lb' : '按公斤显示'),
            afterSaveHint: afterSave === 'stay'
                ? '连续记多笔时更顺手'
                : '记完直接看今天的进度',
        });
    },

    handleTheme(event) {
        const key=event.currentTarget.dataset.key;
        if(!['simple','light','dark','system'].includes(key))return;
        settings.setTheme(key);require('../../utils/theme').apply(this);
    },

    handleNavOpacity(event) {
        const value=event.detail.value;if(typeof value!=='number' || !Number.isFinite(value))return;
        this.setData({navOpacity:Math.max(0,Math.min(100,Math.round(value)))});
    },
    saveNavOpacity(event) {this.handleNavOpacity(event);settings.setNavOpacity(this.data.navOpacity);},
    handleNavBlur(event) {
        const value=event.detail.value;if(typeof value!=='number' || !Number.isFinite(value))return;
        this.setData({navBlur:Math.max(0,Math.min(40,Math.round(value)))});
    },
    saveNavBlur(event) {this.handleNavBlur(event);settings.setNavBlur(this.data.navBlur);},
    handleNavGlass(event) {this.setData({navGlass:settings.setNavGlass(event.detail.value)});},

    handleEnergy(event) {
        const unit = event.currentTarget.dataset.key;
        units.setEnergyUnit(unit);
        this.load();
        wx.showToast({ title: '已切换为 ' + units.energyUnitLabel(), icon: 'none' });
    },

    handleQuickInput(event) {
        const index=Number(event.currentTarget.dataset.index);
        if(!Number.isInteger(index) || index<0 || index>2)return;
        const drafts=this.data.waterDrafts.slice();drafts[index]=event.detail.value;
        this.setData({waterDrafts:drafts,quickError:''});
    },
    commitQuick() {
        const values=this.data.waterDrafts.map(value=>Number(value));
        if(!settings.validWaterShortcuts(values)){
            this.setData({quickError:'请输入三个不同的整数水量，每个为1–5000 ml'});return false;
        }
        settings.setWaterShortcuts(values);this.setData({quickError:''});return true;
    },
    handleQuickRestore() { settings.setWaterShortcuts(settings.DEFAULT_WATER_SHORTCUTS);this.setData({waterDrafts:settings.DEFAULT_WATER_SHORTCUTS.map(String),quickError:''}); },
    handleDisplay(event) {
        const key=event.currentTarget.dataset.key;
        if(!['mascotAnimation','scienceAutoplay','autoUpdate'].includes(key))return;
        this.setData({homeDisplay:settings.setHomeDisplay({[key]:Boolean(event.detail.value)})});
    },
    onHide() { this.commitQuick(); },

    handleWeight(event) {
        const unit = event.currentTarget.dataset.key;
        units.setWeightUnit(unit);
        this.load();
        wx.showToast({ title: '已切换为 ' + units.weightUnitLabel(), icon: 'none' });
    },

    handleAfterSave(event) {
        const mode = event.currentTarget.dataset.key;
        settings.setAfterSave(mode);
        this.load();
    },
}));
