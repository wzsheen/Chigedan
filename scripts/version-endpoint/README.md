# 检查更新：版本接口怎么配

App（多端打包的 APK）里「关于与隐私 → 检查更新」只做一件事：GET 一个 HTTPS 地址，拿回一份版本 JSON，跟包内版本号比大小。所以「服务」可以是一台服务器，也可以就是一个静态文件——两条路的数据结构完全一样，客户端都认。

```
App  ──GET https://你的域名/version.json──▶  静态文件 或 Node 代理  ──▶  返回 { version, notes, downloadUrl, ... }
```

必须先满足的前提：这个域名要 **HTTPS + 已备案**，并加进小程序后台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」。多端打包的 App 复用小程序的网络配置，域名不过关，App 里请求会直接失败。

---

## 方案 A：静态 JSON（推荐，自己发版用这个就够）

不用服务器、不用 GitHub token、不用写代码，改一次 30 秒。适合「自己打包、自己装」的场景。

### 1. 生成版本文件

```bash
node scripts/bump-version.js 0.0.2 stable  # 同步版本号和安装包渠道；测试版用 beta，开发版用 development
# ……构建 APK，把安装包传到能直链下载的地方……
node scripts/publish-version.js --notes "1. 修了记一笔的数量重算|2. 新增备注" \
    --apk https://你的域名/calorie-app-0.0.2.apk --size 12.5
```

产物是 `scripts/version-endpoint/version.json`：

```json
{
  "version": "0.0.2",
  "publishedAt": "2026-11-03T14:00:00Z",
  "notes": "1. 修了记一笔的数量重算\n2. 新增备注",
  "releaseUrl": "",
  "downloadUrl": "https://你的域名/calorie-app-0.0.2.apk",
  "assetName": "calorie-app-0.0.2.apk",
  "assetSize": 13107200
}
```

- `version` 必须大于 App 内的 `LOCAL_VERSION` 才会提示更新，相等就是「已是最新」；
- `notes` 里的 `|` 会转成换行，App 端按换行展示；
- `--size` 单位 MB，只影响面板上「安装包 12.5 MB」这行字，可以不传；
- 谁都不填的那个字段留空字符串就行，客户端会忽略。

### 2. 上传到静态托管

任意「HTTPS + 已备案域名 + 能直出 JSON」的地方都行：自己的网站目录、腾讯云 COS / 阿里云 OSS、又拍云、对象存储 + CDN 等。要点：

| 事项 | 要求 |
| --- | --- |
| 访问路径 | 建议固定成 `/version.json`，例如 `https://cdn.example.com/version.json` |
| Content-Type | `application/json`（对象存储上传时选 json 类型即可，客户端两种都认） |
| Cache-Control | `no-cache` 或 `max-age=60`。**别用默认值**，否则改了版本文件 App 还读旧的 |
| 安装包 | 建议和 JSON 放同一个域名，`downloadUrl` 指向它 |

安装包为什么建议同域：`wx.downloadFile` 走的是独立的 downloadFile 合法域名，跨域 + 302 跳转多了容易撞白名单；**私有仓库**（如 `calorie-tracker`）的 Release 附件链接还需要登录，用户点开是 GitHub 登录页，不能用。

客户端已经会给请求加上 `?_t=时间戳` 绕缓存，但服务端的 Cache-Control 还是设一下更稳（iOS 侧 CDN 有自己的规矩）。

### 3. 填地址 + 加白名单

1. `utils/app-update.js` 里 `const DEFAULT_ENDPOINT = 'https://cdn.example.com/version.json';`
2. 小程序后台把 `cdn.example.com` 加进 **request 合法域名**；
3. 重新打包 APK（`DEFAULT_ENDPOINT` 是打进包里的，改完必须重打包才生效）。

调试期不想重编译，可以在开发者工具 Console 临时覆盖：

```js
wx.setStorageSync('cal_update_endpoint', 'https://cdn.example.com/version.json')   // 生效
wx.removeStorageSync('cal_update_endpoint')                                        // 还原
```

### 4. 验一下

