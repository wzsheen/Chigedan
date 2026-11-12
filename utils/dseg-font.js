// DSEG7 七段数码管字体（Bold 字重）：只保留 0-9 与 , . - 空格，woff2 子集 756 字节。
// 内嵌 base64 而不走网络，是为了不受 downloadFile 域名白名单限制、也不依赖网络。
// 微信官方对 base64 字体推荐用 wx.loadFontFace（WXSS 里的 @font-face 在部分安卓机不生效）。
const DSEG7_FAMILY = 'DSEG7';

const DSEG7_BASE64 =
    'd09GMgABAAAAAAL0AAsAAAAACUQAAAKoAAB1wgAAAAAAAAAAAAAAAAAAAAAAAAAABmAARBEICopA' +
    'hxwBNgIkAyYLHgAEIAWDOAcgG78GAJ6DcbMcx0HlEioNyqJ+tiyL4Pt7/T33VQoFK2DVjMfCFQMW' +
    'kHCUqjUOlf/F3w/r3nfn2X/SzUISFBcKmcj00+D28z8coIUHqavP/zX57lYYxZE8kYlPLKIAK0D+' +
    '30XZ/3ZvIrNpJY5Ho42l1I1hUgeMuFe3/wa1Up7JoctQoFOLbea4Pz5GgQIkdAZPcLi42Lkkw5QB' +
    'i4yN5R3FJY0jQg3sCci6bRjENuD07TUaOj3AsGiIXpf+QrtFTMZCQChA640dYApiCxA3QA4AAUFC' +
    'EQg4AglHIUtBiiK7sE6SQlDxmZidgEXHn14W4M8bGHRZNdQ317IwMFI9OrjYOt8fJ8qNaYeg0VoY' +
    'j1gAWqnNpxnMmyLBg2qEYnGaKLd4IFahwasVxlc0H/UHE0VJjChGHOmRpmSD44sTGrwMe5GJoMez' +
    'oIHG9kabBr0XDtJluKs77A1ej0Pv72E2lxzkVEhWcAbth2EqGVtOvEZHy0cLv05YGt/J5192ryev' +
    '0dGh0w1GluOrNqM7BSXo+D9zgqAycUeodV9+HI2LHohEX2peTJaopcg2G4XybXIcnwTQ9Dump+Gn' +
    'kmf6HDh+j6zyp6UB3/7T9qeLf97hOAHrH5oHY8NL4zoBePe8bHEk3TO2kD4B/iBJfYQOBUGdLiIb' +
    'FO2DbAhLNGzfpBQASbrAFuY6WxgUJtRblUgYJOcCcGDsRkircaNoY25MtDk3TiXATZAMlVeTlMIa' +
    'nBRKkaBYimQsiSqweElRJF2GLAlycSuToVg6Fld5chXbrUJp1Z/FEEO/rSFdsbbns6SXS8VrU/9x' +
    'RpFUjFwpimni5iyICzdmWJxkS1CkSIYkjvJkS446ryWWl4KuRNHjBkzoMuqNhvTZ87uhUhSuhHNZ' +
    'xqKPYcz0YHZVMCpUkzEA';

const DSEG7_SOURCE = 'url("data:font/woff2;base64,' + DSEG7_BASE64 + '")';

let loaded = null;

// 返回 Promise，方便页面在字体就绪后再显示数字（避免先系统字体再跳变）。
function load() {
    if (loaded) {
        return loaded;
    }
    if (typeof wx === 'undefined' || typeof wx.loadFontFace !== 'function') {
        loaded = Promise.resolve(false);
        return loaded;
    }
    loaded = new Promise(resolve => {
        wx.loadFontFace({
            family: DSEG7_FAMILY,
            source: DSEG7_SOURCE,
            scopes: ['webview', 'native'],
            global: true,
            success() {
                resolve(true);
            },
            fail(error) {
                // 加载失败只是回退到系统数字字体，不影响任何功能
                console.warn('[font] DSEG7 加载失败，回退系统字体', error);
                resolve(false);
            },
        });
    });
    return loaded;
}

module.exports = {
    DSEG7_FAMILY,
    DSEG7_SOURCE,
    load,
};
