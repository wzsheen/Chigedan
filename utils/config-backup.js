// Explicit portable preference whitelist. Never enumerate or export all storage.
const enums={cal_theme:['simple','light','dark','system'],cal_energy_unit:['kcal','kj'],cal_weight_unit:['kg','jin','lb'],cal_after_save:['back','stay']};
const numbers={cal_nav_transparency:100,cal_nav_opacity:100,cal_nav_blur:40};
const booleans=['cal_nav_glass','cal_plan_guide_dismissed'];
const KEYS=Object.keys(enums).concat(Object.keys(numbers),booleans,['cal_nickname','cal_avatar','cal_water_shortcuts','cal_home_display','cal_custom_units']);
const STORAGE_KEYS=KEYS.concat(['cal_ai_services','cal_ai_enabled']);
function sanitize(raw){
    const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},out={};
    for(const key of Object.keys(enums))if(enums[key].includes(source[key]))out[key]=source[key];
    for(const key of Object.keys(numbers))if(typeof source[key]==='number'&&Number.isFinite(source[key])&&source[key]>=0&&source[key]<=numbers[key])out[key]=source[key];
    for(const key of booleans)if(typeof source[key]==='boolean')out[key]=source[key];
    if(typeof source.cal_nickname==='string')out.cal_nickname=source.cal_nickname.trim().slice(0,12);
    if(require('./avatars').isAvatarKey(source.cal_avatar))out.cal_avatar=source.cal_avatar;
    const quick=source.cal_water_shortcuts;
    if(Array.isArray(quick)&&quick.length===3&&new Set(quick).size===3&&quick.every(n=>Number.isInteger(n)&&n>0&&n<=5000))out.cal_water_shortcuts=quick.slice();
    if(source.cal_home_display&&typeof source.cal_home_display==='object'){
        const display={};for(const key of ['mascotAnimation','scienceAutoplay'])if(typeof source.cal_home_display[key]==='boolean')display[key]=source.cal_home_display[key];
        if(Object.keys(display).length)out.cal_home_display=display;
    }
    if(Array.isArray(source.cal_custom_units)){const units=require('./custom-units');out.cal_custom_units=[...new Set(source.cal_custom_units.filter(n=>typeof n==='string').map(units.normalize).filter(units.valid))].slice(0,100);}
    const services={};
    for(const kind of ['vision','speech','nutrition']){
        const input=source.aiServices&&source.aiServices[kind];if(!input||typeof input!=='object')continue;
        const value={provider:input.provider,baseUrl:input.baseUrl,model:input.model,apiKey:''};
        if(typeof value.baseUrl==='string'&& !/[?\x23@]/.test(value.baseUrl)&&!require('./ai-settings').validate(value)){
            const normalized=require('./ai-settings').normalize?require('./ai-settings').normalize(value):value;
            services[kind]={provider:normalized.provider,baseUrl:normalized.baseUrl,model:normalized.model};
        }
    }
    if(Object.keys(services).length)out.aiServices=services;
    return out;
}
function collect(){const raw={};for(const key of KEYS)raw[key]=wx.getStorageSync(key);raw.aiServices=require('./ai-settings').read();return sanitize(raw);}
function apply(raw){
    const config=sanitize(raw);for(const key of KEYS)if(Object.prototype.hasOwnProperty.call(config,key))wx.setStorageSync(key,config[key]);
    if(config.aiServices){
        const current=require('./ai-settings').read(),enabled=Object.assign({},wx.getStorageSync('cal_ai_enabled')||{});
        for(const kind of Object.keys(config.aiServices)){const next=config.aiServices[kind],old=current[kind],same=old.provider===next.provider&&old.baseUrl===next.baseUrl&&old.model===next.model;current[kind]=Object.assign({},next,{apiKey:same?old.apiKey:''});enabled[kind]=false;}
        wx.setStorageSync('cal_ai_services',current);wx.setStorageSync('cal_ai_enabled',enabled);
    }
}
module.exports={sanitize,collect,apply,STORAGE_KEYS};
