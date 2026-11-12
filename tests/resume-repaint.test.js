const test=require('node:test');
const assert=require('node:assert/strict');

function setup(t){
    let now=1000,seq=0;
    const timers=new Map(),pages=[],oldPages=global.getCurrentPages;
    t.mock.method(Date,'now',()=>now);
    t.mock.method(global,'setTimeout',(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;});
    t.mock.method(global,'clearTimeout',id=>timers.delete(id));
    global.getCurrentPages=()=>pages;
    t.after(()=>{global.getCurrentPages=oldPages;});
    const file='../utils/repaint';delete require.cache[require.resolve(file)];
    const repaint=require(file);repaint.reset();
    return {repaint,pages,timers,advance(ms){now+=ms;},run(id){const entry=timers.get(id);timers.delete(id);if(entry)entry.fn();}};
}

function page(themeClass,onSetData){
    return {data:{uiThemeClass:themeClass},setData(patch,callback){Object.assign(this.data,patch);if(typeof callback==='function')callback();if(onSetData)onSetData(patch);}};
}

test('short background switches never repaint',t=>{
    const {repaint,pages,timers}=setup(t);
    const home=page('ui-theme-light');pages.push(home);
    repaint.onAppHide();
    assert.equal(repaint.onAppShow(),false);
    assert.equal(home.data.uiThemeClass,'ui-theme-light');
    assert.equal(timers.size,0);
});

test('cold start has no hidden time and is skipped',t=>{
    const {repaint,pages}=setup(t);
    const welcome=page('ui-theme-light');pages.push(welcome);
    assert.equal(repaint.onAppShow(),false);
    assert.equal(welcome.data.uiThemeClass,'ui-theme-light');
});

test('a long background repaints the top page and restores its class',t=>{
    const {repaint,pages,timers,advance,run}=setup(t);
    const trends=page('ui-theme-dark');pages.push(page('ui-theme-light'),trends);
    repaint.onAppHide();advance(15000);
    assert.equal(repaint.onAppShow(),true);
    assert.equal(trends.data.uiThemeClass,'ui-theme-dark ui-repaint');
    assert.equal(pages[0].data.uiThemeClass,'ui-theme-light');
    const ids=[...timers.keys()];
    assert.equal(timers.get(ids[0]).ms,32);assert.equal(timers.get(ids[1]).ms,280);
    run(ids[0]);
    assert.equal(trends.data.uiThemeClass,'ui-theme-dark');
    run(ids[1]);
    assert.equal(trends.data.uiThemeClass,'ui-theme-dark ui-repaint');
});

test('pages without a root theme class are skipped instead of throwing',t=>{
    const {repaint,pages,advance}=setup(t);
    pages.push({data:{},setData(){throw new Error('web-view page must not be touched');}});
    repaint.onAppHide();advance(9000);
    assert.equal(repaint.onAppShow(),false);
});

test('an empty page stack is ignored',t=>{
    const {repaint,advance}=setup(t);
    repaint.onAppHide();advance(20000);
    assert.equal(repaint.onAppShow(),false);
});

test('a leftover transient class is cleaned up instead of stacking',t=>{
    const {repaint,pages,advance}=setup(t);
    const home=page('ui-theme-light ui-repaint');pages.push(home);
    repaint.onAppHide();advance(8000);
    assert.equal(repaint.onAppShow(),false);
    assert.equal(home.data.uiThemeClass,'ui-theme-light');
});

test('a theme change while in background survives the repaint',t=>{
    const {repaint,pages,timers,advance,run}=setup(t);
    const home=page('ui-theme-light');pages.push(home);
    repaint.onAppHide();advance(12000);
    home.data.uiThemeClass='ui-theme-dark'; // 后台期间系统切了深色，theme.apply 已写过一次
    repaint.onAppShow();
    assert.equal(home.data.uiThemeClass,'ui-theme-dark ui-repaint');
    run([...timers.keys()][0]);
    assert.equal(home.data.uiThemeClass,'ui-theme-dark');
});
