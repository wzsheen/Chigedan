# AI 图标与能力标注

厂商图标来自 LobeHub Icons（MIT），PNG 已随应用本地打包，不在运行时访问 CDN。许可原文保留于 `assets/ai/LICENSE.txt`。

- 项目：https://github.com/lobehub/lobe-icons
- 图标源：https://github.com/lobehub/lobe-icons/tree/master/packages/static-png/light
- 下载日期：2026-11-03
- 使用的图标：openai、deepseek-color、modelscope-color、openrouter、zhipu-color、qwen-color、siliconcloud-color、gemini-color、claude-color、meta-color、mistral-color。
- 能力图标和自定义服务图标为本项目绘制的线条 PNG。

模型厂商与调用平台分开识别，例如通过 OpenRouter 调用 Gemini，模型使用 Gemini 标识。识别不了的聚合平台模型显示通用图标，不猜测模型归属。

能力标记优先读取模型列表的 `architecture.input_modalities`、`input_modalities`、`supported_parameters` 及布尔类型 `capabilities`；只保留受控枚举，不把接口返回的任意内容作为图标路径。

精确型号回退（不按“flash”“pro”等词猜能力）：

- GLM-4.6V-Flash：https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash
- Gemini 2.5 Flash：https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash

能力表示模型资料中支持对应输入或工具，不代表当前接口协议、账号权限或应用已适配所有功能。尤其音频理解与音频转写接口不同。未知能力不标注；服务商返回明确不支持时覆盖回退资料。

2026-11-03 补充 BAAI、ByteDance、Hunyuan、InternLM、StepFun、Kimi、MiniMax、Baichuan、Yi、SenseNova、Jina、Cohere、FishAudio、Flux、Stability、Microsoft、NVIDIA、IBM 厂商素材，均取自同一 LobeHub MIT 图标库；未知厂商通用图标改为本项目绘制的问号。

## 无能力字段时的精确型号回退

规范化完整组织路径和 Pro 前缀，仅匹配已核对的型号或已发布的型号系列，不根据任意模型名中的“pro”“vision”等单词猜测。

- https://huggingface.co/BAAI/bge-reranker-v2-m3
- https://huggingface.co/BAAI/bge-m3
- https://huggingface.co/Qwen/Qwen2.5-7B-Instruct
- https://huggingface.co/Qwen/Qwen3-8B
- https://huggingface.co/deepseek-ai/DeepSeek-R1
- https://huggingface.co/deepseek-ai/DeepSeek-V3
- https://huggingface.co/deepseek-ai/DeepSeek-V3.1-Terminus

文字输入、向量检索和重排使用不同标记，不将 embedding/reranker 当作食物识别或对话模型。型号回退不替代实际接口能力验证。
