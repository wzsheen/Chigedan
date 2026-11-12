const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const info=require('../utils/ai-model-info');
const root=path.join(__dirname,'..');
test('model brands are separate from aggregators and all bundled icons resolve',()=>{
    assert.equal(info.brand('google/gemini-example','openrouter'),'gemini');
    assert.equal(info.brand('Qwen/Qwen2.5-VL-7B-Instruct','modelscope'),'aliyun');
    assert.equal(info.brand('unknown-new-model','openrouter'),'custom');
    for(const provider of require('../utils/ai-providers').PROVIDERS)assert.ok(fs.existsSync(path.join(root,'assets/ai',provider.id+'.png')));
    for(const model of ['google/gemini-2.5-flash','z-ai/glm-4.6v-flash']){
        const row=info.describe(model,'openrouter');
        assert.ok(fs.existsSync(path.join(root,row.icon)));
        assert.ok(row.capabilities.some(cap=>cap.key==='vision'));
        assert.ok(row.capabilities.some(cap=>cap.key==='tools'));
        for(const cap of row.capabilities)assert.ok(fs.existsSync(path.join(root,cap.icon)));
    }
});
test('capabilities use sanitized input metadata; unknown models are never assumed multimodal',()=>{
    const meta=info.metadata({id:'unknown',architecture:{input_modalities:['image','audio','video','file','text','../secret','image']},supported_parameters:['tools','reasoning'],apiKey:'must-not-copy',capabilities:{tools:false},owned_by:'google'});
    assert.deepEqual(meta.inputs,['image','audio','video','file','text']);
    assert.equal(meta.apiKey,undefined);
    const row=info.describe('unknown','custom',meta);
    assert.deepEqual(row.capabilities.map(cap=>cap.key),['vision','audio','reasoning','video','file','text']);
    assert.deepEqual(info.describe('made-up-pro-vl-tools','custom').capabilities,[]);
    assert.deepEqual(info.describe('gemini-2.5-flash','gemini',info.metadata({architecture:{input_modalities:['text']},supported_parameters:[],capabilities:{reasoning:false}})).capabilities.map(cap=>cap.key),['text']);
});

test('catalogue organization prefixes resolve to their own vendor rather than a generic aggregator icon',()=>{
    const cases=[['BAAI/bge-large-en-v1.5','baai'],['BAAI/bge-large-zh-v1.5','baai'],['BAAI/bge-m3','baai'],['BAAI/bge-reranker-v2-m3','baai'],['ByteDance-Seed/Seed-OSS-36B-Instruct','bytedance'],['tencent/Hunyuan-A13B-Instruct','hunyuan'],['OpenGVLab/InternVL3-14B','internlm'],['stepfun-ai/step-3','stepfun'],['moonshotai/Kimi-K2-Instruct','moonshot'],['MiniMaxAI/MiniMax-M2','minimax'],['baichuan-inc/Baichuan2-13B-Chat','baichuan'],['01-ai/Yi-1.5-34B-Chat','yi'],['jinaai/jina-embeddings-v3','jina'],['CohereForAI/c4ai-command-r-plus','cohere'],['microsoft/Phi-4','microsoft'],['nvidia/Nemotron-4','nvidia'],['ibm-granite/granite-3.3-8b-instruct','ibm']];
    for(const [id,vendor] of cases){assert.equal(info.brand(id,'siliconflow'),vendor,id);assert.ok(fs.existsSync(path.join(root,info.describe(id,'siliconflow').icon)));}
    assert.equal(info.brand('unrecognized-lab/unrecognized-model','siliconflow'),'custom');
});

test('screenshot model IDs retain capability icons with Pro and organization prefixes',()=>{
 const cases=[['Pro/BAAI/bge-reranker-v2-m3',['text','rerank']],['Pro/Qwen/Qwen2.5-7B-Instruct',['text']],['Pro/deepseek-ai/DeepSeek-R1',['reasoning','text']],['Pro/deepseek-ai/DeepSeek-V3',['text']],['Pro/deepseek-ai/DeepSeek-V3.1-Terminus',['tools','reasoning','text']],['BAAI/bge-m3',['text','embedding']],['Qwen/Qwen3-8B',['tools','reasoning','text']]];
 for(const [id,expected] of cases){const row=info.describe(id,'siliconflow');assert.deepEqual(row.capabilities.map(cap=>cap.key),expected,id);for(const cap of row.capabilities)assert.ok(fs.existsSync(path.join(root,cap.icon)));}
 assert.deepEqual(info.describe('Qwen/Qwen3-235B-A22B-Instruct-2507','siliconflow').capabilities,[]);
});

test('GLM-4.5V keeps its eye badge through full provider paths, and badges have compact two-character labels',()=>{
 for(const id of ['glm-4.5v','zai-org/GLM-4.5V','Pro/zai-org/GLM-4.5V']){
  const row=info.describe(id,'siliconflow');assert.ok(row.capabilities.some(cap=>cap.key==='vision' && cap.shortLabel==='视觉'));
  for(const cap of row.capabilities)assert.equal(cap.shortLabel.length,2);
 }
 const documented=info.describe('gemini-2.5-flash','gemini');for(const cap of documented.capabilities)assert.equal(cap.shortLabel.length,2);
});
