# Android 构建与调试面板

正式版本默认在project.miniapp.json中显式设置mini-android.enableVConsole为close；iOS同样关闭。值来自当前微信开发者工具配置编辑器支持的open/close枚举，不使用CSS隐藏，也不改console日志或错误处理。

发布前在项目根目录执行：

```powershell
node scripts/miniapp-build-mode.js release
node scripts/miniapp-build-mode.js check-release
node --test tests/release-config.test.js
```

然后在微信开发者工具多端打包界面明确选择正式Release构建，重新编译、签名生成APK。脚本只控制原生调试面板配置，不代替工具中的Release构建类型、签名或版本号选择；本项目未包含独立Gradle工程或自动APK发布流水线。

开发时确实需要面板再显式开启：

```powershell
node scripts/miniapp-build-mode.js debug
```

该命令会修改原生打包配置，需要重新构建调试APK才能生效。使用后在正式打包前重新执行release和check-release。也支持MINIAPP_BUILD_MODE=debug/release；命令行参数优先，未设置时默认release。不要假设NODE_ENV会被小程序CommonJS运行时注入。微信开发者工具自带Console不依赖本配置。

验证新APK：确认安装的是刚生成的Release产物，核对AndroidManifest的debuggable为false或未声明；冷启动、切前后台、常见页面及官方厂商WebView检查无vConsole/eruda。必要时检查构建产物中是否仍主动加载/初始化调试脚本。原生SDK可能内置相关代码，不能仅凭二进制出现关键词认定初始化。

旧APK不会因本地JSON变化自动更新。优先覆盖安装新包并强停重启，不清理用户数据。只有排除旧包、旧进程和WebView缓存后仍复现，才针对可确认的调试缓存进一步排查，禁止直接清空饮食/身体记录。若工具复用旧构建产物，应重新编译原生包；主源码未发现service worker、热更新脚本加载器或缓存执行JS。

远程WebView仅有pages/ai-provider指向已知厂商官方密钥网页，项目未向其注入调试库；第三方网页自身脚本不属于本地打包内容。

2026-11-03核查：Android SDK 1.7.0 / toolkit 0.11.0；修复前Android与iOS均显式open。当前未提供APK/Gradle构建产物，也未安装adb/gradle命令，故不能确认旧安装包的debuggable/签名/实际加载状态；本次不声明完成真机验收。
