# Linux DO 微应用适配（阶段 E）

本目录是提审材料草稿和本地验收说明。官方文档以 [linux-do/mapp-developer-guide](https://github.com/linux-do/mapp-developer-guide) 为准，当前对照的是该仓库提交 `ae0b523297a8c25314304f2cd92270badc0ac629`。

**不要把这里的材料当成已经提交。** 本分支不会代替任何人登录 Linux DO，也不会上传 `app.zip` 或发起正式审核。

网站版构建（`npm run build`）、`main` 分支和线上站点都不走这条入口。微应用使用 `npm run build:mapp`，产物在 `dist-mapp/`（已 gitignore），运行包是 `dist-mapp/package/app.zip`。

## 本地构建

```sh
npm run build:mapp
```

清单里的应用 ID 已是「Doro个螺丝」应用页上的 `01a1cddd-b6e3-70d1-8132-f37aceee7d9c`。要改 ID 或版本时：

```sh
MINI_APP_ID=<应用页复制的 UUID> MINI_APP_VERSION=1.0.3 npm run build:mapp
```

需要带 source map 的调试包时用 `npm run build:mapp:debug`。官方要求正式发布去掉 source map；调试包只用于沙箱。

本分支打出的包（沙箱 ZIP 上限 4 096 KiB，即 4 194 304 字节）：

| 项 | 值 |
| --- | --- |
| 路径 | `dist-mapp/package/app.zip`（需本地执行 `npm run build:mapp` 生成，不入库） |
| 体积 | 2 898 229 字节（约 2.76 MiB，低于 3 900 KiB） |
| SHA-256 | `4ccce191b7aec9cada2855d7bf67bfa8eace48c6b99c716a30c9300584d5ec21` |
| 解压总量 / 文件数 | 4 098 456 字节（约 3.91 MiB） / 157 个文件 |
| 应用 ID | `01a1cddd-b6e3-70d1-8132-f37aceee7d9c` |
| 版本 | `1.0.3` |
| 入口 `app.js` | 1 300 字节。游戏在 `chunks/game.js` |

同一份 SHA-256 再次上传会被平台拒绝（`BUILD_EXISTS`），过期构建也不例外。

## 本地预览（自写 SDK mock，不是官方沙箱）

官方开发说明写明：`bun run dev` 一类本地预览**不模拟平台 SDK**。真实 SDK 需要把 `app.zip` 上传到 `/apps-sandbox/<app-id>/<version>-<8-char-sha>`。

因此本仓库提供的是自写 mock：

```sh
npm run preview:mapp
# 或一次跑完 390×844 验收
npm run check:mapp
# 已有产物时
node scripts/check-mapp.mjs --skip-build
```

预览页顶部有明确条幅：「本地 SDK mock / 不是 Linux DO 官方沙箱」。`window.__DORO_MAPP_MOCK__.officialSandbox === false`。

## 文档

- [官方硬性要求对照表](REQUIREMENTS.md)
- [提审材料草稿（名称、简介、截图清单、版本说明、版权与可能被拒的点）](SUBMISSION-DRAFT.md)
- [本地 mock 验收截图与视频](screenshots/README.md)
