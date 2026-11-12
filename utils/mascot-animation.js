// Complete poses with intentional pauses; eight 192x208 slots per atlas row.
const ROWS={idle:0,waving:1,success:2,balanced:3,adjust:4,water:5,sleep:6,goal:7,spring:8,lantern:9,dragonboat:10,midautumn:11,halloween:12,christmas:13};
const COUNTS={idle:6,waving:4,success:5,balanced:6,adjust:6,water:6,sleep:6,goal:6,spring:6,lantern:6,dragonboat:6,midautumn:6,halloween:6,christmas:6};
const ASSET='/mascot-motion/assets/egg-atlas.png';
const FESTIVAL_ASSET='/mascot-motion/assets/festival-atlas.png';
function assetFor(state){return ROWS[state]>=8?FESTIVAL_ASSET:ASSET;}
// Match the first standing pose's body height and floor across rows. Keep one
// transform for the entire action: intentional squash and airborne frames remain.
const GEOMETRY={idle:{height:192,floor:200},waving:{height:192,floor:200},success:{height:166,floor:200},balanced:{height:184,floor:196},adjust:{height:177,floor:192,centerX:80},water:{height:194,floor:201},sleep:{height:188,floor:199},goal:{height:192,floor:200}};
function presentation(state) {
    const key=state==='rest'?'idle':state;
    const row=GEOMETRY[key] || GEOMETRY.idle;
    const scale=192/row.height;
    const y=(200-row.floor)*.75*scale;
    const x=(96-(row.centerX || 96))*.75*scale;
    return {scale,floor:150,style:'transform:translate('+x.toFixed(3)+'rpx,'+y.toFixed(3)+'rpx) scale('+scale.toFixed(5)+');transform-origin:50% 150rpx;'};
}
const idle=[650,120,90,90,90,380].map((ms,column)=>({row:0,column,ms}));
const wave=[[0,120],[1,150],[2,150],[1,150],[2,150],[1,120],[3,260]].map(([column,ms])=>({row:1,column,ms}));
const durations={success:[300,140,220,160,1200],balanced:[650,200,120,200,650,1100],adjust:[600,250,200,350,550,850],water:[500,250,450,450,300,900],sleep:[650,250,400,450,600,1200],goal:[350,400,250,650,650,900]};
for(const key of ['spring','lantern','dragonboat','midautumn','halloween','christmas'])durations[key]=[500,350,450,550,450,600];
const CLIPS={idle:idle.concat(wave,idle),rest:idle};
Object.keys(durations).forEach(state=>{CLIPS[state]=durations[state].map((ms,column)=>({row:ROWS[state],column,ms}));});
function safeState(state){return Object.prototype.hasOwnProperty.call(CLIPS,state)?state:'idle';}
function duration(state){return CLIPS[safeState(state)].reduce((sum,f)=>sum+f.ms,0);}
function frameAt(state,elapsed){
    const frames=CLIPS[safeState(state)];
    let offset=(Number.isFinite(elapsed)?Math.max(0,elapsed):0)%duration(state);
    for(const f of frames){if(offset<f.ms)return {row:f.row,column:f.column,remaining:f.ms-offset};offset-=f.ms;}
    return {row:frames[0].row,column:frames[0].column,remaining:frames[0].ms};
}
module.exports={ROWS,COUNTS,ASSET,FESTIVAL_ASSET,assetFor,CLIPS,GEOMETRY,presentation,safeState,duration,frameAt};
