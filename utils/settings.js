// 每日目标设置：本地存储。

const avatars = require('./avatars.js');

const DEFAULT_GOAL = 2000;

function getGoal() {
    const value = Number(wx.getStorageSync('cal_goal'));
    if (Number.isFinite(value) && value > 0) {
        return Math.round(value);
    }
    return DEFAULT_GOAL;
}

function setGoal(value) {
    const goal = Number(value);
    if (!Number.isFinite(goal) || goal <= 0) {
        return getGoal();
    }
    wx.setStorageSync('cal_goal', Math.round(goal));
    return Math.round(goal);
}

// 每日饮水目标（ml）：默认 1500，可在喝水页调整。
const DEFAULT_WATER_GOAL = 1500;

function getWaterGoal() {
    const value = Number(wx.getStorageSync('cal_water_goal'));
    if (Number.isFinite(value) && value > 0) {
        return Math.round(value);
    }
    return DEFAULT_WATER_GOAL;
}

function setWaterGoal(value) {
    const goal = Number(value);
    if (!Number.isFinite(goal) || goal <= 0) {
        return getWaterGoal();
    }
    const safe = Math.max(300, Math.min(6000, Math.round(goal)));
    wx.setStorageSync('cal_water_goal', safe);
    return safe;
}

// 身体档案：{ sex, age, height, weight, activity, goalType }
function getProfile() {
    const value = wx.getStorageSync('cal_profile');
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return null;
}

function setProfile(profile) {
    if (profile !== null && typeof profile === 'object' && !Array.isArray(profile)) {
        wx.setStorageSync('cal_profile', profile);
    }
    return profile;
}

// 首次使用引导是本机偏好，不写入身体资料或饮食备份。
function needsPlanGuide() {
    const profile=getProfile() || {},goal=Number(wx.getStorageSync('cal_goal'));
    const complete=['male','female'].includes(profile.sex) && Number(profile.age)>0 && Number(profile.age)<=120 && Number(profile.height)>=80 && Number(profile.height)<=250 && Number(profile.weight)>0 && Number(profile.weight)<=500 && Number.isFinite(goal) && goal>0;
    return !complete && wx.getStorageSync('cal_plan_guide_dismissed')!==true;
}
function dismissPlanGuide() { wx.setStorageSync('cal_plan_guide_dismissed',true); }

// 三大营养素目标（克）：{ protein, carb, fat }
function getMacroTargets() {
    const value = wx.getStorageSync('cal_macro_targets');
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return null;
}

function setMacroTargets(targets) {
    if (targets !== null && typeof targets === 'object' && !Array.isArray(targets)) {
        wx.setStorageSync('cal_macro_targets', targets);
    }
    return targets;
}

// 昵称：默认「我的档案」，个人中心可改。
const DEFAULT_NICKNAME = '我的档案';

function getNickname() {
    const value = wx.getStorageSync('cal_nickname');
    if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
    }
    return DEFAULT_NICKNAME;
}

function setNickname(value) {
    const text = typeof value === 'string' ? value.trim().slice(0, 12) : '';
    const safe = text === '' ? DEFAULT_NICKNAME : text;
    wx.setStorageSync('cal_nickname', safe);
    return safe;
}

// 头像：8 套预设里的一个 key，默认橘子猫。
function getAvatar() {
    let value = '';
    try {
        value = wx.getStorageSync('cal_avatar');
    } catch (err) {
        value = '';
    }
    return avatars.isAvatarKey(value) ? value : avatars.DEFAULT_AVATAR;
}

function setAvatar(key) {
    const safe = avatars.isAvatarKey(key) ? key : avatars.DEFAULT_AVATAR;
    wx.setStorageSync('cal_avatar', safe);
    return safe;
}

// 自定义图片头像：存用户目录下的文件路径，空串表示用预设头像。
// 图片优先于预设 key 显示，换预设时会把图片清掉（见 profile 页）。
function getAvatarImage() {
    let value = '';
    try {
        value = wx.getStorageSync('cal_avatar_image');
    } catch (err) {
        value = '';
    }
    return typeof value === 'string' ? value : '';
}

function setAvatarImage(path) {
    const safe = typeof path === 'string' ? path : '';
    wx.setStorageSync('cal_avatar_image', safe);
    return safe;
}

function clearAvatarImage() {
    wx.setStorageSync('cal_avatar_image', '');
    return '';
}

// 记完一笔后的去向：back 返回首页 / stay 留在添加页继续记。
const DEFAULT_AFTER_SAVE = 'back';

function getAfterSave() {
    const value = wx.getStorageSync('cal_after_save');
    return value === 'stay' ? 'stay' : DEFAULT_AFTER_SAVE;
}

