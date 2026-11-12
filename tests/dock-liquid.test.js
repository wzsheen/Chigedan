const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const wxss = read('components/app-dock/app-dock.wxss');
const wxml = read('components/app-dock/app-dock.wxml');

function liquidSvg() {
    const line = wxss.split('\n').find(item => item.startsWith('.liquid-surface{background-image:url("data:image/svg+xml;base64,'));
    assert.ok(line, '液态形体应改用一张完整的 SVG 背景（含厚度与明暗），而不是单纯的渐变 + mask');
    const match = line.match(/base64,([^"]+)"/);
    assert.ok(match, 'data URI 要能取出 base64');
    return { line, svg: Buffer.from(match[1], 'base64').toString('utf8') };
}

test('液态形体用一张自带体积的 SVG，不再靠 mask 裁渐变', () => {
    const { line, svg } = liquidSvg();
    assert.equal((svg.match(/viewBox="0 0 284 408"/g) || []).length, 1, '画布必须是原来的 284×408，形状才和原来完全一致');
    assert.ok(!/mask-image/.test(line), '改成完整 SVG 后不能再留 mask，否则两层叠一起会把投影裁掉');
    assert.match(line, /background-size:100% 100%/, 'SVG 要铺满整个形体层');
    assert.match(line, /filter:drop-shadow\(/, '外投影交给 CSS，SVG 内部不画投影，避免被画布裁掉');
});

test('立体感由四层构成：侧壁厚度、受光、背光、下缘反光', () => {
    const { svg } = liquidSvg();
    assert.ok(svg.includes('translate(0,5)'), '要有一层向下偏移的同形状侧壁，这是厚度的来源');
    assert.match(svg, /fill="url\(#wall\)"/, '侧壁用独立的深色渐变');
    assert.match(svg, /fill="url\(#base\)"/, '主体保持糖果色渐变');
    assert.match(svg, /stroke="url\(#edge\)" stroke-width="1\.6"/, '受光侧要有一条细边高光');
    const ellipses = (svg.match(/<ellipse /g) || []).length;
    assert.equal(ellipses, 12, '三个胶囊各有受光 + 背光 + 镜面光 + 反光，共 12 个椭圆');
    assert.match(svg, /clipPath id="clip"/, '明暗和反光必须裁在形状里，不能溢出成脏边');
});

test('深色主题单独压投影，不让黄色投影发脏', () => {
    assert.match(wxss, /\.float-dark \.liquid-surface\{filter:drop-shadow\(/, '深色背景上要换更沉的投影');
});

test('文字与图标保持项目原本那套，不跟着设计稿改', () => {
    assert.match(wxml, /class="action action-photo"[^>]*><view class="camera"><\/view><text>拍照记<\/text>/, '拍照记仍是原来那个 CSS 相机图标');
    assert.match(wxml, /class="action action-manual"[^>]*><image class="pencil-icon" src="\/assets\/icons\/line-pencil\.png"/, '手动记仍用 line-pencil.png，不用设计稿里的手绘笔');
    assert.match(wxss, /\.camera\{[^}]*border:3rpx solid #59351f/, '相机图标样式不能动');
    assert.match(wxss, /\.pencil-icon\{[^}]*width:44rpx;height:44rpx/, '笔的尺寸不能动');
    assert.match(wxss, /\.is-open \.action\{[^}]*text-shadow/, '文字描边高光保留');
});

test('拍照记那一行停在第一个胶囊的中部，不压到下面的暗带', () => {
    const photo = wxss.match(/\.is-open \.action-photo\{transform:translateY\(-(\d+)rpx\)\}/);
    const manual = wxss.match(/\.is-open \.action-manual\{transform:translateY\(-(\d+)rpx\)\}/);
    assert.ok(photo, '拍照记要有一条只含位移的最终规则');
    assert.ok(manual);
    assert.ok(Number(photo[1]) >= 276, '第一行文字抬高到胶囊中部，实际 -' + photo[1] + 'rpx');
    assert.ok(Number(photo[1]) > Number(manual[1]) + 100, '两个胶囊有固定间距，拍照记必须明显高于手动记');
});
