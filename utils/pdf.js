// 极简 PDF 生成：把一张 JPEG 铺满单页 A4。
// 小程序里没有 PDF 库，这里直接按 PDF 1.4 结构拼字节流：
// 中文字体不嵌入（体积大且授权复杂），所以文字先画成图片再内嵌，
// 既避免字体问题，也保证任何阅读器里排版一致。

function strToBytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
        bytes[i] = text.charCodeAt(i) & 0xff;
    }
    return bytes;
}

function pad10(value) {
    const text = String(value);
    return '0000000000'.slice(text.length) + text;
}

function toBytes(input) {
    if (input instanceof Uint8Array) {
        return input;
    }
    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }
    if (input && input.buffer instanceof ArrayBuffer) {
        return new Uint8Array(input.buffer);
    }
    throw new Error('图片数据无效');
}

/**
 * @param {Uint8Array|ArrayBuffer} jpegData  canvas 导出的 JPEG
 * @param {Object} options  { pageWidth, pageHeight, imageWidth, imageHeight }
 * @returns {ArrayBuffer} 可直接写入 .pdf 文件的二进制内容
 */
function buildPdf(jpegData, options) {
    const opts = options || {};
    const pageWidth = Number(opts.pageWidth) > 0 ? Math.round(opts.pageWidth) : 595;
    const pageHeight = Number(opts.pageHeight) > 0 ? Math.round(opts.pageHeight) : 842;
    const imageWidth = Number(opts.imageWidth) > 0 ? Math.round(opts.imageWidth) : 1085;
    const imageHeight = Number(opts.imageHeight) > 0 ? Math.round(opts.imageHeight) : 1535;

    const image = toBytes(jpegData);
    if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8) {
        throw new Error('需要 JPEG 图片数据');
    }

    const chunks = [];
    const offsets = [];
    let size = 0;

    function push(bytes) {
        chunks.push(bytes);
        size += bytes.length;
    }

    function pushText(text) {
        push(strToBytes(text));
    }

    // 头部 + 二进制标记注释（让阅读器按二进制打开）
    pushText('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');

    offsets[1] = size;
    pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    offsets[2] = size;
    pushText('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    offsets[3] = size;
    pushText('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight + ']'
        + ' /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n');

    // 图片铺满整页：把 1x1 的用户空间放大到页面大小
    const content = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Im0 Do\nQ';
    offsets[4] = size;
    pushText('4 0 obj\n<< /Length ' + (content.length + 1) + ' >>\nstream\n' + content + '\nendstream\nendobj\n');

    offsets[5] = size;
    pushText('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + imageWidth + ' /Height ' + imageHeight
        + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + (image.length + 1) + ' >>\nstream\n');
    push(image);
    pushText('\nendstream\nendobj\n');

    const xrefStart = size;
    let xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i += 1) {
        xref += pad10(offsets[i]) + ' 00000 n \n';
    }
    pushText(xref);
    pushText('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n');

    const output = new Uint8Array(size);
    let cursor = 0;
    for (let i = 0; i < chunks.length; i += 1) {
        output.set(chunks[i], cursor);
        cursor += chunks[i].length;
    }
    return output.buffer;
}

module.exports = {
    buildPdf,
    strToBytes,
};
