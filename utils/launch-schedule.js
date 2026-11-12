const BIRTHDAYS=new Set(require('./birthday-dates'));
// Use UTC+8 calendar days consistently, independent of device timezone or Intl support.
function shouldPlayBirthdayVideo(date=new Date()){
 if(!(date instanceof Date) || !Number.isFinite(date.getTime()))return false;
 const local=new Date(date.getTime()+8*3600000);
 const day=local.getUTCFullYear()+'-'+String(local.getUTCMonth()+1).padStart(2,'0')+'-'+String(local.getUTCDate()).padStart(2,'0');
 return BIRTHDAYS.has(day);
}
module.exports={shouldPlayBirthdayVideo};
