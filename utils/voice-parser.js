const foodDb = require('./food-db');
const portions=require('./food-portions');
const DIGITS={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
function number(text){
    if(text==='半')return .5;
    if(/^\d/.test(text))return Number(text);
    if(text.includes('点')){const [whole,fraction]=text.split('点');return number(whole)+Number('0.'+[...fraction].map(c=>DIGITS[c]).join(''));}
    let total=0,digit=0;
    for(const c of text){if(Object.prototype.hasOwnProperty.call(DIGITS,c))digit=DIGITS[c];else {const size={'十':10,'百':100,'千':1000}[c];if(!size)return NaN;total+=(digit || 1)*size;digit=0;}}
    return total+digit;
}
function unit(raw){return ({ml:'毫升',cc:'毫升',l:'升',公升:'升',g:'克',kg:'公斤',听:'罐'})[raw.toLowerCase()] || raw;}
function clean(text){return text.replace(/今天|昨天|前天|早上|早晨|中午|晚上|早餐|早饭|午餐|午饭|晚餐|晚饭|加餐|夜宵|还有|以及|吃了|喝了|吃过|喝过|吃|喝/g,'').replace(/^我(?:又|还)?/,'').trim();}
function tail(text){
    const raw=(text.match(/^[^，,。；;、和\n]*/) || [''])[0];
    const half=raw.match(/^(.*?)(?:喝|吃)(?:了)?一半$/);
    let name=(half?half[1]:raw.replace(/(?:还有|以及|又?吃了|又?喝了).*$/,'')).replace(/^(?:装的|装|的)/,'').replace(/(?:一共|总共|共计|合计|总计|共|每瓶|每罐|每盒|每包|各)$/,'').trim();
    return {name,end:half?raw.length:raw.indexOf(name)+name.length,half:!!half};
}
function parse(text,now){
    text=String(text || '');const items=[],pending=[],spans=[];
    const re=/([0-9]+(?:\.[0-9]+)?|[零〇一二两三四五六七八九十百千点]+|半)\s*(千克|公斤|毫升|公升|kg|ml|cc|克|升|个|碗|份|根|杯|片|块|盒|袋|勺|斤|两|串|张|盘|只|支|瓶|罐|听|包|桶|g|l)\s*/gi;
    const tokens=[...text.matchAll(re)].map(m=>({start:m.index,end:m.index+m[0].length,qty:number(m[1]),unit:unit(m[2])}));
    for(let i=0;i<tokens.length;i++){
        const token=tokens[i],next=tokens[i+1];let qty=token.qty,selected=token.unit;
        let raw=text.slice(token.end,next?next.start:text.length),extra=0;
        if(portions.PACKAGE_UNITS.includes(selected) && raw.startsWith('半')){qty+=.5;raw=raw.slice(1);extra=1;}
        const suffix=(raw.match(/^(?:左右|上下)(?=$|[，,。；;、和\s])/) || [''])[0];
        if(suffix){raw=raw.slice(suffix.length);extra+=suffix.length;}
        const part=tail(raw);let name=part.name,start=token.start,end=token.end+extra+Math.max(0,part.end),note='';
        if(suffix)note='原文为约数，请核对份量';
        const nextIsWeight=next && ['克','公斤','千克','斤','两'].includes(next.unit);
        if(name && nextIsWeight && ['份','个','块','碗','盘','片'].includes(selected)
            && /^[，,]\s*(?:大约|约|差不多)?\s*$/.test(raw.slice(part.end))){
            const following=text.slice(next.end,tokens[i+2]?tokens[i+2].start:text.length);
            const approximate=(following.match(/^(?:左右|上下)/) || [''])[0];
            if(/^(?:\s*|\s*[，,。；;、和\n].*)$/s.test(following.slice(approximate.length))){
                qty=next.qty;selected=next.unit;end=next.end+approximate.length;i++;
                if(approximate || /大约|约|差不多/.test(raw.slice(part.end)))note='原文为约数，请核对份量';
            }
        }
        if(part.half)qty*=.5;
        const capacity=next && ['毫升','升','克','公斤','千克','斤'].includes(next.unit) && portions.PACKAGE_UNITS.includes(selected);
        if(capacity){
            const after=tail(text.slice(next.end,tokens[i+2]?tokens[i+2].start:text.length));
            if((!name && after.name || name && !after.name || name===after.name) && !/[。；;]/.test(raw) && !/(?:吃|喝)(?:了|过)?/.test(raw)){
                const count=qty*(after.half ? .5 : 1),total=/一共|总共|共计|合计|总计|共/.test(raw);name=name || after.name;qty=total?next.qty:count*next.qty;selected=next.unit;end=next.end+Math.max(0,after.end);i++;
                note='原文'+count+token.unit+'，'+(total?'合计':('每'+token.unit))+next.qty+next.unit+'，按实际数量换算';
            }
        }
        if(!name){
            const prefix=text.slice(0,token.start);const boundary=Math.max(prefix.lastIndexOf('，'),prefix.lastIndexOf(','),prefix.lastIndexOf('。'),prefix.lastIndexOf('和'),spans.length?spans[spans.length-1][1]-1:-1);
            const before=clean(prefix.slice(boundary+1));if(before && !/^(?:[\d一二三四五六七八九十百千]+|我|还|又|再|有|了|的|现在|这次|刚刚|大约|约|每瓶|每罐|一共|总共|共计|合计|总计|共)$/.test(before)){name=before;start=boundary+1;}
        }
        spans.push([start,end]);
        if(!(qty>0) || !Number.isFinite(qty))continue;
        if(!name){pending.push({name:'未说明食物',unit:selected,qty,requiresDetail:true,reason:'数量已识别，请补充具体食物名称'});continue;}
        const row=foodDb.findByUnit(name,selected),detail=portions.details(name,selected);
        if(detail && (!row || row.source!=='personal')){pending.push(Object.assign({name,unit:selected,qty},detail));continue;}
        if(qty>10000){pending.push({name,unit:selected,qty,requiresDetail:true,reason:'数量已识别，但数值较大，请核对原文'});continue;}
        if(row)items.push({weightBasis:row.weightBasis,totalGrams:row.weightBasis?row.weightBasis.gramsPerUnit*qty:null,name:row.source==='recipe-estimate'?row.name:name,unit:selected,qty,kcal:row.kcal*qty,protein:Number.isFinite(row.p)?row.p*qty:null,carb:Number.isFinite(row.c)?row.c*qty:null,fat:Number.isFinite(row.f)?row.f*qty:null,nutritionStatus:row.nutritionStatus || 'estimated',source:row.source || 'local',note:[note,row.portionHint || '本地参考估算，请核对'].filter(Boolean).join('；')});
        else pending.push({name,unit:selected,qty,note,approximate:note.startsWith('原文为约数'),reason:name==='燕麦'?'请确认是干燕麦片还是煮好的燕麦粥，再补充营养':foodDb.findExact(name)?'已识别数量；本地没有此单位的换算，请确认容量或重量':'已识别数量；本地未收录此食物，请补充营养'});
    }
    let remaining=text;
    for(const [start,end] of spans.sort((a,b)=>b[0]-a[0]))remaining=remaining.slice(0,start)+'，'+remaining.slice(end);
    for(const part of remaining.split(/[，,。；;、和\n]/)){
        const name=clean(part);if(!name || /^(数量|份量|不知道|不清楚|大约|约|了|的|我|在|还|有|每|各|\d+点)/.test(name))continue;
        if(/^(?:再加|加上|加|一共|总共|共计|合计|总计|共|左右|上下|差不多)$/.test(name))continue;
        if(!pending.some(row=>row.name===name))pending.push({name,unit:'份',qty:null,reason:'未能确定食物或数量，请核对原文后补充'});
    }
    const meals=[['breakfast',/早上|早晨|早餐|早饭/],['lunch',/中午|午餐|午饭/],['dinner',/晚上|晚餐|晚饭/],['snack',/加餐|夜宵/]].filter(pair=>pair[1].test(text));
    const base=new Date(now || Date.now());
    let date=null;
    if (/今天|昨天|前天/.test(text)) {
        base.setDate(base.getDate()-(/前天/.test(text)?2:/昨天/.test(text)?1:0));
        date=[base.getFullYear(),String(base.getMonth()+1).padStart(2,'0'),String(base.getDate()).padStart(2,'0')].join('-');
    }
    return {items,pending:pending.map(row=>Object.assign({knownFood:!!foodDb.findExact(row.name)},row)),context:{meal:meals.length===1?meals[0][0]:null,date},multipleMeals:meals.length>1};
}
module.exports={parse};
