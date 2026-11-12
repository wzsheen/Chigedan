// 已确认的 8 款立体可爱头像，图片位于 assets/avatars。
// 保留原有 key，升级后用户之前的选择无需迁移。

const AVATARS = [
    { key: 'cat', label: '橘子猫' },
    { key: 'whale', label: '小蓝鲸' },
    { key: 'sun', label: '小太阳' },
    { key: 'cloud', label: '小云朵' },
    { key: 'star', label: '小星星' },
    { key: 'avocado', label: '牛油果' },
    { key: 'peach', label: '水蜜桃' },
    { key: 'penguin', label: '小企鹅' },
];

const DEFAULT_AVATAR = 'cat';

function isAvatarKey(key) {
    for (let i = 0; i < AVATARS.length; i += 1) {
        if (AVATARS[i].key === key) {
            return true;
        }
    }
    return false;
}

function avatarLabel(key) {
    for (let i = 0; i < AVATARS.length; i += 1) {
        if (AVATARS[i].key === key) {
            return AVATARS[i].label;
        }
    }
    return AVATARS[0].label;
}

module.exports = {
    AVATARS,
    DEFAULT_AVATAR,
    isAvatarKey,
    avatarLabel,
};
