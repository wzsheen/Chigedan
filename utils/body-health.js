// v1 product reference mapping, not a medically validated health score.
const {dayNumber}=require('./body-state');
const RULE_VERSION='body-v1';
function positive(value){return typeof value==='number' && Number.isFinite(value) && value>0;}
function buildHealthScore(current,profile,today){
 const kg=current.kg || {},height=current.heightCm || {},waist=current.waistCm || {};
 const heightValid=positive(height.value) && height.value>=80 && height.value<=250;
 const bmi=positive(kg.value) && kg.value>=20 && kg.value<=500 && heightValid?kg.value/Math.pow(height.value/100,2):null;
 const ratio=positive(waist.value) && waist.value>=30 && waist.value<=250 && heightValid?waist.value/height.value:null;
 const bmiScore=bmi===null?null:bmi>=18.5 && bmi<24?100:bmi<28?70:40;
 const ratioScore=ratio===null || ratio<0.4?null:ratio<0.5?100:ratio<0.6?70:40;
 const result={ready:false,value:null,text:'—',reason:'',subtitle:'当前仅参考BMI与腰高比',ruleVersion:RULE_VERSION,bmiScoreText:bmiScore===null?'—':String(bmiScore),ratioScoreText:ratioScore===null?'—':String(ratioScore),bmi,ratio,
  disclaimer:'分值映射和取较低分为产品自定义，未经医学验证；不代表整体健康状况。仅适用于18–64岁一般成人，孕产期、运动员等特殊情况不适用。'};
 const age=Number(profile && profile.age),special=profile && (profile.healthScoreApplicability==='excluded' || profile.isPregnant===true || profile.isPostpartum===true || profile.isAthlete===true);
 if(!Number.isFinite(age) || age<18 || age>=65)result.reason='仅对年龄已知的18–64岁一般成人提供参考分';
 else if(special)result.reason='特殊情况暂不适用此参考分';
 else if(bmi===null || ratio===null)result.reason='缺少有效身高、体重或腰围，暂无法评分';
 else if(bmi>=35 || ratio<0.4)result.reason='当前数值超出本版综合评分适用范围';
 else {
  const todayDay=dayNumber(today),weightDay=dayNumber(kg.date),waistDay=dayNumber(waist.date);
  if(weightDay===null || waistDay===null)result.reason='体重或腰围的测量日期未知，暂无法评分';
  else if(todayDay===null || weightDay>todayDay || waistDay>todayDay)result.reason='测量日期无效，暂无法评分';
  else if(todayDay-weightDay>30 || todayDay-waistDay>30)result.reason='体重或腰围超过30天未更新，暂停评分';
  else {result.ready=true;result.value=Math.min(bmiScore,ratioScore);result.text=String(result.value);result.reason='取BMI与腰高比分项中的较低分';}
 }
 return result;
}
function scalePosition(value,bounds){
 const count=bounds.length-1;
 for(let i=0;i<count;i++)if(value<bounds[i+1])return Math.max(0,(i+(value-bounds[i])/(bounds[i+1]-bounds[i]))/count*100);
 return 100;
}
function indicators(current,score,today){
 const {measurementDate}=require('./body-state');
 return [{key:'bmi',label:'BMI',text:score.bmi===null?'—':score.bmi.toFixed(1),unit:'',date:measurementDate(current.kg,today)+' / 身高：'+measurementDate(current.heightCm,today),source:'体重 ÷ 身高²',tone:score.bmi===null?'metric-empty':score.bmi<18.5?'metric-low':score.bmi<24?'metric-normal':score.bmi<28?'metric-high':'metric-danger',position:score.bmi===null?null:scalePosition(score.bmi,[10,18.5,24,28,40]),reference:'成人参考分界：18.5 / 24 / 28'},
 {key:'ratio',label:'腰高比',text:score.ratio===null?'—':score.ratio.toFixed(2),unit:'',date:measurementDate(current.waistCm,today)+' / 身高：'+measurementDate(current.heightCm,today),source:'腰围 ÷ 身高',tone:score.ratio===null?'metric-empty':score.ratio<0.4?'metric-low':score.ratio<0.5?'metric-normal':score.ratio<0.6?'metric-high':'metric-danger',position:score.ratio===null?null:scalePosition(score.ratio,[0.3,0.4,0.5,0.6,0.8]),reference:'参考分界：0.4 / 0.5 / 0.6；BMI＜35时参考'}];
}
module.exports={buildHealthScore,indicators,RULE_VERSION};
