// 把 App 内的隐私说明导出成一份独立 HTML（给 GitHub Pages 用）。
//
// 为什么用脚本生成而不是手写：隐私弹窗里的链接指向这份网页，而 App 内还有 pages/privacy。
// 两处文案一旦漂移，就是「网页说的和 App 里说的不一样」——比没有链接更容易被审核挑。
// 所以唯一数据源是 utils/privacy-content.js，改完那里跑一次本脚本即可。
//
// 用法：
//   node scripts/build-privacy-page.js
//   node scripts/build-privacy-page.js --url https://wzsheen.github.io/privacy/
// 产物：scripts/privacy-page/index.html（单文件、无外链资源、手机可读）
const fs = require('node:fs');
const path = require('node:path');
const { UPDATED, CONTACT, SECTIONS } = require('../utils/privacy-content');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'scripts', 'privacy-page');
const OUT_FILE = path.join(OUT_DIR, 'index.html');
const APP_NAME = '吃个蛋';

function arg(name) {
    const index = process.argv.indexOf(name);
    return index > -1 ? String(process.argv[index + 1] || '').trim() : '';
}

function esc(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 正文里出现的邮箱要能点，否则手机上只能干看着
function linkify(text) {
    return esc(text).replace(
        /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
        '<a href="mailto:$1">$1</a>'
    );
}

const STYLE = `
:root{--bg:#fffbef;--ink:#3f3328;--muted:#8a765c;--head:#5e4520;--line:#eadfc6;--accent:#a76b11}
@media (prefers-color-scheme:dark){:root{--bg:#171410;--ink:#e6ded0;--muted:#a89a85;--head:#f0d9a8;--line:#382f25;--accent:#e0a94f}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.78 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;-webkit-text-size-adjust:100%}
main{max-width:720px;margin:0 auto;padding:36px 20px 64px}
h1{font-size:24px;line-height:1.4;margin:0 0 10px;color:var(--head);font-weight:600}
h2{font-size:17px;line-height:1.5;margin:0 0 12px;color:var(--head);font-weight:600}
p{margin:0 0 12px}
.meta{color:var(--muted);font-size:14px;margin:0}
.summary{margin:22px 0 6px;padding:10px 0 10px 14px;border-left:3px solid var(--accent);color:var(--muted);font-size:15px}
section{padding:26px 0 4px;border-top:1px solid var(--line)}
footer{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
.wrap{padding-bottom:8px}
`;

function buildSections() {
    return SECTIONS.map(section => {
        const paragraphs = section.paragraphs
            .filter(text => String(text || '').trim() !== '')
            .map(text => '        <p>' + linkify(text) + '</p>')
            .join('\n');
        return '    <section>\n        <h2>' + esc(section.title) + '</h2>\n' + paragraphs + '\n    </section>';
    }).join('\n');
}

function build() {
    const url = arg('--url');
    const canonical = url ? '\n<link rel="canonical" href="' + esc(url) + '">' : '';
    const contact = CONTACT && CONTACT.email
        ? '<p>开发维护者：' + esc(CONTACT.name || '开发者') + ' · <a href="mailto:' + esc(CONTACT.email) + '">' + esc(CONTACT.email) + '</a></p>'
        : '';

    const html = [
        '<!doctype html>',
        '<html lang="zh-CN">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="color-scheme" content="light dark">',
        '<title>隐私保护说明 · ' + APP_NAME + '</title>',
        '<meta name="description" content="' + APP_NAME + ' 的隐私保护说明：记录留在本机，AI 服务由你选择。">',
        '<meta name="robots" content="index,follow">' + canonical,
        '<style>' + STYLE + '</style>',
        '</head>',
        '<body>',
        '<main class="wrap">',
        '    <header>',
        '        <h1>隐私保护说明</h1>',
        '        <p class="meta">更新及生效日期：' + esc(UPDATED) + '</p>',
        '    </header>',
        '    <p class="summary">记录留在本机，AI 服务由你选择。使用前，请了解信息的用途和去向。</p>',
        buildSections(),
        '    <footer>',
        '        <p>本页内容与 ' + APP_NAME + ' App 内「关于与隐私 → 隐私保护说明」一致。</p>',
        '        ' + contact,
        '        <p>如对本说明有疑问，可通过上方邮箱联系开发者。</p>',
        '    </footer>',
        '</main>',
        '</body>',
        '</html>',
        '',
    ].join('\n');

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, html, 'utf8');
    return { url: url, html: html };
}

const result = build();
const paragraphCount = SECTIONS.reduce((sum, section) => sum + section.paragraphs.filter(text => String(text || '').trim() !== '').length, 0);
const weight = (Buffer.byteLength(result.html, 'utf8') / 1024).toFixed(1);

console.log('已生成：' + path.relative(ROOT, OUT_FILE) + '（' + SECTIONS.length + ' 节 / ' + paragraphCount + ' 段 / ' + weight + ' KB / 无外链资源）');
console.log('更新日期：' + UPDATED);
if (result.url) {
    console.log('canonical：' + result.url);
} else {
    console.log('未指定 --url：不写 canonical。部署好之后可以用 --url 重新生成一次。');
}
console.log('');
console.log('部署到 GitHub Pages：');
console.log('  1. 新建一个 public 仓库（免费版 Pages 不支持私有仓库）');
console.log('  2. 把 scripts/privacy-page/index.html 传到仓库根目录，改名为 index.html');
console.log('  3. Settings → Pages → Source 选 Deploy from a branch → main / (root) → Save');
console.log('  4. 一两分钟后访问 https://<用户名>.github.io/<仓库名>/');
console.log('');
console.log('接进隐私弹窗：把 miniapp-privacy.json 的 message 里');
console.log('  「完整说明可在「关于与隐私」中查看。」改成「完整说明见__a__。」，并加：');
console.log(JSON.stringify({
    messageLinks: {
        a: { text: '《隐私保护说明》', url: result.url || 'https://<用户名>.github.io/<仓库名>/', showExternal: true },
    },
}, null, 2));
