// Reuse existing thresholds and scoring; only adapt their presentation to the cream theme.
const advice = require('./advice');
function buildState(input) {
    const line = advice.buildAdviceLine(input);
    const mood = advice.resolveMood(input);
    const shares = advice.calcShares(input.protein || 0, input.carb || 0, input.fat || 0);
    const direction = advice.resolveDirection(shares);
    let kind = 'neutral';
    let title = '今天还没记录，先记下一餐';
    let message = '记录后，会根据热量和营养结构给出搭配参考。';
    let action = '记第一笔';
    let target = 'add';
    if (input.count > 0 && (shares === null || input.nutritionMissing)) {
        title = '营养数据还不完整';
        message = '先补充已记录食物的营养数据，再观察结构。';
        action = '补充记录';
    } else if (input.count > 0) {
        target = 'advice';
        kind = line.tone === 'good' && mood.key === 'good' ? 'good' : 'adjust';
        if (kind === 'good') {
            title = '目前搭配不错，继续保持';
            message = '保持食物多样性，按自己的饥饿感与食量安排下一餐。';
            action = '搭配建议';
        } else {
            title = line.tone === 'good'
                ? (input.total > input.goal ? '已记录热量高于目标' : (input.hour >= 19 && input.total < input.goal * .6 ? '按目前记录，摄入偏少' : '营养结构仍有调整空间'))
                : line.text.replace(/\s*·.*$/, '').replace(/\s*›$/, '');
            title = '已记录饮食中，' + title.replace(/^今天/, '');
            message = '先核对份量与记录完整性，再参考下一餐的搭配。';
            action = '看看怎么搭配';
        }
    }
    // The whole card becomes progressively warmer as the original score decreases.
    const alpha = kind === 'adjust' ? (.38 + (1 - mood.score) * .26).toFixed(2) : '.50';
    const surface = kind === 'good'
        ? 'linear-gradient(125deg,rgba(239,255,209,.94),rgba(247,255,231,.90))'
        : kind === 'adjust' ? 'linear-gradient(125deg,rgba(255,235,222,.64),rgba(243,177,159,' + alpha + '))' : '';
    return { kind, title, message, action, target, surface, direction, moodKey: mood.key };
}
module.exports = { buildState };
