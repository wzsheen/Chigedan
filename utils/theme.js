const settings=require('./settings');
let system=null,initialized=false;
function readSystem(){
    try{const info=typeof wx.getAppBaseInfo==='function'?wx.getAppBaseInfo():typeof wx.getSystemInfoSync==='function'?wx.getSystemInfoSync():{};if(info.theme==='dark'||info.theme==='light')return info.theme;}catch(error){}
    return system || 'light';
}
function resolved(key){return key==='system'?((system || readSystem())==='dark'?'dark':'simple'):key;}
function apply(page){
    const key=['simple','light','dark'].includes(page.themeOverride)?page.themeOverride:settings.getTheme(),value=resolved(key),uiThemeClass='ui-theme-'+value;
    const navOpacity=settings.getNavOpacity(value),navBlur=settings.getNavBlur(),navGlass=settings.getNavGlass();
    const changed=page.data.uiTheme!==key || page.data.uiThemeClass!==uiThemeClass || page.data.navOpacity!==navOpacity || page.data.navBlur!==navBlur || page.data.navGlass!==navGlass;
    if(changed)page.setData({uiTheme:key,uiResolvedTheme:value,uiThemeClass,navOpacity,navBlur,navGlass});
    if(page.__navTheme!==value){
        page.__navTheme=value;const dark=value==='dark';
        try{if(typeof wx.setNavigationBarColor==='function')wx.setNavigationBarColor({frontColor:dark?'#ffffff':'#000000',backgroundColor:dark?'#171a21':'#fffbef',fail(){}});}catch(error){}
        try{if(typeof wx.setBackgroundColor==='function')wx.setBackgroundColor({backgroundColor:dark?'#171a21':'#fffbef',backgroundColorTop:dark?'#171a21':'#fffbef',backgroundColorBottom:dark?'#171a21':'#fffbef',fail(){}});}catch(error){}
    }
    return value;
}
function current(){if(typeof getCurrentPages==='function'){const pages=getCurrentPages(),page=pages[pages.length-1];if(page && page.data && page.setData)apply(page);}}
function initialize(){
    if(initialized)return;initialized=true;system=readSystem();
    if(typeof wx.onThemeChange==='function')wx.onThemeChange(event=>{if(event && ['light','dark'].includes(event.theme)){system=event.theme;current();}});
}
function refreshSystem(){system=readSystem();current();}
function withTheme(definition){
    const result=Object.assign({},definition);
    result.data=Object.assign({uiTheme:'light',uiResolvedTheme:'light',uiThemeClass:'ui-theme-light'},definition.data);
    ['onLoad','onShow'].forEach(name=>{const original=definition[name];result[name]=function(...args){apply(this);if(typeof original==='function')return original.apply(this,args);};});return result;
}
module.exports={apply,withTheme,initialize,refreshSystem,resolved};
