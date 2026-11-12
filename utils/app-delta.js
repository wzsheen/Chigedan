const PLUGIN_ID = 'chigedan-apk-delta';
const SHA256 = /^[a-f0-9]{64}$/;

function normalize(raw) {
    if (!raw || raw.format !== 'apk-copy-gzip-v1' || typeof raw.url !== 'string' ||
        !/^https:\/\/[^\s]+$/i.test(raw.url) ||
        ![raw.baseSha256, raw.targetSha256, raw.patchSha256].every(x => typeof x === 'string' && SHA256.test(x))) return null;
    return {format: raw.format, url: raw.url, baseSha256: raw.baseSha256,
        targetSha256: raw.targetSha256, patchSha256: raw.patchSha256};
}

function apply(bridge, delta, done) {
    if (!delta || !bridge || typeof bridge.loadNativePlugin !== 'function') return false;
    let pending = true;
    const finish = path => {
        if (!pending) return;
        pending = false;
        clearTimeout(timer);
        done(path);
    };
    const timer = setTimeout(() => finish(''), 600000);
    try {
        bridge.loadNativePlugin({
            pluginId: PLUGIN_ID,
            success(plugin) {
                if (!pending) return;
                try {
                    plugin.applyApkDelta(delta, result => finish(result && result.ok && result.filePath || ''));
                } catch (_) { finish(''); }
            },
            fail() { finish(''); },
        });
    } catch (_) { finish(''); }
    return true;
}

module.exports = {normalize, apply};
