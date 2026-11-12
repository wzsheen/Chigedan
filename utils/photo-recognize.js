// 拍照记的识别层：把「图片 → 食物 + 热量 + 营养」抽象成一个可插拔的 Provider。
// 优先使用显式 Provider；否则读取用户已启动的视觉配置进行识别。
// 未启动时保留完整可编辑表单。也可通过 setProvider 注入自有后端：
//
//   const recognizer = require('../../utils/photo-recognize.js');
//   recognizer.setProvider(async (filePath) => ({
//       ok: true,
//       source: 'ai',
//       item: { name: '宫保鸡丁', unit: '份', qty: 1, kcal: 320, protein: 24, carb: 18, fat: 15 },
//   }));
//
// 约定：item 字段允许缺省，页面会把缺省的留给用户填。

let provider = null;

function setProvider(fn) {
    provider = typeof fn === 'function' ? fn : null;
}

// 识别一张食物照片。永不 reject：失败也返回结构化结果，页面好接。
function recognize(filePath) {
    if (typeof filePath !== 'string' || filePath === '') {
        return Promise.resolve({ ok: false, error: '没有照片', item: null, source: 'none' });
    }
    if (provider !== null) {
        return Promise.resolve()
            .then(() => provider(filePath))
            .then(result => {
                if (!result || typeof result !== 'object') {
                    return { ok: false, error: '识别服务返回异常', item: null, source: 'unknown' };
                }
                return Object.assign({ ok: !!result.ok, item: result.item || null, items:result.items, source: result.source || 'ai' },
                    result.ok ? {} : { error: result.error || '识别失败' });
            })
            .catch(() => ({ ok: false, error: '识别服务调用失败', item: null, source: 'ai' }));
    }
    const settings = require('./ai-settings');
    if (settings.isEnabled('vision')) return require('./ai-runtime').photo(filePath).catch(error=>({ok:false,source:'ai',item:null,error:error.message || '照片识别失败，请重试'}));
    // 未启用时保留手动填写。
    return Promise.resolve({ ok: true, item: null, source: 'unconfigured' });
}

module.exports = { recognize, setProvider };
