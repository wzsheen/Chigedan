const {withTheme}=require('../../utils/theme');
const { createRecordStore, formatDate } = require('../../utils/record-store.js');
const units = require('../../utils/units.js');
const calendar = require('../../utils/trend-calendar');
const { createWeightStore } = require('../../utils/body-store.js');
const settings = require('../../utils/settings.js');
const { buildAnalysis } = require('../../utils/analysis.js');

const recordStore = createRecordStore({ storageKey: 'cal_records' });
const weightStore = createWeightStore({ storageKey: 'cal_weight' });

function signed(value, unit) {
    const num = Math.round(value * 10) / 10;
    if (num > 0) {
        return '+' + num + unit;
    }
    if (num < 0) {
        return String(num) + unit;
    }
    return '0' + unit;
}

function buildViewModel(analysis) {
    const dims = analysis.score.dims.map(item => ({
        key: item.key,
        label: item.label,
        scoreText: item.score === null ? '—' : String(item.score),
        width: item.score === null ? 0 : item.score,
    }));

    const macroRows = analysis.macro.rows.map(row => {
        let tone = 'ok';
        if (row.status === 'low') {
            tone = 'low';
        } else if (row.status === 'high') {
            tone = 'high';
        }
        return {
            label: row.label,
            shareText: row.share + '%',
            rangeText: '建议 ' + row.min + '–' + row.max + '%',
            width: Math.max(row.width, 3),
            tone: tone,
        };
    });

    let weightView = {
        mode: 'none',
        message: analysis.weight.message || '',
    };
    if (analysis.weight.hasTrend) {
        const change = analysis.weight.change;
        weightView = {
            mode: 'trend',
            startText: units.toDisplayWeight(analysis.weight.startKg).toFixed(1),
            endText: units.toDisplayWeight(analysis.weight.endKg).toFixed(1),
            changeText: signed(units.toDisplayWeight(change) - units.toDisplayWeight(0), ' ' + units.weightUnitLabel()),
            changeTone: change < 0 ? 'down' : (change > 0 ? 'up' : 'flat'),
            theoryText: signed(units.toDisplayWeight(analysis.weight.theoryChange) - units.toDisplayWeight(0), ' ' + units.weightUnitLabel()),
            deficitText: units.energyText(analysis.weight.deficit),
            verdictText: analysis.weight.verdictText,
            verdictTone: analysis.weight.verdict === 'match' ? 'good' : 'warn',
        };
    }

    const behaviorView = {
        hasData: analysis.behavior.hasData,
        windowText: analysis.behavior.hasData ? analysis.behavior.windowHours + ' 小时' : '—',
        firstMealText: analysis.behavior.firstMealHour === '' ? '—' : analysis.behavior.firstMealHour,
        lateDaysText: analysis.behavior.lateDays + ' 天',
        lateTone: analysis.behavior.lateDays >= 3 ? 'warn' : 'ok',
    };

    return {
        scoreText: String(analysis.score.total),
        levelText: analysis.score.level.text,
        levelTone: analysis.score.level.tone,
        ageText: '近 ' + analysis.days + ' 天 · 有效记录 ' + analysis.intake.recordedDays + ' 天',
        dims: dims,
        avgKcalText: String(units.toDisplayEnergy(analysis.intake.avgKcal)),
        goalText: String(units.toDisplayEnergy(analysis.goal)),
        energyUnit: units.energyUnitLabel(),
        weightUnit: units.weightUnitLabel(),
        macroHasData: analysis.macro.hasData,
        macroRows: macroRows,
        weight: weightView,
        behavior: behaviorView,
        diversity: {
            distinct: String(analysis.diversity.distinct),
            repeatText: analysis.diversity.repeatRate + '%',
            top: analysis.diversity.top,
        },
        conclusions: analysis.conclusions,
    };
}

