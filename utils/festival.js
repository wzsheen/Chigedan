const dates=require('./festival-dates');
const MS_DAY=86400000;
function festival(date=new Date()){
 if(!(date instanceof Date) || !Number.isFinite(date.getTime()))return null;
 const y=date.getFullYear(),m=date.getMonth()+1,d=date.getDate();
 const day=Date.UTC(y,m-1,d);
 const text=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 if(m===10 && d===31)return 'halloween';
 if(m===12 && d===25)return 'christmas';
 for(const key of ['spring','lantern','dragonboat','midautumn']){
  const value=dates[key][y-2020];if(!value)continue;
  const [yy,mm,dd]=value.split('-').map(Number);const delta=(day-Date.UTC(yy,mm-1,dd))/MS_DAY;
  if(delta>=0 && delta<(key==='spring'?7:1))return key;
 }
 return null;
}
module.exports={festival};
