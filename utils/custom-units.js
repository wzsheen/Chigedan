const KEY='cal_custom_units';
const DEFAULTS=['碗','个','杯','份','片','根','包','瓶','罐','盒','袋','克','毫升','升','千克','斤','两','盘','块','串','勺','颗','条'];
function normalize(value){return typeof value==='string'?value.trim().replace(/\s+/g,''):'';}
function valid(value){return !!value && value.length<=8 && !/[\d<>\r\n]/.test(value);}
function list(){
    const saved=wx.getStorageSync(KEY);
    const extra=Array.isArray(saved)?saved.map(normalize).filter(valid):[];
    return [...new Set(DEFAULTS.concat(extra))];
}
function add(raw){
    const value=normalize(raw);
    if(!valid(value)) throw new Error('请填写 1–8 个字的单位，不包含数字');
    const all=list();
    if(!all.includes(value)) {
        const custom=all.filter(unit=>!DEFAULTS.includes(unit));
        // Preserve user entries rather than silently discarding old units.
        if(custom.length>=100) throw new Error('自定义单位已达 100 个，请使用已有单位');
        wx.setStorageSync(KEY,custom.concat(value));
    }
    return list();
}
module.exports={DEFAULTS,normalize,valid,list,add};
