const {withTheme}=require('../../utils/theme');
const { createRecordStore, formatDate } = require('../../utils/record-store.js');
const { createWeightStore } = require('../../utils/body-store.js');
const settings = require('../../utils/settings.js');
const healthRecord = require('../../utils/health-record.js');
const archiveCanvas = require('../../utils/archive-canvas.js');
const pdf = require('../../utils/pdf.js');

const store = createRecordStore({ storageKey: 'cal_records' });
const weightStore = createWeightStore({ storageKey: 'cal_weight' });

// 画布按 A4 比例（1085 × 1535 ≈ 595 × 842 pt 的 1.82 倍）
const CANVAS_W = archiveCanvas.DESIGN_WIDTH;
const CANVAS_H = archiveCanvas.DESIGN_HEIGHT;
const PDF_W = 595;
const PDF_H = 842;

const SERIAL_KEY = 'cal_health_serial';
const SINCE_KEY = 'cal_health_since';

function pad2(value) {
    return value < 10 ? '0' + value : String(value);
}

// 档案编号只生成一次：号码固定，才算「一份档案」
function ensureArchive() {
    let serial = '';
    let since = '';
    try {
        serial = wx.getStorageSync(SERIAL_KEY) || '';
        since = wx.getStorageSync(SINCE_KEY) || '';
    } catch (err) {
        serial = '';
        since = '';
    }

    if (!/^HR-\d{6}-\d{4}$/.test(serial)) {
        const now = new Date();
        const stamp = String(now.getFullYear()).slice(2) + pad2(now.getMonth() + 1) + pad2(now.getDate());
        serial = 'HR-' + stamp + '-' + String(1000 + Math.floor(Math.random() * 9000));
        try {
            wx.setStorageSync(SERIAL_KEY, serial);
        } catch (err) {
            // 存不进去也不影响展示，本次用临时编号
        }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
        since = formatDate(new Date());
        try {
            wx.setStorageSync(SINCE_KEY, since);
        } catch (err) {
            // 同上
        }
    }

    return { serial: serial, since: since };
}

function createOffscreen() {
    if (typeof wx.createOffscreenCanvas !== 'function') {
        return null;
    }
    try {
        const canvas = wx.createOffscreenCanvas({ type: '2d', width: CANVAS_W, height: CANVAS_H });
        if (!canvas || typeof canvas.getContext !== 'function') {
            return null;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }
        return { canvas: canvas, ctx: ctx };
    } catch (err) {
        return null;
    }
}

function canvasToFile(canvas, page) {
    return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: CANVAS_W,
            height: CANVAS_H,
            destWidth: CANVAS_W,
            destHeight: CANVAS_H,
            fileType: 'jpg',
            quality: 0.92,
            success(res) {
                resolve(res.tempFilePath);
            },
            fail(err) {
                reject(err);
            },
        }, page);
    });
}

Page(withTheme({
    data: {
        record: null,
        exporting: false,
        exportHint: '',
        showFallback: false,
        fallbackText: '',
    },

    onShow() {
        this.refresh();
    },

    refresh() {
        const archive = ensureArchive();
        return Promise.all([store.list(), weightStore.list()]).then(([recordRes, weightRes]) => {
            const records = recordRes.error || !Array.isArray(recordRes.data) ? [] : recordRes.data;
            const weights = weightRes.error || !Array.isArray(weightRes.data) ? [] : weightRes.data;

            const record = healthRecord.buildHealthRecord({
                profile: settings.getProfile(),
                goal: settings.getGoal(),
                macroTargets: settings.getMacroTargets(),
                waterGoal: settings.getWaterGoal(),
                records: records,
                weights: weights,
                nickname: settings.getNickname(),
                serial: archive.serial,
                issuedText: archive.since,
                now: new Date(),
            });

            this.setData({ record: record });
        });
    },

    renderCanvas() {
        const that = this;
        return new Promise((resolve, reject) => {
            function paint(ctx) {
                ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
                archiveCanvas.drawArchive(ctx, that.data.record, { width: CANVAS_W });
            }

            const offscreen = createOffscreen();
            if (offscreen !== null) {
                try {
                    paint(offscreen.ctx);
                    resolve({ canvas: offscreen.canvas });
                    return;
                } catch (err) {
                    // 离屏画布画不动就退回到页面上的隐藏画布
                }
            }

            wx.createSelectorQuery()
                .select('#archiveCanvas')
                .fields({ node: true, size: true })
                .exec(res => {
                    const item = res && res[0];
                    if (!item || !item.node || typeof item.node.getContext !== 'function') {
                        reject(new Error('找不到绘图画布'));
                        return;
                    }
                    const canvas = item.node;
                    canvas.width = CANVAS_W;
                    canvas.height = CANVAS_H;
                    const ctx = canvas.getContext('2d');
                    paint(ctx);
                    resolve({ canvas: canvas });
                });
        });
    },

    handleExport() {
        if (this.data.exporting || this.data.record === null) {
            return;
        }
        const that = this;
        this.setData({ exporting: true, exportHint: '正在生成 PDF…', showFallback: false, fallbackText: '' });

        this.renderCanvas()
            .then(info => canvasToFile(info.canvas, that))
            .then(tempPath => {
                const fs = wx.getFileSystemManager();
                const raw = fs.readFileSync(tempPath);
                const buffer = pdf.buildPdf(new Uint8Array(raw), {
                    pageWidth: PDF_W,
                    pageHeight: PDF_H,
                    imageWidth: CANVAS_W,
                    imageHeight: CANVAS_H,
                });
                const filePath = wx.env.USER_DATA_PATH + '/health-record-' + Date.now() + '.pdf';
                fs.writeFileSync(filePath, buffer);
                return filePath;
            })
            .then(filePath => {
                that.setData({ exporting: false, exportHint: 'PDF 已生成，可在预览右上角转发或另存' });
                wx.openDocument({
                    filePath: filePath,
                    fileType: 'pdf',
                    showMenu: true,
                    fail() {
                        that.fallbackCopy('PDF 已生成，但当前环境打不开预览');
                    },
                });
            })
            .catch(() => {
                that.setData({ exporting: false });
                that.fallbackCopy('当前环境生成不了 PDF');
            });
    },

    // 兜底：PDF 出不来时把档案文本交到剪贴板，不让人空手而归
    fallbackCopy(reason) {
        const text = this.data.record !== null ? this.data.record.text : '';
        const that = this;
        wx.setClipboardData({
            data: text,
            success() {
                that.setData({ exportHint: reason + '，档案文本已复制到剪贴板', showFallback: false });
            },
            fail() {
                that.setData({
                    exportHint: reason + '，可长按下方文本手动复制',
                    showFallback: true,
                    fallbackText: text,
                });
            },
        });
    },
}));
