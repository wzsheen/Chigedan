const measurements=require('../../utils/body-measurements');
const units=require('../../utils/units');
const {formatDate}=require('../../utils/record-store');
Component({
    properties:{visible:{type:Boolean,value:false,observer(value){if(value)this.open();}},mode:{type:String,value:'all'},theme:{type:String,value:'light'}},
    data:{drafts:{kg:'',heightCm:'',waistCm:'',hipCm:''},fields:[],date:'',error:'',saving:false},
    methods:{
        open(){
            const latest=measurements.current(),mode=this.properties.mode,key=units.getWeightUnit();this.unitKey=key;
            const all=[{key:'kg',label:'体重',unit:units.weightUnitLabel()},{key:'heightCm',label:'身高',unit:'cm'},{key:'waistCm',label:'腰围',unit:'cm'},{key:'hipCm',label:'臀围',unit:'cm'}];
            // change 模式只记录会变化的三项（体重/腰围/臀围），身高是固定资料，不混在「记变化」里
            const fields=mode==='weight'?all.filter(row=>row.key==='kg'):mode==='change'?all.filter(row=>row.key!=='heightCm'):all;
            const drafts={kg:'',heightCm:'',waistCm:'',hipCm:''};
            if(mode==='weight' && latest.kg.value)drafts.kg=units.toDisplayWeight(latest.kg.value).toFixed(1);
            this.setData({drafts,fields,date:formatDate(new Date()),error:'',saving:false});
        },
        input(event){const key=event.currentTarget.dataset.key;if(!this.data.fields.some(row=>row.key===key))return;this.setData({drafts:Object.assign({},this.data.drafts,{[key]:event.detail.value}),error:''});},
        close(){if(!this.data.saving)this.triggerEvent('close');},
        noop(){},
        async save(){
            if(this.data.saving)return;
            const values={};
            for(const field of this.data.fields){const raw=String(this.data.drafts[field.key]).trim();if(!raw)continue;if(!/^\d+(?:\.\d+)?$/.test(raw)){this.setData({error:'请填写有效的'+field.label});return;}values[field.key]=field.key==='kg'?units.WEIGHT_UNITS[this.unitKey].toKg(Number(raw)):Number(raw);}
            this.setData({saving:true,error:''});
            const result=await measurements.save(values);
            this.setData({saving:false});
            if(result.error){this.setData({error:result.error.message});return;}
            this.triggerEvent('saved',result.data);this.triggerEvent('close');wx.showToast({title:'已记录',icon:'success'});
        },
    },
});
