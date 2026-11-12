const test=require('node:test');
const assert=require('node:assert/strict');
const animation=require('../utils/mascot-animation');
const {createScheduler,candidates,ROUNDS,COOLDOWN,IDLE_GAP}=require('../utils/mascot-scheduler');
const base={kind:'adjust',count:2,hour:14,water:0,waterGoal:1500};

test('each gesture runs the agreed number of complete atlas clips',()=>{
    const scheduler=createScheduler();
    assert.deepEqual(ROUNDS,{water:3,adjust:3,balanced:3,success:3,sleep:2});
    for(const kind of Object.keys(ROUNDS))assert.equal(scheduler.begin(kind,1000),animation.duration(kind)*ROUNDS[kind]);
    assert.equal(scheduler.begin('unknown',1000),0);
});

test('automatic reminders wait for idle time, rotate fairly and recheck current conditions',()=>{
    const s=createScheduler();
    assert.equal(s.next(base,1000),'water');s.begin('water',1000);s.finish(10000);
    assert.equal(s.next(base,10000+IDLE_GAP-1),null);
    assert.equal(s.next({...base,kind:'neutral'},40000),null,'resolved diet condition removes pending advice');
    assert.equal(s.next(base,40000),'adjust');s.begin('adjust',40000);s.finish(50000);
    assert.equal(s.next(base,80000),null);
    assert.equal(s.next(base,1000+COOLDOWN),'water');
    assert.equal(s.next({...base,water:1500},1000+COOLDOWN),null,'completed water goal suppresses reminder');
    assert.equal(s.next(base,40000+COOLDOWN),'water','older eligible reminder comes first');
    s.begin('water',40000+COOLDOWN);s.finish(50000+COOLDOWN);
    assert.equal(s.next(base,80000+COOLDOWN),'adjust');
});

test('incomplete nutrition is not judged; night has a quiet idle clip without waving',()=>{
    assert.deepEqual(candidates({...base,water:1500,nutritionMissing:true}),[]);
    assert.deepEqual(candidates({...base,kind:'good',water:1500}),['balanced']);
    assert.deepEqual(candidates({...base,hour:22}),['sleep']);
    assert.deepEqual(candidates({...base,hour:4}),['sleep']);
    assert.ok(animation.CLIPS.rest.every(frame=>frame.row===animation.ROWS.idle));
    const s=createScheduler();s.begin('sleep',0);s.finish(10000);
    assert.equal(s.next({...base,hour:22},40000),null);
    assert.equal(s.next({...base,hour:22},COOLDOWN),'sleep');
});
