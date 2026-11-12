// Build offline regular lunar 10/7 dates with Node ICU; no Intl dependency on phones.
const fs=require('node:fs');
const formatter=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'});
const dates=[];
for(let year=2020;year<=2100;year++){
 const matches=[];
 for(let time=Date.UTC(year,9,1,4);time<=Date.UTC(year,11,31,4);time+=86400000){
  const parts=Object.fromEntries(formatter.formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  if(parts.month==='10' && parts.day==='7')matches.push(new Date(time).toISOString().slice(0,10));
 }
 if(matches.length!==1)throw Error('Unexpected birthday count '+year);dates.push(matches[0]);
}
if(!dates.includes('2026-11-15'))throw Error('2026 HKO cross-check failed');
fs.writeFileSync('utils/birthday-dates.js','// Regular lunar October 7, 2020–2100. Generated offline using Node ICU.\n// HKO 2026 cross-check: https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf\nmodule.exports=Object.freeze('+JSON.stringify(dates,null,1)+');\n');
console.log('Generated '+dates.length+' offline dates');
