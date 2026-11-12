// 稀饭是粥的常见叫法；保留具体食材，泛称由搜索列表让用户选择。
function porridgeAliases(name, aliases) {
    const result = Array.isArray(aliases) ? aliases.slice() : [];
    if (typeof name === 'string' && name.includes('粥')) {
        const alias = name.replace(/粥/g, '稀饭');
        if (alias !== '稀饭' && !result.includes(alias)) result.push(alias);
    }
    return result;
}
module.exports = { porridgeAliases };
