// Official API endpoints and key-management pages, reviewed 2026-11-01.
// Presets configure a provider; they do not assert that every model supports
// images/audio or that its recognition protocol has already been integrated.
const PROVIDERS = [
    {id:'openai',name:'OpenAI',baseUrl:'https://api.openai.com/v1',keyUrl:'https://platform.openai.com/api-keys',note:'选择支持图片输入或语音转写的模型；两类模型名称不同。',source:'https://developers.openai.com/api/reference/overview'},
    {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',keyUrl:'https://platform.deepseek.com/api_keys',note:'图片输入能力请以具体模型文档为准；语音转写接口需另行确认。',source:'https://api-docs.deepseek.com/'},
    {id:'modelscope',name:'魔搭',baseUrl:'https://api-inference.modelscope.cn/v1',keyUrl:'https://www.modelscope.cn/my/myaccesstoken',note:'使用魔搭访问令牌，模型需支持 API 推理；并非所有模型都提供同一种接口。',source:'https://www.modelscope.cn/docs/model-service/API-Inference/intro'},
    {id:'openrouter',name:'OpenRouter',baseUrl:'https://openrouter.ai/api/v1',keyUrl:'https://openrouter.ai/settings/keys',note:'填写完整的服务商/模型 ID，确认模型支持图片或音频输入。',source:'https://openrouter.ai/docs/quickstart'},
    {id:'zhipu',name:'智谱',baseUrl:'https://open.bigmodel.cn/api/paas/v4',keyUrl:'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',note:'使用开放平台通用 API，不使用 Coding Plan 专用地址；视觉与语音需选择对应模型。',source:'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction'},
    {id:'aliyun',name:'千问',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',keyUrl:'https://bailian.console.aliyun.com/?tab=model#/api-key',note:'预填北京地域兼容地址；可改为业务空间专属地址。密钥与地址必须属于同一地域，语音接口需按模型适配。',source:'https://help.aliyun.com/zh/model-studio/get-api-key'},
    {id:'siliconflow',name:'硅基流动',baseUrl:'https://api.siliconflow.cn/v1',keyUrl:'https://cloud.siliconflow.cn/account/ak',note:'填写平台上的完整模型 ID；视觉模型与语音转写模型分别选择。',source:'https://docs.siliconflow.cn/docs/usercases/use-siliconcloud-in-dify'},
    {id:'gemini',name:'Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',keyUrl:'https://aistudio.google.com/apikey',note:'预填 OpenAI 兼容地址；音频理解与专用语音转写接口并不等同，需按模型适配。',source:'https://ai.google.dev/gemini-api/docs/openai'},
    {id:'custom',name:'自定义',baseUrl:'',keyUrl:'',note:'填写服务商提供的 HTTPS 基础地址、模型 ID 和密钥。'},
];
function getProvider(id) { return PROVIDERS.find(item => item.id === id) || PROVIDERS[PROVIDERS.length - 1]; }
function inferProvider(baseUrl) { return (PROVIDERS.find(item => item.baseUrl && item.baseUrl === baseUrl) || getProvider('custom')).id; }
module.exports = {PROVIDERS,getProvider,inferProvider};