function setAfterSave(value) {
    const safe = value === 'stay' ? 'stay' : DEFAULT_AFTER_SAVE;
    wx.setStorageSync('cal_after_save', safe);
    return safe;
}

const DEFAULT_WATER_SHORTCUTS = [100,250,500];
function validWaterShortcuts(value) {
    return Array.isArray(value) && value.length===3 && value.every(n=>typeof n==='number' && Number.isInteger(n) && n>0 && n<=5000) && new Set(value).size===3;
}
function getWaterShortcuts() {
    const value=wx.getStorageSync('cal_water_shortcuts');
    return validWaterShortcuts(value)?value.slice():DEFAULT_WATER_SHORTCUTS.slice();
}
function setWaterShortcuts(value) {
    if(!validWaterShortcuts(value))return false;
    wx.setStorageSync('cal_water_shortcuts',value.slice());return true;
}
function getHomeDisplay() {
    const value=wx.getStorageSync('cal_home_display');
    const prefs=value && typeof value==='object' && !Array.isArray(value)?value:{};
    return {mascotAnimation:prefs.mascotAnimation!==false,scienceAutoplay:prefs.scienceAutoplay!==false,autoUpdate:prefs.autoUpdate!==false};
}
function setHomeDisplay(patch) {
    const prefs=getHomeDisplay();
    ['mascotAnimation','scienceAutoplay','autoUpdate'].forEach(key=>{if(patch && typeof patch[key]==='boolean')prefs[key]=patch[key];});
    wx.setStorageSync('cal_home_display',prefs);return prefs;
}

function getTheme() {
    try { const value=wx.getStorageSync('cal_theme');return ['simple','light','dark','system'].includes(value)?value:'light'; }
    catch(error) { return 'light'; }
}
function setTheme(value) {
    if(!['simple','light','dark','system'].includes(value))return getTheme();
    wx.setStorageSync('cal_theme',value);return value;
}

function getNavTransparency(theme) {
    try { const value=wx.getStorageSync('cal_nav_transparency');if(typeof value==='number' && Number.isFinite(value))return Math.max(0,Math.min(100,Math.round(value))); }catch(error){}
    return theme==='dark'?70:82;
}
function setNavTransparency(value) {
    if(typeof value!=='number' || !Number.isFinite(value))return false;
    const safe=Math.max(0,Math.min(100,Math.round(value)));
    wx.setStorageSync('cal_nav_transparency',safe);return safe;
}

function getNavOpacity(theme) {
    try {const value=wx.getStorageSync('cal_nav_opacity');if(typeof value==='number' && Number.isFinite(value))return Math.max(0,Math.min(100,Math.round(value)));}catch(error){}
    return 100-getNavTransparency(theme);
}
function setNavOpacity(value) {
    if(typeof value!=='number' || !Number.isFinite(value))return false;
    const safe=Math.max(0,Math.min(100,Math.round(value)));wx.setStorageSync('cal_nav_opacity',safe);return safe;
}
function getNavGlass(){try{return wx.getStorageSync('cal_nav_glass')!==false;}catch(error){return true;}}
function setNavGlass(value){wx.setStorageSync('cal_nav_glass',Boolean(value));return Boolean(value);}
function getNavBlur(){try{const value=wx.getStorageSync('cal_nav_blur');return typeof value==='number' && Number.isFinite(value)?Math.max(0,Math.min(40,Math.round(value))):16;}catch(error){return 16;}}
function setNavBlur(value){if(typeof value!=='number' || !Number.isFinite(value))return false;const safe=Math.max(0,Math.min(40,Math.round(value)));wx.setStorageSync('cal_nav_blur',safe);return safe;}

module.exports = {
    needsPlanGuide,dismissPlanGuide,
    getNavOpacity,setNavOpacity,getNavGlass,setNavGlass,getNavBlur,setNavBlur,
    getNavTransparency,setNavTransparency,
    getGoal,
    setGoal,
    getProfile,
    setProfile,
    getMacroTargets,
    setMacroTargets,
    getWaterGoal,
    setWaterGoal,
    getNickname,
    setNickname,
    getAvatar,
    setAvatar,
    getAvatarImage,
    setAvatarImage,
    clearAvatarImage,
    getAfterSave,
    setAfterSave,
    getWaterShortcuts,setWaterShortcuts,validWaterShortcuts,DEFAULT_WATER_SHORTCUTS,
    getHomeDisplay,setHomeDisplay,
    getTheme,setTheme,
    DEFAULT_GOAL,
    DEFAULT_WATER_GOAL,
    DEFAULT_NICKNAME,
    DEFAULT_AFTER_SAVE,
};