Page(withTheme({
    data: {
        rangeDays: 7,
        viewState: 'loading',
        view: null,
        ringStyle: '',
        errorMessage: '',
        calendar: {cells:[]},
        weekdays:['日','一','二','三','四','五','六'],
        selectedDate:'',
        day:null,
        showDetails:false,
        weightEditorOpen:false,bodyEditorMode:'change',bodyTrendMetric:'kg',bodyTrendLabel:'体重',bodyTrendSummary:'',bodyTrendChange:'',
        chartPoint:null,
    },

    onShow() {
        if(!this.data.selectedDate) {
            const now=new Date(); this.calendarYear=now.getFullYear();this.calendarMonth=now.getMonth();
            this.setData({selectedDate:formatDate(now)});
        }
        this.load(this.data.rangeDays);
    },

    updateCalendar() {
        const selected=this.data.selectedDate;
        const summary=calendar.daySummary(selected,this.records || [],this.waterEntries || []);
        summary.energyText=units.energyText(summary.kcal);
        this.setData({calendar:calendar.buildCalendar(this.calendarYear,this.calendarMonth,this.records || [],formatDate(new Date()),selected),day:summary});
    },
    handleMonth(event) {
        const step=Number(event.currentTarget.dataset.step);
        if(step>0 && !this.data.calendar.canNext) return;
        const next=new Date(this.calendarYear,this.calendarMonth+step,1);
        if(next.getFullYear()<2020) return;
        this.calendarYear=next.getFullYear();this.calendarMonth=next.getMonth();this.updateCalendar();
    },
    handleDay(event) {
        const date=event.currentTarget.dataset.date;
        if(!date || date>formatDate(new Date())) return;
        this.setData({selectedDate:date,chartPoint:null});this.updateCalendar();this.renderAnalysis(this.data.rangeDays);
    },
    handleToday() {
        const now=new Date();this.calendarYear=now.getFullYear();this.calendarMonth=now.getMonth();
        this.setData({selectedDate:formatDate(now),chartPoint:null});this.updateCalendar();this.renderAnalysis(this.data.rangeDays);
    },
    handlePoint(event) { const point=this.data.trend.points[Number(event.currentTarget.dataset.index)];this.setData({chartPoint:point.missing ? null : point}); },
    handleDetails() { this.setData({showDetails:!this.data.showDetails}); },

    handleRangeChange(event) {
        const days = Number(event.currentTarget.dataset.days) === 30 ? 30 : 7;
        if (days === this.data.rangeDays) {
            return;
        }
        this.setData({ rangeDays: days });
        this.load(days);
    },

    buildTrend(records, days, goal) {
        const now = this.data.selectedDate ? new Date(this.data.selectedDate + 'T12:00:00') : new Date();
        const points = [];
        for (let i = days - 1; i >= 0; i -= 1) {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const key = formatDate(date);
            const items = records.filter(item => item.date === key);
            const total = items.reduce((sum, item) => sum + Number(item.kcal || 0), 0);
            points.push({ key, label: (date.getMonth() + 1) + '.' + date.getDate(), total, missing: !items.length });
        }
        const max = Math.max(goal * 1.15, ...points.map(item => item.total));
        const plotted=points.map((item,index)=>Object.assign({},item,{x:index*600/(days-1),y:item.total/max*240}));
        const segments=[];
        plotted.forEach((point,index)=>{
            const previous=plotted[index-1];
            if(!previous || point.missing || previous.missing) return;
            const dx=point.x-previous.x,dy=point.y-previous.y;
            segments.push({key:point.key,style:"left:"+previous.x+"rpx;bottom:"+previous.y+"rpx;width:"+Math.sqrt(dx*dx+dy*dy)+"rpx;transform:rotate("+(-Math.atan2(dy,dx)*180/Math.PI)+"deg);"});
        });
        return {
            segments,
            maxText:String(units.toDisplayEnergy(max)),
            points: plotted.map((item, index) => Object.assign({}, item, {
                height: item.missing ? 0 : Math.max(1, item.total / max * 100),
                display: String(units.toDisplayEnergy(item.total)),
                showLabel: days === 7 || index === 0 || index === days - 1 || index % 7 === 0,
            })),
            goalBottom: goal / max * 240,
            recordedDays: points.filter(item => !item.missing).length,
            rangeStart: points[0].label,
            rangeEnd: points[points.length - 1].label,
            goalText: units.energyText(goal),
        };
    },

    load(days) {
        const revision=(this.loadRevision || 0)+1;this.loadRevision=revision;
        this.setData({viewState:'loading'});
        Promise.all([recordStore.list(),weightStore.list()]).then(results=>{
            if(revision!==this.loadRevision) return;
            if(results.some(result=>result.error)) {this.setData({viewState:'error',errorMessage:'数据读取失败，请重试'});return;}
            this.records=results[0].data;this.weights=results[1].data;this.bodyMeasurements=require('../../utils/body-measurements').history();
            const water=wx.getStorageSync('cal_water');this.waterEntries=Array.isArray(water)?water:[];
            this.updateCalendar();this.renderAnalysis(days);
        }).catch(()=>{if(revision===this.loadRevision)this.setData({viewState:'error',errorMessage:'数据读取失败，请重试'});});
    },

    renderAnalysis(days) {
        const analysis=buildAnalysis({records:this.records || [],weights:this.weights || [],waterEntries:this.waterEntries || [],goal:settings.getGoal(),waterGoal:settings.getWaterGoal(),macroTargets:settings.getMacroTargets(),profile:settings.getProfile(),days,today:this.data.selectedDate});
        const trend=this.buildTrend(this.records || [],days,settings.getGoal());
        const start=trend.points[0].key,end=trend.points[trend.points.length-1].key;
        const waterByDate={};(this.waterEntries || []).filter(row=>row.date>=start && row.date<=end).forEach(row=>{waterByDate[row.date]=(waterByDate[row.date]||0)+(Number(row.ml)||0);});
        const waterDays=Object.keys(waterByDate).filter(date=>waterByDate[date]>=settings.getWaterGoal()).length;
        const activeRecords=(this.records || []).filter(row=>row.date>=start && row.date<=end);
        const average=trend.recordedDays ? activeRecords.reduce((sum,row)=>sum+(Number(row.kcal)||0),0)/trend.recordedDays : 0;
        const validNutrition=activeRecords.filter(row=>row.nutritionStatus!=='incomplete' && ['carb','protein','fat'].some(key=>Number(row[key])>0));
        const macroDays=new Set(validNutrition.map(row=>row.date)).size;
        const totals=['carb','protein','fat'].map(key=>validNutrition.reduce((sum,row)=>sum+(Number(row[key])||0),0));
        const macroEnergy=totals[0]*4+totals[1]*4+totals[2]*9;
        const shares=totals.map((total,index)=>macroEnergy ? total*(index===2?9:4)/macroEnergy*100 : 0);
        const nutrients=['碳水化合物','蛋白质','脂肪'].map((label,index)=>({key:['carb','protein','fat'][index],label,grams:macroDays ? Math.round(totals[index]/macroDays) : '—',share:Math.round(shares[index]),width:shares[index]}));
        const metric=this.data.bodyTrendMetric || 'kg',format=value=>metric==='kg'?units.toDisplayWeight(value).toFixed(1):Number(value).toFixed(1),bodyUnit=metric==='kg'?units.weightUnitLabel():'cm';
        const weightPoints=(metric==='kg'?(this.weights || []):(this.bodyMeasurements || [])).filter(row=>row.date>=start && row.date<=end && Number(row[metric])>0).sort((a,b)=>a.date.localeCompare(b.date) || a.ts-b.ts);
        const weightGraph={points:[],segments:[]};
        if(weightPoints.length) {
            const values=weightPoints.map(row=>row[metric]),low=Math.min(...values)-.2,span=Math.max(...values)-low+.2;
            const datespan=Math.max(1,new Date(end+'T12:00:00')-new Date(start+'T12:00:00'));
            weightGraph.points=weightPoints.map(row=>({key:String(row.ts),x:(new Date(row.date+'T12:00:00')-new Date(start+'T12:00:00'))/datespan*600,y:(row[metric]-low)/span*130,label:format(row[metric])}));
            weightGraph.points.forEach((point,index)=>{if(!index)return;const previous=weightGraph.points[index-1],dx=point.x-previous.x,dy=point.y-previous.y;weightGraph.segments.push({key:point.key,style:'left:'+previous.x+'rpx;bottom:'+previous.y+'rpx;width:'+Math.sqrt(dx*dx+dy*dy)+'rpx;transform:rotate('+(-Math.atan2(dy,dx)*180/Math.PI)+'deg);'});});
        }
        const ringStyle=macroEnergy?'background:conic-gradient(#ffce55 0deg '+(shares[0]*3.6)+'deg,#a9c995 '+(shares[0]*3.6)+'deg '+((shares[0]+shares[1])*3.6)+'deg,#efa080 '+((shares[0]+shares[1])*3.6)+'deg 360deg);':'';
        const view=analysis.hasData ? buildViewModel(analysis) : null;
        const first=weightPoints[0],last=weightPoints[weightPoints.length-1];
        const bodyTrendSummary=first?(weightPoints.length>1?format(first[metric])+' → '+format(last[metric]):format(last[metric]))+' '+bodyUnit:'';
        const change=first && last?last[metric]-first[metric]:0;
        this.setData({bodyTrendSummary,bodyTrendChange:weightPoints.length>1?signed(metric==='kg'?units.toDisplayWeight(change):change,' '+bodyUnit):'',weightGraph,nutritionRingStyle:ringStyle,viewState:analysis.hasData?'ready':'empty',trend,view,chartPoint:null,overview:{average:trend.recordedDays?String(units.toDisplayEnergy(average)):'—',unit:units.energyUnitLabel(),difference:trend.recordedDays?signed(units.toDisplayEnergy(average-settings.getGoal()),' '+units.energyUnitLabel()):'—',goal:units.energyText(settings.getGoal()),waterDays,distinct:new Set(activeRecords.map(row=>row.name)).size,nutrients,macroDays,macroMissing:activeRecords.length-validNutrition.length}});
    },

    buildRingStyle(score) {
        const deg = Math.round(Math.max(0, Math.min(100, score)) * 3.6);
        let color = '#ff6b35';
        if (score >= 85) {
            color = '#2fb37a';
        } else if (score < 55) {
            color = '#e5484d';
        }
        return 'background: conic-gradient(' + color + ' ' + deg + 'deg, rgba(255,255,255,0.7) 0deg);';
    },

    handleOpenAdd() {
        wx.navigateTo({ url: '/pages/add/add' });
    },

    // 「记变化」固定打开三项（体重/腰围/臀围），不再跟着当前 Tab 只显示一项
    openBodyHistory(){wx.navigateTo({url:'/pages/history/history?tab=body'});},
    handleOpenWeight(){this.setData({bodyEditorMode:'change',weightEditorOpen:true});},
    handleBodyMetric(event){const key=event.currentTarget.dataset.key;if(!['kg','waistCm','hipCm'].includes(key))return;this.setData({bodyTrendMetric:key,bodyTrendLabel:{kg:'体重',waistCm:'腰围',hipCm:'臀围'}[key]});this.renderAnalysis(this.data.rangeDays);},
    closeWeightEditor(){this.setData({weightEditorOpen:false});},
    handleBodySaved(){
        this.setData({weightEditorOpen:false});
        const now=new Date();this.calendarYear=now.getFullYear();this.calendarMonth=now.getMonth();
        this.setData({selectedDate:formatDate(now)});this.load(this.data.rangeDays);
    },
}));
