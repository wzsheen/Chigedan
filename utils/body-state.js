// 展示规则，不写入存储；窗口不代表医学有效期。
const {formatDate}=require('./record-store');
const units=require('./units');
function dayNumber(key){
 if(typeof key!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(key))return null;
 const date=new Date(key+'T12:00:00');
 return Number.isFinite(date.getTime()) && formatDate(date)===key?Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000:null;
}
function known(value){return typeof value==='number' && Number.isFinite(value) && value>=0;}
function measurementDate(item,today){
 if(!item || !item.value)return '未测量';
 if(!item.date)return '基础资料 · 日期未知';
 const age=dayNumber(today)-dayNumber(item.date);
 return item.date+(age>30?' · 较久未更新':'');
}
function changes(history,today){
 const end=dayNumber(today);
 return [['kg','体重'],['waistCm','腰围'],['hipCm','臀围']].map(([key,label])=>{
  const daily=new Map();
  for(const row of history){const day=dayNumber(row.date);if(day===null || day>end || day<end-29 || !known(row[key]) || row[key]<=0)continue;
   const old=daily.get(row.date);if(!old || row.ts>old.ts)daily.set(row.date,row);
  }
  const rows=Array.from(daily.values()).sort((a,b)=>a.date.localeCompare(b.date));
  const first=rows[0],last=rows[rows.length-1],days=first?dayNumber(last.date)-dayNumber(first.date):0;
  if(days<7)return {key,label,count:rows.length,text:'暂无足够记录可比较',detail:'近30天有 '+rows.length+' 个记录日；至少需要相隔7天的两天记录'};
  const delta=last[key]-first[key],value=key==='kg'?units.toDisplayWeight(delta):delta;
  const rounded=Math.round(value*10)/10;
  return {key,label,count:rows.length,text:(rounded>0?'+':'')+rounded.toFixed(1)+' '+(key==='kg'?units.weightUnitLabel():'cm'),detail:first.date+' 至 '+last.date+' · 间隔'+days+'天 · '+rows.length+'个记录日'};
 });
}
function summaries(records,water,today){
 const end=dayNumber(today),inWindow=row=>{const day=dayNumber(row.date);return day!==null && day>=end-7 && day<end;};
 const foods=records.filter(inWindow),drinks=water.filter(row=>inWindow(row) && known(row.ml) && row.ml>0);
 const foodDays=new Set(foods.map(row=>row.date)).size,waterDays=new Set(drinks.map(row=>row.date)).size;
 const nutrients=[['kcal','能量'],['protein','蛋白质'],['carb','碳水'],['fat','脂肪']].map(([key,label])=>{
  const values=foods.filter(row=>known(row[key])),sum=values.reduce((total,row)=>total+row[key],0),missing=values.length<foods.length;
  return {key,label,text:values.length?(key==='kcal'?units.energyText(sum):sum.toFixed(1)+' g'):'—',note:!foods.length?'暂无记录':!values.length?'缺少数据':missing?'已知合计 · 数据不完整':'记录合计'};
 });
 const incompleteDays=new Set(foods.filter(row=>['protein','carb','fat','kcal'].some(key=>!known(row[key]))).map(row=>row.date)).size;
 const total=drinks.reduce((sum,row)=>sum+row.ml,0);
 const startDate=new Date(today+'T12:00:00');startDate.setDate(startDate.getDate()-7);
 const lastDate=new Date(today+'T12:00:00');lastDate.setDate(lastDate.getDate()-1);
 const energyComplete=foods.length && foods.every(row=>known(row.kcal));
 return {period:formatDate(startDate)+' 至 '+formatDate(lastDate),foodDays,waterDays,incompleteDays,nutrients,
  energyAverage:energyComplete?units.energyText(foods.reduce((sum,row)=>sum+row.kcal,0)/foodDays):'—',
  waterTotal:waterDays?Math.round(total)+' ml':'—',waterAverage:waterDays?Math.round(total/waterDays)+' ml':'—'};
}
module.exports={dayNumber,measurementDate,changes,summaries};
