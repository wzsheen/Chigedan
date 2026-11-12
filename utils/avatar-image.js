// 本地图片头像：从相册/相机选一张图，复制到小程序用户目录，长期可用。
// 为什么必须复制：chooseMedia 给的是临时路径，小程序重启后就失效，只有落到
// USER_DATA_PATH 下的文件才能下次打开还在。这里只管文件，不碰设置。

const AVATAR_PREFIX = 'avatar-';
const EXT_WHITELIST = ['jpg', 'jpeg', 'png', 'webp'];

function getUserDataPath() {
    if (typeof wx !== 'undefined' && wx.env && typeof wx.env.USER_DATA_PATH === 'string') {
        return wx.env.USER_DATA_PATH;
    }
    return '';
}

// 只认自己目录下的文件，避免误删用户其他数据。
function isManagedPath(path) {
    const root = getUserDataPath();
    if (root === '' || typeof path !== 'string' || path === '') {
        return false;
    }
    return path.indexOf(root + '/') === 0 && path.indexOf(AVATAR_PREFIX) !== -1;
}

function guessExt(tempPath) {
    const text = typeof tempPath === 'string' ? tempPath : '';
    const dot = text.lastIndexOf('.');
    if (dot === -1) {
        return 'jpg';
    }
    const ext = text.slice(dot + 1).toLowerCase();
    return EXT_WHITELIST.indexOf(ext) === -1 ? 'jpg' : ext;
}

// 拉起相册/相机，返回临时路径。用户取消不算错误，返回 cancelled。
function pickImage() {
    return new Promise(resolve => {
        if (typeof wx === 'undefined' || typeof wx.chooseMedia !== 'function') {
            resolve({ path: '', error: '当前环境不支持选择图片', cancelled: false });
            return;
        }
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            sizeType: ['compressed'],
            success(res) {
                const files = res && res.tempFiles ? res.tempFiles : [];
                if (files.length === 0 || !files[0].tempFilePath) {
                    resolve({ path: '', error: '没有拿到图片', cancelled: false });
                    return;
                }
                resolve({ path: files[0].tempFilePath, error: '', cancelled: false });
            },
            fail(err) {
                const message = err && err.errMsg ? String(err.errMsg) : '';
                const cancelled = message.indexOf('cancel') !== -1;
                resolve({ path: '', error: cancelled ? '' : '选择图片失败', cancelled: cancelled });
            },
        });
    });
}

// 把临时文件复制到用户目录，返回可长期使用的路径。
function saveImage(tempPath) {
    return new Promise(resolve => {
        const root = getUserDataPath();
        if (root === '') {
            resolve({ path: '', error: '当前环境不支持保存图片' });
            return;
        }
        if (typeof tempPath !== 'string' || tempPath === '') {
            resolve({ path: '', error: '没有拿到图片' });
            return;
        }
        const dest = root + '/' + AVATAR_PREFIX + Date.now() + '.' + guessExt(tempPath);
        try {
            const fs = wx.getFileSystemManager();
            fs.copyFile({
                srcPath: tempPath,
                destPath: dest,
                success() {
                    resolve({ path: dest, error: '' });
                },
                fail(err) {
                    resolve({ path: '', error: (err && err.errMsg) || '保存图片失败' });
                },
            });
        } catch (err) {
            resolve({ path: '', error: (err && err.message) || '保存图片失败' });
        }
    });
}

// 删掉不再使用的头像文件，失败不抛（文件可能已被系统清理）。
function removeImage(path) {
    if (!isManagedPath(path)) {
        return Promise.resolve({ removed: false, error: '' });
    }
    return new Promise(resolve => {
        try {
            const fs = wx.getFileSystemManager();
            fs.unlink({
                filePath: path,
                success() {
                    resolve({ removed: true, error: '' });
                },
                fail() {
                    resolve({ removed: false, error: '' });
                },
            });
        } catch (err) {
            resolve({ removed: false, error: '' });
        }
    });
}

// 文件是否还在（用户清缓存后可能被清掉），用于打开页面时校验一次。
function exists(path) {
    if (!isManagedPath(path)) {
        return false;
    }
    try {
        const fs = wx.getFileSystemManager();
        fs.accessSync(path);
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = {
    isManagedPath,
    pickImage,
    saveImage,
    removeImage,
    exists,
};
