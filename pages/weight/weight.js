const {withTheme}=require('../../utils/theme');
const body=require('../../utils/body-measurements');
const units=require('../../utils/units');
const bmi=require('../../utils/bmi');
const state=require('../../utils/body-state');
const health=require('../../utils/body-health');
const {buildBodyChart}=require('../../utils/body-chart');
const settings=require('../../utils/settings');
const {formatDate}=require('../../utils/record-store');
Page(withTheme({
 data:{bodyRangeMenuOpen:false,bodyRangeLabel:'月',bodyRange:'month',customRangeOpen:false,customStart:'',customEnd:'',rangeError:'',dateLimit:'',appliedRange:null,formError:'',guideOpen:false,sourcesOpen:false,weightText:'—',weightUnit:'kg',weightDate:'未测量',heightText:'—',heightDate:'未测量',bmiText:'—',bmiTone:'',ratioText:'—',waistText:'—',waistDate:'未测量',hipText:'—',hipDate:'未测量',recent:[],changes:[],healthScore:{ready:false,value:null,text:'—',reason:'',subtitle:'当前仅参考BMI与腰高比'},bodyIndicators:[],bodyChart:{metric:'kg',days:30,points:[],segments:[]}},
 onShow(){this.refresh();},
 refresh(){
  try{
   const latest=body.current(),history=body.history(),today=formatDate(new Date()),date=key=>state.measurementDate(latest[key],today);
   const score=health.buildHealthScore(latest,settings.getProfile() || {},today);
   const recent=history.slice(0,5).map(row=>{const parts=[];
    if(row.kg)parts.push('体重 '+units.weightText(row.kg));if(row.heightCm)parts.push('身高 '+row.heightCm+' cm');if(row.waistCm)parts.push('腰围 '+row.waistCm+' cm');if(row.hipCm)parts.push('臀围 '+row.hipCm+' cm');
    const time=new Date(row.ts);return {key:String(row.ts),date:row.date,time:String(time.getHours()).padStart(2,'0')+':'+String(time.getMinutes()).padStart(2,'0'),text:parts.join(' · ')};
   });
   this.setData({dateLimit:today,formError:'',healthScore:score,bodyIndicators:health.indicators(latest,score,today),bodyChart:buildBodyChart(history,this.data.bodyChart.metric,this.data.bodyChart.days,today,this.data.appliedRange),changes:state.changes(history,today),weightText:latest.kg.value?units.toDisplayWeight(latest.kg.value).toFixed(1):'—',weightUnit:units.weightUnitLabel(),weightDate:date('kg'),heightText:latest.heightCm.value?latest.heightCm.value+' cm':'—',heightDate:date('heightCm'),bmiText:score.bmi===null?'—':score.bmi.toFixed(1),bmiTone:score.bmi===null?'':bmi.classifyBmi(score.bmi).tone,ratioText:score.ratio===null?'—':score.ratio.toFixed(2),waistText:latest.waistCm.value?latest.waistCm.value+' cm':'—',waistDate:date('waistCm'),hipText:latest.hipCm.value?latest.hipCm.value+' cm':'—',hipDate:date('hipCm'),recent});
  }catch(error){this.setData({formError:'读取身体数据失败，请稍后重试',healthScore:{ready:false,value:null,text:'—',reason:'读取失败，暂无法评分'},bodyIndicators:[],bodyChart:{metric:this.data.bodyChart.metric,days:this.data.bodyChart.days,hasData:false,points:[],segments:[]}});}
 },
 handleBodyMetric(event){const metric=event.currentTarget.dataset.metric;if(!['kg','waistCm','hipCm'].includes(metric))return;this.setData({bodyChart:Object.assign({},this.data.bodyChart,{metric})});this.refresh();},
 toggleBodyRangeMenu(){if(this.data.bodyRangeMenuOpen){this.closeBodyRangeMenu();return;}this.handleBodyRange({currentTarget:{dataset:{range:'custom'}}});},
 closeBodyRangeMenu(){if(this.data.bodyRangeMenuOpen)this.setData({bodyRangeMenuOpen:false,customRangeOpen:false});},
 keepBodyRangeMenu(){},
 onPageScroll(){this.closeBodyRangeMenu();},
 onHide(){this.closeBodyRangeMenu();},
 handleBodyRange(event){
  const range=event.currentTarget.dataset.range,days={week:7,month:30,year:365}[range];
  if(range==='custom'){
   this.setData({bodyRangeMenuOpen:true,customRangeOpen:true,customStart:this.data.bodyChart.startDate || formatDate(new Date()),customEnd:this.data.bodyChart.endDate || formatDate(new Date()),rangeError:''});return;
  }
  if(!days)return;
  this.setData({bodyRangeMenuOpen:false,bodyRangeLabel:{week:'周',month:'月',year:'年'}[range],bodyRange:range,customRangeOpen:false,rangeError:'',appliedRange:null,bodyChart:Object.assign({},this.data.bodyChart,{days})});this.refresh();
 },
 handleCustomDate(event){const key=event.currentTarget.dataset.field;if(!['customStart','customEnd'].includes(key))return;this.setData({[key]:event.detail.value,rangeError:''});},
 applyCustomRange(){
  const start=state.dayNumber(this.data.customStart),end=state.dayNumber(this.data.customEnd),today=state.dayNumber(formatDate(new Date()));
  if(start===null || end===null || start>end || end>today){this.setData({rangeError:'请选择有效起止日期，结束日期不能早于开始日期或晚于今天'});return;}
  this.setData({bodyRangeMenuOpen:false,customRangeOpen:false,bodyRangeLabel:'自选',bodyRange:'custom',appliedRange:{start:this.data.customStart,end:this.data.customEnd},rangeError:''});this.refresh();
 },
 toggleSources(){this.setData({sourcesOpen:!this.data.sourcesOpen});},
 toggleGuide(){this.setData({guideOpen:!this.data.guideOpen});},
 openTrends(){wx.navigateTo({url:'/pages/analysis/analysis'});},
}));
