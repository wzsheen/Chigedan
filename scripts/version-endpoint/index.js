// 版本接口（方案 B 的服务端）：
// 小程序只请求这个地址，由它带着 token 去读私有仓库的 GitHub Release，返回一份精简 JSON。
// 为什么必须服务端做：私有仓库的 Release 需要 token；token 放进小程序包等于公开，
// 而且 api.github.com 无法通过小程序的 request 合法域名归属校验。
//
// 运行：GITHUB_TOKEN=xxx node scripts/version-endpoint/index.js
// 也可直接复用 buildVersionPayload() 放进云函数 / Serverless 函数里。
const https = require('node:https');
const http = require('node:http');

const GITHUB_REPO = process.env.GITHUB_REPO || 'wzsheen/calorie-tracker';
const CACHE_TTL = 5 * 60 * 1000;
const CACHE = { at: 0, payload: null };

function githubGet(pathname, retries) {
    return new Promise((resolve, reject) => {
        const headers = {
            'user-agent': 'calorie-tracker-version-endpoint',
            accept: 'application/vnd.github+json',
        };
        if (process.env.GITHUB_TOKEN) {
            headers.authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
        }
        const request = https.request(
            { hostname: 'api.github.com', path: pathname, method: 'GET', headers: headers, timeout: 8000 },
            response => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { body += chunk; });
                response.on('end', () => {
                    const code = response.statusCode || 0;
                    if (code === 404) {
                        return reject(new Error('没有找到 Release（私有仓库请确认 token 有 repo 读权限）'));
                    }
                    if (code === 403 || code === 429) {
                        return reject(new Error('GitHub 限流或权限不足（' + code + '）'));
                    }
                    if (code < 200 || code >= 300) {
                        return reject(new Error('GitHub 返回 ' + code));
                    }
                    try {
                        resolve(JSON.parse(body));
                    } catch (error) {
                        reject(new Error('GitHub 返回的不是合法 JSON'));
                    }
                });
            }
        );
        request.on('timeout', () => request.destroy(new Error('GitHub 请求超时')));
        request.on('error', error => {
            // 只重试一次网络类失败，避免把 5xx 放大成连环请求
            if (retries > 0 && !/超时/.test(error.message)) {
                return resolve(githubGet(pathname, retries - 1));
            }
            reject(error);
        });
        request.end();
    });
}

function pickAsset(assets) {
    const list = Array.isArray(assets) ? assets : [];
    // 这个 App 分发的是 APK，优先挑安装包；没有的话退回第一个附件
    const chosen = list.find(asset => asset && /\.apk$/i.test(String(asset.name || '')))
        || list.find(asset => asset && /\.(ipa|zip|dmg|exe)$/i.test(String(asset.name || '')))
        || list[0];
    if (!chosen) {
        return { url: '', name: '', size: 0 };
    }
    return {
        url: chosen.browser_download_url ? String(chosen.browser_download_url) : '',
        name: chosen.name ? String(chosen.name) : '',
        size: Number(chosen.size) || 0,
    };
}

async function buildVersionPayload() {
    if (CACHE.payload && Date.now() - CACHE.at < CACHE_TTL) {
        return CACHE.payload;
    }
    const release = await githubGet('/repos/' + GITHUB_REPO + '/releases/latest', 1);
    const asset = pickAsset(release.assets);
    const payload = {
        version: String(release.tag_name || '').replace(/^v/i, ''),
        publishedAt: release.published_at || '',
        notes: release.body || '',
        releaseUrl: release.html_url || '',
        downloadUrl: asset.url,
        assetName: asset.name,
        assetSize: asset.size,
    };
    CACHE.at = Date.now();
    CACHE.payload = payload;
    return payload;
}

async function handler(req, res) {
    if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'method not allowed' }));
    }
    try {
        const payload = await buildVersionPayload();
        res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=300',
        });
        res.end(JSON.stringify(payload));
    } catch (error) {
        // 不把 token、内部路径等细节回给客户端
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '版本信息暂时取不到' }));
        console.error('[version-endpoint]', error.message);
    }
}

if (require.main === module) {
    const port = Number(process.env.PORT) || 8787;
    http.createServer(handler).listen(port, () => {
        console.log('version endpoint: http://127.0.0.1:' + port + '/version  (repo=' + GITHUB_REPO + ')');
        if (!process.env.GITHUB_TOKEN) {
            console.warn('未设置 GITHUB_TOKEN：私有仓库会返回 404');
        }
    });
}

module.exports = { buildVersionPayload, handler, pickAsset, GITHUB_REPO };
