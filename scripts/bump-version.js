// 发版时一次性改两处版本号，避免「APK 是 0.0.2、App 里还显示 0.0.1、更新检查永远提示有新版本」。
// 用法：node scripts/bump-version.js 0.0.2 stable（渠道为 development、stable 或 beta）
// 改动：project.miniapp.json 的 version 与 versionCode（+1）、utils/app-update.js 的 LOCAL_VERSION
// 只改文件，不构建、不打包、不推 tag。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'project.miniapp.json');
const UPDATE_FILE = path.join(ROOT, 'utils', 'app-update.js');

function readArg() {
    const raw = String(process.argv[2] || '').trim();
    const match = raw.match(/^v?(\d+(?:\.\d+){1,2})$/);
    return match ? match[1] : '';
}

function main() {
    const version = readArg();
    const channel = String(process.argv[3] || '').toLowerCase();
    if (!version || !['development', 'stable', 'beta'].includes(channel)) {
        console.error('用法：node scripts/bump-version.js 0.0.2 development|stable|beta');
        process.exit(1);
    }

    const source = fs.readFileSync(UPDATE_FILE, 'utf8');
    const pattern = /const LOCAL_VERSION = '[^']*';/;
    const channelPattern = /const BUILD_CHANNEL = '[^']*';/;
    if (!pattern.test(source) || !channelPattern.test(source)) {
        console.error('utils/app-update.js 缺少版本或渠道配置，未改动');
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    const previous = String(config.version || '');
    const previousCode = Number(config.versionCode) || 0;
    config.version = version;
    config.versionCode = previousCode + 1;
    fs.writeFileSync(VERSION_FILE, JSON.stringify(config, null, 4) + '\n');

    fs.writeFileSync(UPDATE_FILE, source.replace(pattern, "const LOCAL_VERSION = '" + version + "';").replace(channelPattern, "const BUILD_CHANNEL = '" + channel + "';"));

    console.log('版本：' + (previous || '?') + ' → ' + version + '（versionCode ' + previousCode + ' → ' + config.versionCode + '）');
    console.log('记得同步改 GitHub Release 的 tag（v' + version + '），否则更新检查会一直提示有新版本。');
}

main();
