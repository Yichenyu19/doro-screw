# 官方硬性要求对照表

依据 [linux-do/mapp-developer-guide](https://github.com/linux-do/mapp-developer-guide) 提交 `acbe7817a006bd82c2fc084611d8f43de245808c`（开发说明、提审说明、SDK、执行能力、浏览器存档）。状态只使用：**满足** / **不满足** / **待用户操作**。部分落地但未在官方沙箱复核的条目，在「说明」里写清，状态仍按代码与本地证据归类，并在「待用户操作」中单列复核项。

| # | 官方要求 | 本分支做法 | 状态 |
| --- | --- | --- | --- |
| 1 | 五个基础文件在 ZIP 根目录：`manifest.json`、`index.html`、`app.js`、`app.css`、`strings.json`；其他文件必须列入 `assets` 或 `media`。用 SDK `pack()` 打包，不要手搓或上传开发目录 / 旁边的 `package.json`。 | `scripts/pack-mapp.mjs` 调用 `@discourse-mini-app/sdk/pack`。本参考包 142 个文件，根目录六项为基础五件套加已声明的 `asset-list.json`。 | 满足 |
| 2 | `index.html` 是正文片段：不带脚本入口、内联样式、事件属性、资源预连接、嵌套 iframe/object 等浏览上下文。 | `mapp/template.html` 只有 `<div id="app"></div>`。 | 满足 |
| 3 | 脚本为单个 IIFE `app.js`，样式为 `app.css`。版本号必须是 `x.x.x` 三段数字，最长 64 字符，不带前导零或后缀。 | `mapp/vite.config.ts` 输出 IIFE `DoroScrew`；版本 `1.0.0`。 | 满足 |
| 4 | `id` 必须是社区应用页分配的 UUID v7，原样复制，不要自行生成。 | 清单里是符合官方 v7 正则的占位符 `019a0d0d-0000-7000-8000-00000000d0d0`。构建读取 `MINI_APP_ID`。未替换前 `BUILD.json` 的 `placeholderId` 为 `true`。 | 待用户操作 |
| 5 | 解压总量 ≤ 128 MiB，单文件 ≤ 32 MiB，文件数 ≤ 1024，manifest JSON ≤ 1 MiB。 | 参考包解压 12 387 624 字节（约 11.81 MiB），142 个文件，最大 `app.js` 1 586 731 字节（约 1.51 MiB）。未打入画册 HD、campaign/r1、favicon、og。 | 满足 |
| 6 | 上传 ZIP 大小「以上传页面显示的大小限制为准」。 | 参考 ZIP 11 090 577 字节（约 10.58 MiB）。上传页限额未在文档写死，本助手未打开上传页。 | 待用户操作 |
| 7 | 只申请实际需要的权限；未声明不得使用对应能力。 | 申请：`theme.read`、`storage.read`、`storage.write`、`audio.webAudio`、`files.save`。未申请：`user.read`、`clipboard.write`、`links.open`、`network.*`、`assets.remote`、`workers.create`、`cookies.*`、`fullscreen`、`code.*`。 | 满足 |
| 8 | 网络必须在 manifest 声明端点；不能未声明联网，也不能把秘密放进包内。 | 无 `endpoints` / `websockets` / `remote_assets`。关卡不按 URL 拉取。包内无令牌或密钥。网站统计、noindex、favicon、og 未进入微应用包。 | 满足 |
| 9 | 原生 `new Worker()` / `importScripts()` 不是加载入口；Worker 须声明并申请 `workers.create`。 | 微应用构建用 Vite 插件去掉 Worker 构造，提示/预分析改在主线程（`src/mapp/inline-services.ts`）。网站版仍用原来的 Worker。 | 满足 |
| 10 | `getSDK()`（`globalThis.miniApp`），先等 `sdk.ready`，首次渲染或显示错误后调用 `lifecycle.ready()`。启动失败也要能反馈。 | `src/mapp/entry.ts` 按此顺序启动；`bootGame` 放在 `try/finally` 里调用 `lifecycle.ready()`；顶层失败会写出「微应用未能启动」再尝试 `lifecycle.ready()`。 | 满足 |
| 11 | 浏览器存档用异步 `sdk.localStorage`，按应用及正式/沙盒隔离。网站若有原存档，应继续走原方式。 | 微应用用 `exportData()` 灌入适配层并替换 `localStorage`，写入再回落到 `sdk.localStorage`。原生 `indexedDB` 在微应用里设为 `undefined`，撤回日志走 localStorage 出站队列。网站版构建定义 `DORO_MAPP=false`，仍用原来的 localStorage + IndexedDB。 | 满足 |
| 12 | 包内图片经 `sdk.assets.readBytes` 做成 Blob URL 再显示；不支持用 URL 加载自定义字体。 | 运行时图片按 `asset-list.json` 预读并 `setAssetResolver`。缺失路径（含未打包的画册 HD）返回空，不发起未声明请求。未使用 `@font-face` URL。 | 满足 |
| 13 | 使用原生在线 `AudioContext` 必须申请 `audio.webAudio`。平台在代码执行前提供「开启声音 / 静音进入」，运行中有会话声音开关；静音只关输出，不暂停 context 时钟。 | 已申请该权限。游戏仍用原 Web Audio。本地 mock 用增益节点模拟静音，验收得 `gain=0`。官方进入前选择框和窄屏「更多」菜单中的开关，本地预览没有，也无法在未上传的沙箱里证实。 | 待用户操作 |
| 14 | 游戏在页面隐藏时暂停；离开时取消订阅。 | 微应用在 `visibilitychange` 隐藏且处于对局、并非已有暂停/结算/救场/错误时调用 `showPause()`，并停物理与音频。`pagehide` 取消主题订阅、回收 Blob URL。本地 mock 隐藏后出现「我帮你盯着。」 | 满足 |
| 15 | 支持窄屏、触摸、键盘、深浅主题与减少动效；注意安全区。固定视口游戏可保留自身布局。 | 390×844 触控可玩；`src/mapp/shell.css` 使用安全区并限制 `#app` 最大宽度 480。键盘沿用网站：Esc 暂停/关闭、对话框 Tab 循环、+/-/方向键缩放平移。减少动效写到 `.reduced-motion`；背景色跟随 `theme.background`。深色模式只加 `.mapp-dark` 类，没有重做整套深色立绘。官方沙箱真机与系统深色未复核。 | 满足 |
| 16 | 不能访问父 DOM、论坛 Cookie 或其他应用。剪贴板、全屏、外链须用 SDK 且由明确操作触发；外链必须预先声明。 | 未读父 DOM / Cookie。不申请 `clipboard.write`、`links.open`、`fullscreen`。复制挑战码改为全选输入框并提示「长按选中这段挑战码即可复制。」导出存档在获批时走 `sdk.files.save`。 | 满足 |
| 17 | 平台图标按圆形裁切，建议方形图、主体居中。正式提审还要在应用页填写名称、说明、图标。 | 代码包不含将要提交到应用页的图标文件。名称和说明草稿见 `SUBMISSION-DRAFT.md`。 | 待用户操作 |
| 18 | 真实 SDK 调试必须上传 sandbox；本地预览不模拟平台 SDK。作者须在 `/apps-sandbox/<app-id>/<version>-<8-char-sha>` 检查本次 ZIP。 | 本分支只做了自写 mock（见 `docs/mapp/screenshots/`）。未登录、未上传。 | 待用户操作 |
| 19 | 同一原始 ZIP 的完整 SHA-256 视为同一构建，重复提交直接拒绝（`BUILD_EXISTS`）。正式版版本号必须高于已发布最高版本。 | 已在构建说明里写出。替换 ID 后必须重打再上传。首次正式版拟用 `1.0.0`。 | 待用户操作 |

## 包体裁剪（如实）

未打入微应用包、从而减小体积的内容：

- 画册 HD 图：未包含。中图与缩略图仍在。HD 是可选查看品质，微应用里点开 HD 会得到缺图提示，不会去站外拉图。
- `campaign/r1` 旧关卡资源：未包含。修订 4 的 1–8 关 JSON 和 `public/sfx` 短音效已声明进包。运行时关卡数据实际来自打进 `app.js` 的内容模块；音效按路径从包内加载。
- 网站用 favicon、og 图、以及任何 noindex / 统计相关页面头：未包含。`index.html` 没有 meta。

当前解压约 11.90 MiB，远低于 128 MiB。上传页是否另有更小上限，须用户在上传页查看。
