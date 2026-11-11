# 本地 SDK mock 验收记录（不是 Linux DO 官方沙箱）

视口 390×844，设备像素比 2，触控。脚本：`npm run check:mapp`。时间：2026-11-10 11:16 PM America/Ojinaga（UTC-6）。完整报告见同目录 `report.json`（`"sandbox": "local-mock-not-official"`，`"ok": true`）。

这些画面顶部都有深色条幅「本地 SDK mock / 不是 Linux DO 官方沙箱」。**不能当作官方沙箱或提审截图。** 正式提审截图须由作者在 `/apps-sandbox/...` 实机重拍，见 [SUBMISSION-DRAFT.md](../SUBMISSION-DRAFT.md)。

| 文件 | 验证点 | 结果 |
| --- | --- | --- |
| `mapp-home-390x844.png` | 开局首页 | 可见「开始拆！」；条幅标明非官方沙箱 |
| `mapp-l1-start-390x844.png` | 进入第 1 关 | 盘面与画布已出现 |
| `mapp-sound-muted-390x844.png` | 声音开关 | mock 静音；报告 `muted.flag=true`，`muteGain=0` |
| `mapp-l1-won-390x844.png` | 第 1 关通关 | 「第一颗小成就，收好。」15/15，`phase=won`，`completed=[1]` |
| `mapp-hidden-pause-390x844.png` | 隐藏页面自动暂停 | 标题「我帮你盯着。」，已拆 6 颗，`hidden=true` |
| `mapp-challenge-copy-390x844.png` | 挑战码复制降级 | 码 `D4-3-C-2-0-U8N7V` 全选 16 字；toast「长按选中这段挑战码即可复制。」 |
| `mapp-restored-390x844.png` | 刷新后存档恢复 | 同一 `runId`，第 2 关中途 `moves=6`，`phase=playing` |
| `mapp-mock-390x844.mp4` | 全程录像 | 约 15 秒；由 Playwright webm 转码，无音轨 |

控制台：无页面异常、无业务 404。预览服务器对浏览器自动请求的 `/favicon.ico` 返回 204，该图标不在 `app.zip` 内。

未覆盖：官方进入前「开启声音 / 静音进入」对话框、窄屏「更多」菜单里的平台声音开关、真实 `sdk.localStorage` 隔离、真实 `files.save` 系统面板。这些只能在官方沙箱确认。
