// 生成静态版本文件（方案：静态 JSON 托管，不需要服务器和 GitHub token）。
//
// 用法：
//   node scripts/publish-version.js --notes "修了什么|加了什么" --apk https://你的域名/calorie-app-0.0.2.apk --size 12.5
//   node scripts/publish-version.js -n "只改文案" -a https://cdn.x.com/app.apk --release-url https://...
//
// 版本号默认取 project.miniapp.json 的 version（先用 scripts/bump-version.js 改过再跑本脚本），
// 输出覆盖 scripts/version-endpoint/version.json，把它上传到静态托管即完成发版。
// 说明里的 | 会转成换行，也认字面量 \n —— App 端按换行展示更新说明。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'project.miniapp.json');
const UPDATE_FILE = path.join(ROOT, 'utils', 'app-update.js');
const OUTPUT_FILE = path.join(ROOT, 'scripts', 'version-endpoint', 'version.json');

const FLAGS = {
    '-n': 'notes', '--notes': 'notes',
    '-a': 'apk', '--apk': 'apk',
    '-f': 'apkFile', '--apk-file': 'apkFile',
    '-r': 'releaseUrl', '--release-url': 'releaseUrl',
    '-v': 'version', '--version': 'version',
    '-d': 'date', '--date': 'date',
    '-s': 'size', '--size': 'size',
    '-o': 'out', '--out': 'out',
};

function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '');
        const key = FLAGS[token];
        if (!key) {
            if (token === '-h' || token === '--help') {
                result.help = true;
                continue;
            }
            throw new Error('不认识的参数：' + token);
        }
        const value = argv[i + 1];
        if (value === undefined || String(value).startsWith('--')) {
            throw new Error('参数 ' + token + ' 后面缺少值');
        }
        result[key] = String(value);
        i += 1;
    }
    return result;
}

function readLocalVersion() {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return String(config.version || '');
}

function normalizeNotes(raw) {
    const text = String(raw === undefined ? '' : raw);
    // 命令行里敲不出换行，用 | 或 \n 代替
    return text.replace(/\\n/g, '\n').split('|').join('\n').trim();
}

function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(error.message + '\n用法见文件开头注释');
        process.exit(1);
    }
    if (args.help) {
        console.log('用法：node scripts/publish-version.js --notes "改了什么" --apk https://你的域名/app.apk');
        console.log('可选：--apk-file 本地APK路径（自动算体积）  --size 12.5（MB）  --version 0.0.2  --release-url https://...  --date 2026-11-04T10:00:00Z  --out 路径');
        return;
    }

    const localVersion = readLocalVersion();
    const version = String(args.version || localVersion).trim().replace(/^v/i, '');
    if (!/^\d+(\.\d+){0,2}$/.test(version)) {
        console.error('版本号不合法：' + version + '（只允许 1–3 段数字，如 0.0.2）');
        process.exit(1);
    }

    const apk = String(args.apk || '').trim();
    if (apk && !/^https:\/\//i.test(apk)) {
        console.error('下载地址必须是 HTTPS（HTTP 在 App 里取不到，系统也不允许装非 HTTPS 来源的包）');
        process.exit(1);
    }

    const notes = normalizeNotes(args.notes);
    const publishedAt = args.date ? new Date(args.date).toISOString() : new Date().toISOString();
    const out = args.out ? path.resolve(args.out) : OUTPUT_FILE;
    // --size 传 MB（12 或 12.5），App 里显示「安装包 12.5 MB」；不传就不显示体积
    let sizeMb = Number(args.size) || 0;
    // 更省事的写法：直接指本地产出的 APK，体积自动算，省得手填错
    if (args.apkFile) {
        try {
            const bytes = fs.statSync(path.resolve(args.apkFile)).size;
            if (bytes > 0) {
                sizeMb = bytes / 1024 / 1024;
            }
        } catch (error) {
            console.error('读不到安装包：' + args.apkFile);
            process.exit(1);
        }
    }
    const assetSize = sizeMb > 0 ? Math.round(sizeMb * 1024 * 1024) : 0;

    const payload = {
        version: version,
        publishedAt: publishedAt,
        notes: notes || '修了什么、加了什么',
        releaseUrl: String(args.releaseUrl || '').trim(),
        downloadUrl: apk,
        assetName: apk ? decodeURIComponent(apk.split('/').pop() || '') : '',
        assetSize: assetSize,
    };

    fs.writeFileSync(out, JSON.stringify(payload, null, 4) + '\n');

    const source = fs.readFileSync(UPDATE_FILE, 'utf8');
    const localInCode = (source.match(/const LOCAL_VERSION = '([^']*)'/) || [])[1] || '';

    console.log('已写入：' + path.relative(ROOT, out));
    console.log('  版本      ' + version + '（project.miniapp.json ' + (localVersion || '?') + ' / app-update.js ' + (localInCode || '?') + '）');
    console.log('  说明      ' + (notes ? notes.replace(/\n/g, ' / ') : '(空)'));
    console.log('  下载      ' + (apk || '(未填，App 里只显示说明、没有复制链接)'));
    if (sizeMb > 0) {
        console.log('  体积      ' + sizeMb.toFixed(1) + ' MB');
    }

    const warnings = [];
    if (!notes) {
        warnings.push('没写更新说明，App 里会显示占位文案');
    }
    if (!apk) {
        warnings.push('没填 --apk，用户看到「发现新版本」后没有可复制的下载链接');
    }
    if (version !== localInCode) {
        warnings.push('版本文件和 App 内 LOCAL_VERSION 不一致（' + version + ' vs ' + (localInCode || '空') + '）：发版前先 bump 并重新打包，否则会出现「一直提示更新」或「装在旧版上看不到新版」');
    }
    if (warnings.length) {
        console.log('');
        warnings.forEach(item => console.log('注意：' + item));
    }

    console.log('');
    console.log('下一步：');
    console.log('  1. 把 version.json 上传到静态托管，覆盖旧文件（域名要 HTTPS 且已备案）');
    console.log('  2. 确认能取到新内容：curl -s "https://你的域名/version.json?_t=$(date +%s)"');
    console.log('  3. 静态托管上给这个文件设 Cache-Control: no-cache（或 max-age=60），否则改了不生效');
}

main();
