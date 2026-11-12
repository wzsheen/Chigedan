const {dayNumber}=require('./body-state');
const {formatDate}=require('./record-store');
const units=require('./units');
const LABELS={kg:'体重',waistCm:'腰围',hipCm:'臀围'};
function buildBodyChart(history,metric,days,today,range){
 metric=LABELS[metric]?metric:'kg';days=[0,7,30,90,365].includes(days)?days:30;
 const todayDay=dayNumber(today);
 const custom=range!==undefined && range!==null;
 const end=custom?dayNumber(range.end):todayDay,customStart=custom?dayNumber(range.start):null;
 if(custom && (customStart===null || end===null || customStart>end || end>todayDay))throw new RangeError('Invalid body chart period');
 const daily=new Map();
 for(const row of history){const day=dayNumber(row.date);if(day===null || day>end || (custom?day<customStart:(days && day<end-days+1)) || typeof row[metric]!=='number' || !Number.isFinite(row[metric]) || row[metric]<=0)continue;
  const old=daily.get(row.date);if(!old || row.ts>old.ts)daily.set(row.date,row);
 }
 const rows=Array.from(daily.values()).sort((a,b)=>a.date.localeCompare(b.date));
 const start=custom?customStart:days?end-days+1:rows.length?dayNumber(rows[0].date):end-29;
 const endDate=custom?range.end:today;
 const startDate=new Date(endDate+'T12:00:00');startDate.setDate(startDate.getDate()-(end-start));
 const value=row=>metric==='kg'?units.toDisplayWeight(row[metric]):row[metric];
 const values=rows.map(value),low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):1,pad=Math.max((high-low)*0.15,0.5),min=low-pad,max=high+pad;
 const points=rows.map(row=>({key:row.date,date:row.date,text:value(row).toFixed(1),x:end===start?50:(dayNumber(row.date)-start)/(end-start)*100,y:100-(value(row)-min)/(max-min)*100}));
 const segments=[];
 // UI plot is 600rpx wide by 180rpx high. Width is relative to plot width.
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(dayNumber(b.date)-dayNumber(a.date)!==1)continue;const dx=b.x-a.x,dy=(b.y-a.y)*180/600;segments.push({key:b.key,left:a.x,top:a.y,width:Math.sqrt(dx*dx+dy*dy),angle:Math.atan2(dy,dx)*180/Math.PI});}
 const delta=rows.length>1?Math.round((value(rows[rows.length-1])-value(rows[0]))*10)/10:null;
 return {metric,label:LABELS[metric],unit:metric==='kg'?units.weightUnitLabel():'cm',days,startDate:formatDate(startDate),endDate,points,segments,hasData:points.length>0,hasLine:segments.length>0,latestText:points.length?points[points.length-1].text:'—',changeText:delta===null?'暂无可比较记录':(delta>0?'+':'')+delta.toFixed(1),minText:min.toFixed(1),maxText:max.toFixed(1),note:'仅展示实际测量；同日取最后一次，缺测不补零、不跨缺测日连线。资料更新不生成历史测量。'};
}
module.exports={buildBodyChart};
