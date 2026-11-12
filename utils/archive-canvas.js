// 健康档案的「纸面」：把档案数据画成一张 A4 比例的图，导出 PDF 时整张内嵌。
// 页面与 PDF 用同一份数据，画布只负责排版，不做计算。

const DESIGN_WIDTH = 1085;
const DESIGN_HEIGHT = 1535;
const PAD = 88;

const FONT_FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';

const COLOR = {
    ink: '#1f2329',
    sub: '#646a73',
    faint: '#8a8f99',
    line: '#eceef1',
    rowLine: '#f2f3f5',
    brand: '#dca52a',
    brandDeep: '#d9531e',
    brandSoft: '#fdf0e8',
    brandLabel: '#b2663a',
};

function font(size, weight) {
    return (weight ? weight + ' ' : '') + size + 'px ' + FONT_FAMILY;
}

function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// 逐字折行：canvas 没有自动换行，中文按字切最稳
function wrapText(ctx, text, maxWidth) {
    const lines = [];
    let current = '';
    for (let i = 0; i < text.length; i += 1) {
        const next = current + text.charAt(i);
        if (current !== '' && ctx.measureText(next).width > maxWidth) {
            lines.push(current);
            current = text.charAt(i);
        } else {
            current = next;
        }
    }
    if (current !== '') {
        lines.push(current);
    }
    return lines;
}

function drawArchive(ctx, record, options) {
    if (!record) {
        return;
    }
    const opts = options || {};
    const width = Number(opts.width) > 0 ? Number(opts.width) : DESIGN_WIDTH;
    const scale = width / DESIGN_WIDTH;

    ctx.save();
    ctx.scale(scale, scale);
    ctx.textBaseline = 'alphabetic';

    // 纸面
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // 顶部品牌色条
    const topGradient = ctx.createLinearGradient(0, 0, DESIGN_WIDTH, 0);
    topGradient.addColorStop(0, '#ffa06f');
    topGradient.addColorStop(1, '#dca52a');
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, DESIGN_WIDTH, 12);

    // 标题
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.ink;
    ctx.font = font(60, '600');
    ctx.fillText('个人健康档案', PAD, 132);

    ctx.fillStyle = COLOR.faint;
    ctx.font = font(24);
    ctx.fillText('PERSONAL HEALTH RECORD · 只读档案', PAD, 176);

    // 右上角编号与时间
    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR.sub;
    ctx.font = font(24);
    ctx.fillText('档案编号 ' + record.serial, DESIGN_WIDTH - PAD, 120);
    ctx.fillStyle = COLOR.faint;
    ctx.font = font(22);
    ctx.fillText('生成时间 ' + record.generatedText, DESIGN_WIDTH - PAD, 158);

    ctx.fillStyle = COLOR.line;
    ctx.fillRect(PAD, 210, DESIGN_WIDTH - PAD * 2, 2);

    // 姓名与一行概览
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.ink;
    ctx.font = font(46, '600');
    ctx.fillText(record.name, PAD, 272);

    ctx.fillStyle = COLOR.sub;
    ctx.font = font(26);
    ctx.fillText(record.headline, PAD, 316);

    // BMI 卡
    const cardX = PAD;
    const cardY = 346;
    const cardW = DESIGN_WIDTH - PAD * 2;
    const cardH = 148;
    roundRect(ctx, cardX, cardY, cardW, cardH, 26);
    ctx.fillStyle = COLOR.brandSoft;
    ctx.fill();

    ctx.fillStyle = COLOR.brandLabel;
    ctx.font = font(22);
    ctx.fillText('BMI · 身体质量指数', cardX + 38, cardY + 44);

    ctx.fillStyle = COLOR.brandDeep;
    ctx.font = font(72, '600');
    ctx.fillText(record.bmiText, cardX + 38, cardY + 116);
    const bmiWidth = ctx.measureText(record.bmiText).width;

    // 分级标签
    ctx.font = font(22, '600');
    const levelWidth = ctx.measureText(record.bmiLevel).width;
    const badgeX = cardX + 38 + bmiWidth + 22;
    const badgeY = cardY + 62;
    roundRect(ctx, badgeX, badgeY, levelWidth + 34, 40, 20);
    ctx.fillStyle = 'rgba(255, 107, 53, 0.14)';
    ctx.fill();
    ctx.fillStyle = COLOR.brandDeep;
    ctx.fillText(record.bmiLevel, badgeX + 17, badgeY + 27);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#8a7166';
    ctx.font = font(23);
    ctx.fillText('体重 ' + record.latestWeightText, DESIGN_WIDTH - PAD - 38, cardY + 60);
    ctx.fillText('身高 ' + record.heightText, DESIGN_WIDTH - PAD - 38, cardY + 98);

    // 分区内容
    let y = 522;
    const sections = Array.isArray(record.sections) ? record.sections : [];
    for (let i = 0; i < sections.length; i += 1) {
        const section = sections[i];
        if (i > 0) {
            y += 20;
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#b0b5bd';
        ctx.font = font(23, '600');
        ctx.fillText(section.title, PAD, y + 11);
        y += 30;

        const rows = Array.isArray(section.rows) ? section.rows : [];
        for (let j = 0; j < rows.length; j += 1) {
            const row = rows[j];
            const centerY = y + 19;

            ctx.textAlign = 'left';
            ctx.fillStyle = COLOR.faint;
            ctx.font = font(25);
            ctx.fillText(row.label, PAD, centerY);

            ctx.textAlign = 'right';
            ctx.fillStyle = COLOR.ink;
            ctx.font = font(26, '600');
            ctx.fillText(row.value, DESIGN_WIDTH - PAD, centerY);

            ctx.fillStyle = COLOR.rowLine;
            ctx.fillRect(PAD, centerY + 19, DESIGN_WIDTH - PAD * 2, 1.5);

            y += 38;
        }
    }
    ctx.textBaseline = 'alphabetic';

    // 声明
    ctx.fillStyle = COLOR.line;
    ctx.fillRect(PAD, 1384, DESIGN_WIDTH - PAD * 2, 2);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a6abb3';
    ctx.font = font(21);
    const noteText = (Array.isArray(record.note) ? record.note : []).join('  ');
    const noteLines = wrapText(ctx, noteText, DESIGN_WIDTH - PAD * 2);
    let noteY = 1414;
    for (let i = 0; i < noteLines.length && i < 4; i += 1) {
        ctx.fillText(noteLines[i], PAD, noteY);
        noteY += 30;
    }

    // 底部标识
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c9ced6';
    ctx.font = font(20);
    ctx.fillText('吃个蛋', DESIGN_WIDTH - PAD, 1500);

    ctx.restore();
}

module.exports = {
    drawArchive,
    DESIGN_WIDTH,
    DESIGN_HEIGHT,
};
