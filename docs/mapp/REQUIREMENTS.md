# 官方硬性要求对照表

依据 [linux-do/mapp-developer-guide](https://github.com/linux-do/mapp-developer-guide) 提交 `ae0b523297a8c25314304f2cd92270badc0ac629`（开发说明、提审说明、SDK `pack`、执行能力、浏览器存档）。状态只使用：**满足** / **不满足** / **待用户操作**。部分落地但未在官方沙箱复核的条目，在「说明」里写清，状态仍按代码与本地证据归类，并在「待用户操作」中单列复核项。

| # | 官方要求 | 本分支做法 | 状态 |
| --- | --- | --- | --- |
| 1 | 五个基础文件在 ZIP 根目录：`manifest.json`、`index.html`、`app.js`、`app.css`、`strings.json`；其他文件必须列入 `assets` 或 `media`。用 SDK `pack()` 打包，不要手搓或上传开发目录 / 旁边的 `package.json`。 | `scripts/pack-mapp.mjs` 调用 `@discourse-mini-app/sdk/pack`。本参考包 156 个文件，根目录六项为基础五件套加已声明的 `asset-list.json`。 | 满足 |
| 2 | `index.html` 是正文片段：不带脚本入口、内联样式、事件属性、资源预连接、嵌套 iframe/object 等浏览上下文。 | `mapp/template.html` 只有 `<div id="app"></div>`。 | 满足 |
| 3 | 脚本为单个 IIFE `app.js`，样式为 `app.css`。版本号必须是 `x.x.x` 三段数字，最长 64 字符，不带前导零或后缀。 | 游戏打成单一 IIFE `app.js`。版本 `1.0.11`。 | 满足 |
| 4 | `id` 必须是社区应用页分配的 UUID v7，原样复制，不要自行生成。 | 清单 ID 是应用页上的 `01a1cddd-b6e3-70d1-8132-f37aceee7d9c`（「Doro个螺丝」）。构建仍可用 `MINI_APP_ID` 覆盖。 | 满足 |
| 5 | 解压总量 ≤ 128 MiB，单文件 ≤ 32 MiB，文件数 ≤ 1024，manifest JSON ≤ 1 MiB。上传 ZIP 在 SDK 里还受 32 MiB 加密封套限制。 | 画册六张大图是 960×960、质量 70 的有损 WebP，合计 544 822 字节。未打入 campaign JSON、favicon、og。本包 3 714 954 字节、156 个文件。 | 满足 |
| 6 | 上传 ZIP 大小「以上传页面显示的大小限制为准」。 | 沙箱上传页写明上限 4 096 KiB（4 194 304 字节）。本包 3 714 954 字节，低于该上限，也低于建议的 3 900 KiB。 | 满足 |
| 7 | 只申请实际需要的权限；未声明不得使用对应能力。 | 申请：`theme.read`、`storage.read`、`storage.write`、`audio.webAudio`、`files.save`。未申请：`user.read`、`clipboard.write`、`links.open`、`network.*`、`assets.remote`、`workers.create`、`cookies.*`、`fullscreen`、`code.load`、`code.eval`、`code.modules`。 | 满足 |
| 8 | 网络必须在 manifest 声明端点；不能未声明联网，也不能把秘密放进包内。 | 无 `endpoints` / `websockets` / `remote_assets`。关卡不按 URL 拉取。包内无令牌或密钥。网站统计、noindex、favicon、og 未进入微应用包。 | 满足 |
| 9 | 原生 `new Worker()` / `importScripts()` 不是加载入口；Worker 须声明并申请 `workers.create`。 | 微应用构建用 Vite 插件去掉 Worker 构造，提示/预分析改在主线程（`src/mapp/inline-services.ts`）。网站版仍用原来的 Worker。 | 满足 |
| 10 | `getSDK()`（`globalThis.miniApp`），先等 `sdk.ready`，首次渲染或显示错误后调用 `lifecycle.ready()`。启动失败也要能反馈。 | `src/mapp/entry.ts` 打进 `app.js`。入口无条件调用 `boot()`，`__DORO_BOOT__` 挡住第二次。先画出「正在打开…」，立刻 `lifecycle.ready()`，再读素材。失败文案是「微应用未能启动：…」，并仍调用 `lifecycle.ready()`。 | 满足 |
| 11 | 浏览器存档用异步 `sdk.localStorage`，按应用及正式/沙盒隔离。网站若有原存档，应继续走原方式。 | 微应用用 `exportData()` 灌入适配层并替换 `localStorage`，写入再回落到 `sdk.localStorage`。原生 `indexedDB` 在微应用里设为 `undefined`，撤回日志走 localStorage 出站队列。网站版构建定义 `DORO_MAPP=false`，仍用原来的 localStorage + IndexedDB。 | 满足 |
| 12 | 包内图片经 `sdk.assets.readBytes` 做成 Blob URL 再显示；不支持用 URL 加载自定义字体。 | 棋盘图用 `readBytes` 得到字节后做成 Blob URL，交给 `Image`，不再走 Phaser 的 XHR Loader。音效同样 `readBytes` 后 `decodeAudioData`。画册大图点开才读。没有 `@font-face`，也没有字体文件 URL。 | 满足 |
| 13 | 使用原生在线 `AudioContext` 必须申请 `audio.webAudio`。平台在代码执行前提供「开启声音 / 静音进入」，运行中有会话声音开关；静音只关输出，不暂停 context 时钟。 | 已申请该权限。游戏仍用原 Web Audio。本地 mock 用增益节点模拟静音，验收得 `gain=0`。官方进入前选择框和窄屏「更多」菜单中的开关，本地预览没有，也无法在未上传的沙箱里证实。 | 待用户操作 |
| 14 | 游戏在页面隐藏时暂停；离开时取消订阅。 | 微应用在 `visibilitychange` 隐藏且处于对局、并非已有暂停/结算/救场/错误时调用 `showPause()`，并停物理与音频。`pagehide` 取消主题订阅、回收 Blob URL。本地 mock 隐藏后出现暂停页，上面有「已拆 N 颗」和「继续拆」。 | 满足 |
| 15 | 支持窄屏、触摸、键盘、深浅主题与减少动效；注意安全区。固定视口游戏可保留自身布局。 | 390×844 触控可玩；`src/mapp/shell.css` 使用安全区并限制 `#app` 最大宽度 480。键盘沿用网站：Esc 暂停/关闭、对话框 Tab 循环、+/-/方向键缩放平移。减少动效写到 `.reduced-motion`；背景色跟随 `theme.background`。深色模式只加 `.mapp-dark` 类，没有重做整套深色立绘。官方沙箱真机与系统深色未复核。 | 满足 |
| 16 | 不能访问父 DOM、论坛 Cookie 或其他应用。剪贴板、全屏、外链须用 SDK 且由明确操作触发；外链必须预先声明。 | 未读父 DOM / Cookie。不申请 `clipboard.write`、`links.open`、`fullscreen`。复制挑战码改为全选输入框并提示「长按选中这段挑战码即可复制。」导出存档在获批时走 `sdk.files.save`。 | 满足 |
| 17 | 平台图标按圆形裁切，建议方形图、主体居中。正式提审还要在应用页填写名称、说明、图标。 | 代码包不含将要提交到应用页的图标文件。名称和说明草稿见 `SUBMISSION-DRAFT.md`。 | 待用户操作 |
| 18 | 真实 SDK 调试必须上传 sandbox；本地预览不模拟平台 SDK。作者须在 `/apps-sandbox/<app-id>/<version>-<8-char-sha>` 检查本次 ZIP。 | 本分支只做了自写 mock（见 `docs/mapp/screenshots/`）。未登录、未上传。 | 待用户操作 |
| 19 | 同一原始 ZIP 的完整 SHA-256 视为同一构建，重复提交直接拒绝（`BUILD_EXISTS`）。正式版版本号必须高于已发布最高版本。 | 已在构建说明里写出。替换 ID 后必须重打再上传。首次正式版拟用 `1.0.0`。 | 待用户操作 |

## 包体裁剪（如实）

未打入微应用包、从而减小体积的内容：

- 画册大图：打进微应用包时缩到 960×960、质量 70，六张合计 544 822 字节。不在启动时预读。点「欣赏高清原图」才读取这一张，关掉就释放。网站版仍直接使用原来的 1254×1254 无损文件。
- 点阵用的 720 画稿质量 68，缩略图缩到 160 且质量 70，都不进启动清单里的大图路径；缩略图仍随常驻图预读。背景、标题和立绘用质量 72。玻璃单张质量 82，螺丝和玻璃图集质量 80，为的是边缘还能点。这些只改微应用包里的副本。
- `campaign/r1` 旧关卡资源：未包含。修订 4 关卡已经打进 `app.js`，微应用不再另附 campaign JSON。`public/sfx` 短音效仍按路径从包内加载，没有再压。
- 网站用 favicon、og 图、以及任何 noindex / 统计相关页面头：未包含。`index.html` 没有 meta。

当前 ZIP 3 714 954 字节，SHA-256 `d64e3a576d00ad985478d32e3b3d84c6d872daf4ef4ef6766c7b17b8b95851dd`。沙箱上传页上限是 4 096 KiB。`mapp/src/main.ts` 先画出「正在打开…」，在 `finally` 里调用 `lifecycle.ready()`，然后再进入游戏。

打包时会把 Phaser 运行时里唯一的 `new Function("return this")` 换成 `globalThis`，并去掉默认的 `phaser.io` 地址字符串。打进 ZIP 的 `app.js` 不再含 `eval`、`new Function` 或该地址。SVG 命名空间 `http://www.w3.org/2000/svg` 仍在，它是标记，不会发起请求。
