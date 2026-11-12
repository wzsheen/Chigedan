// Display metadata only: never changes request protocols or model IDs.
const DEFINITIONS=[['vision','视觉输入','eye'],['tools','工具调用','wrench'],['audio','音频输入','mic'],['reasoning','推理思考','brain'],['video','视频输入','video'],['file','文件输入','file'],['text','文字输入','text'],['embedding','向量检索','embedding'],['rerank','相关性重排','rerank']];
const MODALITIES=['text','image','audio','video','file'];
// Exact documented IDs only; provider metadata overrides these fallbacks.
const KNOWN={
    'glm-4.5v':{inputs:['text','image']},
    'glm-4.6v-flash':{inputs:['text','image','video','file'],tools:true,reasoning:true},
    'gemini-2.5-flash':{inputs:['text','image','audio','video'],tools:true,reasoning:true},
};
function documentedModel(id){
    const base=String(id || '').toLowerCase().split('/').pop().replace(/:free$/,'');
    if(KNOWN[base])return KNOWN[base];
    if(/^bge-reranker-(?:v2-m3|base|large|v2-gemma|v2-minicpm-layerwise)$/.test(base))return {inputs:['text'],rerank:true};
    if(/^bge-(?:m3|(?:large|base|small)-(?:en|zh)(?:-v1\.5)?)$/.test(base))return {inputs:['text'],embedding:true};
    if(/^qwen2\.5-(?:coder-)?(?:0\.5|1\.5|3|7|14|32|72)b-instruct$/.test(base))return {inputs:['text']};
    if(/^qwen3-(?:0\.6|1\.7|4|8|14|30|32|235)b(?:-a(?:3|22)b)?$/.test(base))return {inputs:['text'],tools:true,reasoning:true};
    if(/^deepseek-r1(?:-0528|-zero|-distill-(?:qwen|llama)-(?:1\.5|7|8|14|32|70)b)?$/.test(base))return {inputs:['text'],reasoning:true};
    if(/^deepseek-v3(?:-0324)?$/.test(base))return {inputs:['text']};
    if(/^deepseek-v3\.1(?:-terminus)?$/.test(base))return {inputs:['text'],tools:true,reasoning:true};
    return {};
}
function metadata(row){
    const result={};
    const architecture=row && row.architecture || {},caps=row && row.capabilities || {};
    const inputs=architecture.input_modalities || row.input_modalities;
    if(Array.isArray(inputs))result.inputs=[...new Set(inputs.filter(value=>MODALITIES.includes(value)))];
    const parameters=row.supported_parameters;
    if(Array.isArray(parameters)){
        result.tools=parameters.includes('tools') || parameters.includes('tool_choice');
        result.reasoning=parameters.includes('reasoning') || parameters.includes('reasoning_effort');
    }
    for(const key of ['tools','reasoning','embedding','rerank'])if(typeof caps[key]==='boolean')result[key]=caps[key];
    if(typeof caps.vision==='boolean')result.vision=caps.vision;
    if(typeof row.owned_by==='string' && /^[a-z0-9_. /-]{1,80}$/i.test(row.owned_by))result.owner=row.owned_by;
    return result;
}
function brand(id,provider,info){
    const text=(String(id || '')+' '+String(info && info.owner || '')).toLowerCase();
    for(const [key,pattern] of [
        ['baai',/(?:^|[ /])(?:baai|bge)(?:[ /_.-]|$)/],
        ['bytedance',/(?:bytedance|doubao|seed-oss|seed-1\.|seed-2\.)/],
        ['hunyuan',/(?:hunyuan|tencent)/],['internlm',/(?:internlm|internvl|opengvlab)/],
        ['stepfun',/(?:^|[ /])(?:stepfun|step)(?:[ /_.-]|$)/],
        ['moonshot',/(?:moonshot|kimi)/],['minimax',/minimax/],['baichuan',/baichuan/],
        ['yi',/(?:01-ai|01\.ai|(?:^|[ /])yi[-/])/],['sensenova',/(?:sensenova|sensetime)/],
        ['jina',/(?:^|[ /])jina(?:[ /_.-]|$)/],['cohere',/(?:cohere|c4ai|command-r)/],
        ['fishaudio',/(?:fishaudio|fish-audio)/],['flux',/(?:black-forest-labs|(?:^|[ /])flux[-./])/],
        ['stability',/(?:stabilityai|stability-ai|stable-diffusion)/],
        ['microsoft',/(?:microsoft|(?:^|[ /])phi[-/])/],['nvidia',/(?:nvidia|nemotron)/],['ibm',/(?:ibm-granite|(?:^|[ /])granite[-/])/],
        ['gemini',/(?:^|[ /])(?:google|gemini)(?:[ /.-]|$)/],['openai',/(?:^|[ /])(?:openai|gpt|whisper|o[134])(?:[ /.-]|$)/],
        ['deepseek',/deepseek/],['zhipu',/(?:^|[ /])(?:zhipu|zai|z-ai|glm|chatglm)(?:[ /.-]|$)/],
        ['aliyun',/(?:qwen|tongyi|alibaba)/],['anthropic',/(?:claude|anthropic)/],['meta',/(?:llama|meta-llama)/],['mistral',/mistral|mixtral/],
    ])if(pattern.test(text))return key;
    return ['openai','deepseek','zhipu','aliyun','gemini'].includes(provider)?provider:'custom';
}
function describe(id,provider,info){
    const base=String(id || '').toLowerCase().split('/').pop();
    const known=documentedModel(id),flags=Object.assign({},known,info || {}),inputs=flags.inputs || [];
    const supported={vision:typeof flags.vision==='boolean'?flags.vision:inputs.includes('image'),tools:flags.tools===true,audio:inputs.includes('audio'),reasoning:flags.reasoning===true,video:inputs.includes('video'),file:inputs.includes('file'),text:inputs.includes('text'),embedding:flags.embedding===true,rerank:flags.rerank===true};
    return {id,icon:'/assets/ai/'+brand(id,provider,info)+'.png',capabilities:DEFINITIONS.filter(([key])=>supported[key]).map(([key,label,icon])=>({key,label,shortLabel:({vision:'视觉',tools:'工具',audio:'音频',reasoning:'推理',video:'视频',file:'文件',text:'文字',embedding:'向量',rerank:'重排'})[key],icon:'/assets/ai/cap-'+icon+'.png'}))};
}
module.exports={metadata,describe,brand};
