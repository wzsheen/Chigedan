const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {configureBuild,assertReleaseConfig}=require('../scripts/miniapp-build-mode');
test('committed build config explicitly disables native vConsole on release platforms',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../project.miniapp.json'),'utf8'));assertReleaseConfig(config);
});
test('explicit debug opt-in and release preparation preserve unrelated native config; check is read only',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cal-build-mode-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'project.miniapp.json'),original={version:'1.0','mini-android':{enableVConsole:'open',sdkVersion:'1.7.0',untouched:{value:12}},'mini-ios':{enableVConsole:'open'}};fs.writeFileSync(file,JSON.stringify(original));
 assert.throws(()=>configureBuild('check-release',root),/must be close/);const before=fs.readFileSync(file,'utf8');assert.throws(()=>configureBuild('unknown',root));assert.equal(fs.readFileSync(file,'utf8'),before);
 configureBuild('release',root);const released=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(released['mini-android'].enableVConsole,'close');assert.deepEqual(released['mini-android'].untouched,original['mini-android'].untouched);assert.equal(released['mini-android'].sdkVersion,'1.7.0');
 const releaseText=fs.readFileSync(file,'utf8');configureBuild('check-release',root);assert.equal(fs.readFileSync(file,'utf8'),releaseText);
 configureBuild('debug',root);assert.equal(JSON.parse(fs.readFileSync(file,'utf8'))['mini-android'].enableVConsole,'open');assert.throws(()=>configureBuild('check-release',root));
 configureBuild('release',root);assertReleaseConfig(JSON.parse(fs.readFileSync(file,'utf8')));
});
test('runtime source and packaged assets contain no third party mobile debug panel loaders',()=>{
 const root=path.join(__dirname,'..');let count=0;
 function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(/\.(js|json|wxml|wxss|html)$/i.test(entry.name)){count++;assert.doesNotMatch(fs.readFileSync(file,'utf8'),/vconsole|eruda|weinre|chobitsu|debugger-ui|debug-panel/i,path.relative(root,file));}}}
 for(const dir of ['pages','components','utils','assets','mascot-motion','launch-video'])scan(path.join(root,dir));
 assert.ok(count>100);
});
