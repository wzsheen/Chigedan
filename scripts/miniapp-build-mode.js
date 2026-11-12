// Native multi-platform config is the source of truth; NODE_ENV is not injected into CommonJS pages.
const fs=require('node:fs');
const path=require('node:path');
const PLATFORMS=['mini-android','mini-ios'];
function assertReleaseConfig(config){
 for(const platform of PLATFORMS)if(config[platform] && config[platform].enableVConsole!=='close')throw Error(platform+' enableVConsole must be close for Release');
 if(!config['mini-android'])throw Error('Missing mini-android configuration');
}
function configureBuild(mode,root=path.resolve(__dirname,'..')){
 if(!['debug','release','check-release'].includes(mode))throw Error('Mode must be debug, release or check-release');
 const file=path.join(root,'project.miniapp.json');
 const source=fs.readFileSync(file,'utf8'),config=JSON.parse(source);
 if(mode==='check-release'){assertReleaseConfig(config);return mode;}
 const value=mode==='debug'?'open':'close';
 for(const platform of PLATFORMS)if(config[platform])config[platform].enableVConsole=value;
 // Preserve all unrelated values, including local native build settings; never log them.
 fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n','utf8');
 if(mode==='release')assertReleaseConfig(config);
 return mode;
}
if(require.main===module){
 try{const mode=process.argv[2] || process.env.MINIAPP_BUILD_MODE || 'release';configureBuild(mode);console.log(mode==='check-release'?'Release configuration verified: native vConsole disabled.':'Native build configuration: '+mode+' (vConsole '+(mode==='debug'?'open':'close')+').');}
 catch(error){console.error('Build mode check failed: '+(error instanceof SyntaxError?'Invalid project.miniapp.json':error.message));process.exitCode=1;}
}
module.exports={configureBuild,assertReleaseConfig};
