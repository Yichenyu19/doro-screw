# Linux DO 上架对照

依据 [linux-do/mapp-developer-guide](https://github.com/linux-do/mapp-developer-guide) 的 `docs/developer-guide.md`、`docs/submission-review.md`、`docs/execution.md` 和 `sdk/README.md`。提审步骤见 [linuxdo-submission.md](linuxdo-submission.md)。

打包调用在 `scripts/pack-mapp.mjs`：`import {pack} from '@discourse-mini-app/sdk/pack'`，然后 `await pack({manifest,files,outputDirectory:out})`。这和指南示例 `demos/brick-breaker/scripts/package.ts` 是同一种写法。`npm run check:mapp` 的日志里会出现 `Created .../app.zip (...)`。包能被这个函数写出，就说明通过了它自己的校验；校验失败会直接抛错，不会生成 zip。

| 规则 | 我们怎么做 | 怎么验证 | 结果 |
| --- | --- | --- | --- |
| ZIP 由 SDK pack 生成，ID、版本、权限、资源一致，无秘密 | `scripts/pack-mapp.mjs` 的 `pack()`。清单 ID `01a1cddd-b6e3-70d1-8132-f37aceee7d9c`，版本 `1.0.7` | `npm run check:mapp` 日志；`tests/mapp-shell.test.ts` 断言引用了官方 pack | 1.0.5 和 1.0.6 已在官方沙箱启动失败。1.0.7 是否被沙箱接受：未验证 |
| 首屏或报错之后调用 lifecycle.ready | `src/mapp/entry.ts` 的 `boot` 先画出「正在打开…」，再 `lifecycle.ready()`，然后才读素材并进入游戏。失败写成「微应用未能启动：…」 | `tests/mapp-shell.test.ts`；`scripts/check-mapp.mjs` 记录 ready 时素材读取为 0、游戏尚未进入 | 通过（本地 mock）。官方沙箱里的 ready 时序：未验证 |
| 游客、拒绝权限、API 失败有反馈 | 主题读失败提示「主题没有读到…」；存档读失败提示「存档没有读到…」。没有申请用户身份 | `scripts/check-mapp.mjs` 打开 `?fail=theme` 和 `?fail=storage`，看 `#toast` | 通过（本地 mock）。官方宿主拒绝权限：未验证 |
| 手机、键盘、深浅主题、存储恢复、离开再打开 | 390×844 触控；Esc 暂停/关闭；方向键移动镜头；主题类 `mapp-dark`、`reduced-motion`；刷新恢复存档；隐藏后暂停 | `scripts/check-mapp.mjs` | 通过（本地）。真机离开再打开：未验证 |
| 只用公开 SDK，不碰父页面 DOM，不读论坛 cookie | 入口只用 `globalThis.miniApp`。棋盘 `input.windowEvents` 关闭。拆监听时读 `window.top` 包在 try/catch 里 | 源码 `src/render.ts`、`mapp/vite.config.ts`；打包禁令检查 `scripts/assert-no-sinks.mjs` | 通过静态检查。官方宿主里有没有越权：未验证 |
| 页面隐藏时暂停，支持减少动效 | 隐藏后出现暂停页。主题 `reducedMotion` 写到 `reduced-motion` | `scripts/check-mapp.mjs` 点「模拟页面隐藏」和 `setTheme` | 通过（本地 mock）。官方隐藏事件：未验证 |
| Trusted Types 和 CSP；字体只走 FontFace 字节 | 界面用 `src/markup.ts` 的 `parseMarkup` / `fill`。没有 `@font-face` 和字体文件 URL | 打包禁令；`tests/markup.test.ts`；严格 CSP 下 `check:mapp` 违规为 0 | 通过（本地）。官方 CSP 是否与本地一致：未验证 |
| 资源只经 sdk.assets 读取 | 启动图 `launchMiniApp` 里 `readBytes`。大图点开才读。音效用 `loadAsset` | `scripts/check-mapp.mjs` 断言首屏和进关不读大图 | 通过（本地 mock 的 readBytes） |
| 每个权限都用到，没有多申请 | `theme.read` 读主题；`storage.read/write` 存进度；`audio.webAudio` 短音效；`files.save` 导出。不再申请 `code.load` | 清单 `mapp/manifest.json`；`tests/mapp-adapter.test.ts` | 代码用到了这些权限。官方是否全部批准：未验证 |
| 体积小于 4096 KiB | 沙箱页上限 4 096 KiB。打包后用字节数硬性失败 | `npm run check:mapp` 日志：2 895 087 字节，SHA-256 `302fcfd191535df50d8770098119c111c8477f86fe2f54d0ce9f199c251f76ac` | 通过。上传页若改限额：未验证 |
| index.html 是正文片段，无脚本、内联样式、事件属性 | `mapp/template.html` 只有应用容器。入口脚本是单独的 `app.js` | 源码阅读 | 通过 |
| 游戏是单一 classic IIFE `app.js`，不用 `code.load`。加载时只定义，`globalThis.DoroGame.boot` 在 script 标签执行后才启动 | 1.0.5 官方沙箱：「Cannot access 'cu' before initialization」。动态 `import()` 被收进同一个 IIFE，`Promise.resolve().then(()=>cu)` 指向后面的 `const cu`。1.0.6 改成静态引入后，`scripts.load` 一执行就把 `src/main.ts` 的顶层副作用跑完，官方沙箱报「Script execution failed」。1.0.7 与官方游戏示例一样，只打 `app.js` + `app.css`，清单没有 `code.load` / `code.scripts`，包里没有 `chunks/game.js`。查询 `#app`、监听、定时器和 `createDelight` 都在 `bootGame()` 里。`new Function(app.js)()` 且 `querySelector` 恒为 null 时不启动；有 `#app` 时要调用 `DoroGame.boot()` 才进首页。真正的 script 标签看到 `document.currentScript` 后才自己启动 | `tests/mapp-chunk-boot.test.ts`；打包时 `assertPackedApp`；WebKit 与 Chromium 的 `check:mapp` | 1.0.5、1.0.6 官方沙箱：失败。1.0.7 打包日志 `packed app`：`bare.booted` 为 false、`listenerFailures` 为 0、`home.home` 为 true。WebKit 与 Chromium 的 `check:mapp` 都是 `ok:true`、违规 `[]`、第一关 30 步 `phase:won`，第二关检查没有报错。这份 1.0.7 还没在官方沙箱打开：未验证 |
| 不使用 eval / new Function | 构建时去掉场景脚本求值和 `new Function("return this")` | `scripts/assert-no-sinks.mjs` | 通过 |
| 无外部网络、无秘密、无 CDN | 清单没有 endpoints、remote_assets | `tests/mapp-adapter.test.ts` | 通过 |
| 剪贴板、全屏、外链须由明确操作触发 | 未申请这些权限。挑战码改为选中后长按 | 清单权限列表 | 通过 |
| HTTP、JWT、CDN 素材 | 没有这些能力 | 清单 | 不适用 |
| 沙箱里检查的是本次申请的同一份 ZIP | 发布页附带 zip 和 SHA-256 | 人工上传 | 未验证。本助手不能登录 Linux DO |
| 图标圆形裁切、名称说明 | 名称「Doro个螺丝」。图标在应用页，不在 zip 里 | 应用页由用户填写 | 未验证 |
| WebKit / 真 iPhone | `scripts/check-mapp.mjs` 用 Playwright WebKit 和 Chromium 各跑一遍，设备配置都是 iPhone 13 | `npm run check:mapp`：`webkit-iphone`（Apple）和 `chromium-iphone`（Google Inc.）都是违规 `[]`，第一关 30 步 `phase:won` | 通过（两个引擎）。手里的 iPhone：未验证 |

`parseMarkup` 拒绝 `script`、`iframe`、`object`、`embed`、`on*` 属性和 `javascript:` 地址，见 `tests/markup.test.ts`。

Phaser 自带的文件加载器仍有 `XMLHttpRequest`。它打开的地址如果是 `http:`、`https:` 或 `//`，构建时会直接抛错，打包检查也会失败。游戏素材只走 `sdk.assets.readBytes`。`DOMParser` 在构建时换成了空值。

## 删掉的画面文字

这些句子不再出现在屏幕上。图、按钮和盘面还在。

- 首页角色旁：「你先拆，我看着。」
- 暂停标题：「我帮你盯着。」暂停页只留已拆颗数和操作。
- 「怎么玩」里的五句说明：「同色三颗。」「对不上，先占一个孔。」「按住，看压着谁。」「留一颗，玻璃会转。」「双指放大。」图还在，玩家自己点开才看得到。
- 第一关通关：「第一颗小成就，收好。」「开工纪念贴纸已收入画册」。通关页改用「这一局，全拆完了。」贴纸图还在。
- 画册说明：「完成第一关得到的小纪念。」
- 收集盒旁边的「辅助盒」。加号还在，点开会到免费辅助。
- 设置里三行说明：「拧出、入盒、回流、落板和通关的小声音」「减少庆祝、飞行和界面动效」「钉头内显示清晰字标，盒子和暂存显示色名」。

关内教学句（点哪个颜色、过不去就用辅助）在修订 4 本来就不显示。`teachingCue` 在 `contentRevision >= 4` 时直接返回空。首页不列关卡说明。免费辅助按钮仍在工具栏，失败时不弹窗。

仍留在屏幕上的，是开始、关卡名、颗数、撤回、看一看、免费辅助、暂停和成绩这些操作或结果。