```bash
curl -i "https://cdn.example.com/version.json?_t=$(date +%s)"
```

看到 `200` + 新版本号 + `Cache-Control` 就对了。再打开 App「关于与隐私 → 检查更新」，应当弹出「发现新版本 v0.0.2」。

---

## 把安装包搬到国内对象存储（下载慢先看这里）

**症状**：点「现在更新」进度条爬得很慢，几分钟后还提示下载失败；换 Wi-Fi / 换时段都一样。

**原因**：`downloadUrl` 直指 `github.com/.../releases/download/...`，它会 302 跳到 `release-assets.githubusercontent.com`（微软 Azure，海外）。安装包 63 MB 左右，国内单连接常常只有几十到几百 KB/s；而 `wx.downloadFile` **是单连接、不支持断点续传**，超时或失败就得从 0 重来。`pages/about/about.js` 的原超时是 2 分钟——63 MB 想在这个时间内下完，需要全程 ≥550 KB/s，网稍慢必然作废。

**改法：把 APK 放到国内对象存储 + CDN，`downloadUrl` 指过去。** 以腾讯云 COS 为例（阿里云 OSS 步骤基本一致）：

1. 建存储桶：**公有读私有写**（`wx.downloadFile` 不带签名，私有桶会 403），地域选离用户近的，如 `ap-shanghai`。
2. 上传 APK，建议独立目录，文件名带版本号：`apps/Chigedan-v0.0.3-android.apk`。
3. 强烈建议挂 CDN 加速域名并开 HTTPS（`https://cdn.你的域名/apps/Chigedan-v0.0.3-android.apk`）。只用 COS 默认域名 `xxx.cos.ap-shanghai.myqcloud.com` 也能下载，但没有全国加速，效果打折。
4. **两张白名单都要加这个域名**：小程序后台 → 开发管理 → 开发设置 → 服务器域名
   - `request` 合法域名：`version.json` 也放这个域名时必填；
   - `downloadFile` 合法域名：APK 直链域名必填（和 request 不是同一张）。
5. 重新生成版本文件，体积自动算，别手填：

```bash
node scripts/publish-version.js \
    --notes "1. 修了xxx|2. 新增yyy" \
    --apk https://cdn.你的域名/apps/Chigedan-v0.0.3-android.apk \
    --apk-file ./dist/Chigedan-v0.0.3-android.apk
```

6. 上传 `scripts/version-endpoint/version.json` 覆盖旧文件，`Cache-Control` 设 `no-cache`（或 `max-age=60`）。
7. 验证：

```bash
curl -sI "https://cdn.你的域名/apps/Chigedan-v0.0.3-android.apk" | grep -i -E "HTTP|content-length|content-type"
```

看到 `200` + `content-type: application/vnd.android.package-archive` + 正确的 `content-length` 就通了。手机上再点「现在更新」，正常情况下十几秒到一分钟。

**注意**
- 不要用会二次跳转的短链/中转页，`downloadFile` 遇到 302 到未加白名单的域名会被拦。
- 不要把 APK 放在私有桶或需要登录的位置（GitHub 私有仓库的 Release 附件就是这种，用户点开是登录页）。
- GitHub 那份可以留着当备份，但 `version.json` 里的 `downloadUrl` 必须已经指向国内地址，否则等于没换。

---

## 方案 B：Node 代理读 GitHub Release

静态文件要手动改；如果你想让「发 GitHub Release」这一步直接变成新版本，就用这个代理：它带 token 去读私有仓库的 Release，精简后返回，5 分钟内存缓存。

```bash
GITHUB_TOKEN=ghp_xxx node scripts/version-endpoint/index.js
# → http://127.0.0.1:8787/version
```

| 环境变量 | 说明 |
| --- | --- |
| `GITHUB_TOKEN` | 必填。对私有仓库有读权限（fine-grained token 只要 `Contents: Read`） |
| `GITHUB_REPO` | 默认 `wzsheen/calorie-tracker` |
| `PORT` | 默认 `8787` |

