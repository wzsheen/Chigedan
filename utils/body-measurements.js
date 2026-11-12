const settings=require('./settings');
const {formatDate}=require('./record-store');
const KEY='cal_body_measurements';
const FIELDS={kg:{label:'体重',min:20,max:400},heightCm:{label:'身高',min:80,max:250},waistCm:{label:'腰围',min:30,max:250},hipCm:{label:'臀围',min:30,max:300}};
function sanitize(rows){
    if(!Array.isArray(rows))return [];
    return rows.slice(0,10000).map(row=>{
        if(!row || typeof row.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date))return null;
        const date=new Date(row.date+'T12:00:00');if(!Number.isFinite(date.getTime()) || formatDate(date)!==row.date || row.date>formatDate(new Date()))return null;
        const out={date:row.date,ts:Number.isFinite(row.ts)&&row.ts>0?row.ts:date.getTime()};
        for(const key of Object.keys(FIELDS)){const value=row[key],range=FIELDS[key];if(typeof value==='number' && Number.isFinite(value) && value>=range.min && value<=range.max)out[key]=Math.round(value*10)/10;}
        return Object.keys(out).length>2?out:null;
    }).filter(Boolean).sort((a,b)=>b.ts-a.ts);
}
function list(){return sanitize(wx.getStorageSync(KEY));}
function history(){
    const rows=list(),weights=wx.getStorageSync('cal_weight'),seen=new Set(rows.filter(row=>row.kg).map(row=>row.date+'|'+row.kg));
    for(const row of sanitize(weights))if(row.kg && !seen.has(row.date+'|'+row.kg))rows.push({date:row.date,ts:row.ts,kg:row.kg});
    return rows.sort((a,b)=>b.ts-a.ts);
}
function current(){
    const rows=history(),profile=settings.getProfile() || {},result={};
    for(const key of Object.keys(FIELDS)){
        const row=rows.find(item=>Number.isFinite(item[key]));
        result[key]=row?{value:row[key],date:row.date,measured:true}:{value:null,date:'',measured:false};
    }
    // Profile height is the shared source also edited by the daily plan.
    if(Number(profile.height)>0){const value=Number(profile.height);if(!result.heightCm.value || result.heightCm.value!==value)result.heightCm={value,date:'',measured:false};}
    // Current saved profile values are authoritative for display, not new measurements.
    // A different plan/profile value must not be hidden behind an older history row.
    if(Number(profile.weight)>0 && Number(profile.weight)<=500 && result.kg.value!==Number(profile.weight))result.kg={value:Number(profile.weight),date:'',measured:false};
    for(const key of Object.keys(result))result[key].source=result[key].value?(result[key].measured?'测量记录':'当前资料'):'暂无数据';
    return result;
}
async function save(input){
    const values={};
    for(const key of Object.keys(FIELDS)){
        const raw=input && input[key];if(raw===undefined || raw===null || String(raw).trim()==='')continue;
        const value=Number(raw),range=FIELDS[key];
        if(!Number.isFinite(value) || value<range.min || value>range.max)return {error:{message:range.label+'请输入'+range.min+'–'+range.max+'之间的有效数值'}};
        values[key]=Math.round(value*10)/10;
    }
    if(!Object.keys(values).length)return {error:{message:'至少填写一项本次测量数据'}};
    const keys=[KEY,'cal_weight','cal_profile'],before={};
    try{
        for(const key of keys)before[key]=wx.getStorageSync(key);
        const rows=sanitize(before[KEY]),oldWeights=Array.isArray(before.cal_weight)?before.cal_weight:[];
        let ts=Date.now();while(rows.some(row=>row.ts===ts) || oldWeights.some(row=>row.ts===ts))ts++;
        const row=Object.assign({ts,date:formatDate(new Date())},values);
        wx.setStorageSync(KEY,[row].concat(rows));
        if(values.kg)wx.setStorageSync('cal_weight',[{ts,date:row.date,kg:values.kg}].concat(oldWeights));
        if(values.kg || values.heightCm){const profile=Object.assign({},settings.getProfile() || {});if(values.kg)profile.weight=values.kg;if(values.heightCm)profile.height=values.heightCm;settings.setProfile(profile);}
        if(typeof getApp==='function'){const app=getApp();if(app && typeof app.markBodyChanged==='function')app.markBodyChanged();}
        return {data:row,error:null};
    }catch(error){
        for(const key of keys){try{if(Object.prototype.hasOwnProperty.call(before,key)){if(before[key]===undefined && typeof wx.removeStorageSync==='function')wx.removeStorageSync(key);else wx.setStorageSync(key,before[key]);}}catch(ignored){}}
        return {data:null,error:{message:'保存失败，请检查本机存储后重试'}};
    }
}
async function remove(target, field) {
    if (!target || !Number.isFinite(target.ts) || !target.date || !Object.prototype.hasOwnProperty.call(FIELDS, field) || !Number.isFinite(target[field])) return { error: { message: '记录无效' } };
    const keys = [KEY, 'cal_weight', 'cal_profile'], before = {};
    try {
        for (const key of keys) before[key] = wx.getStorageSync(key);
        const rawRows = Array.isArray(before[KEY]) ? before[KEY] : [];
        const rawWeights = Array.isArray(before.cal_weight) ? before.cal_weight : [];
        const matches = row => { const clean = sanitize([row])[0]; return !!clean && clean.ts === target.ts && clean.date === target.date; };
        if (!rawRows.some(row => matches(row) && Number.isFinite(row[field])) && !(field === 'kg' && rawWeights.some(row => matches(row) && Number.isFinite(row.kg)))) return { error: { message: '记录已不存在，请刷新' } };
        const prior = history();
        const updated = rawRows.map(row => {
            if (!matches(row) || !Number.isFinite(row[field])) return row;
            const copy = Object.assign({}, row);
            delete copy[field];
            return Object.keys(FIELDS).some(key => Number.isFinite(copy[key])) ? copy : null;
        }).filter(row => row !== null);
        wx.setStorageSync(KEY, updated);
        if (field === 'kg') wx.setStorageSync('cal_weight', rawWeights.filter(row => !matches(row)));
        const profile = Object.assign({}, before.cal_profile || {}), remaining = history();
        for (const [key, profileKey] of [['kg', 'weight'], ['heightCm', 'height']]) {
            if (field !== key) continue;
            const latest = prior.find(row => Number.isFinite(row[key]));
            if (!Number.isFinite(target[key]) || !latest || latest.ts !== target.ts || latest.date !== target.date || Number(profile[profileKey]) !== target[key]) continue;
            const previous = remaining.find(row => Number.isFinite(row[key]));
            if (previous) profile[profileKey] = previous[key]; else delete profile[profileKey];
        }
        wx.setStorageSync('cal_profile', profile);
        if (typeof getApp === 'function') { const app = getApp(); if (app && typeof app.markBodyChanged === 'function') app.markBodyChanged(); }
        return { data: true, error: null };
    } catch (error) {
        for (const key of keys) try { if (Object.prototype.hasOwnProperty.call(before, key)) { if (before[key] === undefined && typeof wx.removeStorageSync === 'function') wx.removeStorageSync(key); else wx.setStorageSync(key, before[key]); } } catch (_) {}
        return { data: null, error: { message: '删除失败，请重试' } };
    }
}
module.exports={KEY,FIELDS,sanitize,list,history,current,save,remove};