部署到云函数时，把 `index.js` 的 `buildVersionPayload()` 当入口用（自带 5 分钟缓存）。上线后同样要填 `DEFAULT_ENDPOINT` + 加 request 合法域名。

不能直连 GitHub 的原因：`api.github.com` 过不了 request 合法域名的归属校验；私有仓库读 Release 要 token，而 token 一旦打进小程序包就等于公开。

---

## 更新是怎么执行的

「现在更新」按能力逐级降级，每一级失败都会把原因写在弹窗里，不会静默变成「什么都没发生」：

1. **应用内下载 + 拉起安装器**（你的目标态）：`wx.downloadFile` 下载 APK（带进度条）→ `wx.miniapp.installApp` 交给系统安装器。需要三个前提：
   - `project.miniapp.json` 里勾选了 **install SDK**（开发者工具 → 多端应用配置 → Android → 扩展 SDK）。**不勾选的话 `wx.miniapp.installApp` 在真机上是 `undefined`，只有开发者工具里能跑**——这是「模拟器好好的，装上就只复制链接」的头号原因。
   - 新包与当前包的**包名、签名证书一致**，且 versionCode 更高（`bump-version.js` 会一起加）。
   - `downloadUrl` 的域名在**小程序后台 → downloadFile 合法域名**里。
2. **系统浏览器**：`wx.miniapp.openUrl({url})`（https 会唤起默认浏览器）。
3. **复制链接**：以上都没有时兜底。

`downloadFile` 走的是**另一张白名单**（downloadFile 合法域名），跟 request 不是同一张。GitHub Release 的附件地址会 302 跳到 `objects.githubusercontent.com`，只加 `github.com` 可能仍然被拦。图省事就把 APK 放到 version.json 同域的静态目录里直链下载。

## 自动检查什么时候弹

- **冷启动进首页时查一次**；之后同一进程内每 5 分钟最多再查一次（App 退后台再回来也走这条），失败 2 分钟后允许重试。5 分钟只是限制查接口的频率，不是弹窗频率——不动页面就一直不查。
- 发现新版且打开「自动检查更新」→ 自动跳到关于页并弹说明。
- **24 小时内最多弹一次**：弹窗只要真的显示过就记一次（`cal_update_last_prompt = { version, at }`），不管是点「稍后」、点「现在更新」没装成、还是按返回键退出。期间换了新版本也等冷却结束再提醒。
- 手动在关于页再点一次「查看更新说明」不算新的一次，不会把 24 小时续期。
- 点「稍后」/ 点遮罩关闭另外再记一条 `cal_update_dismissed = { version, at }`，同样是 24 小时，两者谁都没到期就不弹。
- 老版本只存了 `cal_update_dismissed_version`（关了就永久不弹）。这个键没有时间戳，无法判断隔了多久，客户端按「冷却已过」处理并清掉——所以升级到这一版后，被静音掉的那次提醒会重新出现一次。
- 老版本只存了 `cal_update_dismissed_version`（关了就永久不弹）。这个键没有时间戳，无法判断隔了多久，客户端按「冷却已过」处理并清掉——所以升级到这一版后，被静音掉的那次提醒会重新出现一次。

## 排查「点了没反应」

关于页**长按版本号**，会把当前环境的接口情况复制到剪贴板：

```
app 0.0.1 | wx.miniapp 有 | installApp 无 | openUrl 有 | 接口 未列出
```

`installApp 无` = install SDK 没勾选，重新构建即可。`wx.miniapp 无` = 这个包不是多端打包产物（或在小程序/开发者工具里跑）。

## 相关脚本

| 文件 | 作用 |
| --- | --- |
| `scripts/bump-version.js` | 一次改 `project.miniapp.json`（version + versionCode）和 `utils/app-update.js` 的 `LOCAL_VERSION` |
| `scripts/publish-version.js` | 生成静态 `version.json`（方案 A 发版用） |
| `scripts/version-endpoint/version.json` | 版本文件本体，上传它 |
| `scripts/version-endpoint/index.js` | Node 代理（方案 B） |
| `tests/app-update.test.js` | 校验版本比较、返回结构、以及 `version.json` 本身是否合法 |
