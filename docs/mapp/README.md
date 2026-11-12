# Linux DO 微应用适配（阶段 E）

本目录是提审材料草稿和本地验收说明。官方文档以 [linux-do/mapp-developer-guide](https://github.com/linux-do/mapp-developer-guide) 为准，当前对照的是该仓库提交 `ae0b523297a8c25314304f2cd92270badc0ac629`。

**不要把这里的材料当成已经提交。** 本分支不会代替任何人登录 Linux DO，也不会上传 `app.zip` 或发起正式审核。

网站版构建（`npm run build`）、`main` 分支和线上站点都不走这条入口。微应用在 `mapp/` 里用官方脚本构建，运行包是 `mapp/dist/package/app.zip`。

## 本地构建

```sh
cd mapp
bun install --frozen-lockfile
MINI_APP_ID=01a1cddd-b6e3-70d1-8132-f37aceee7d9c MINI_APP_VERSION=1.0.10 bun run build
```

清单里的应用 ID 已是「Doro个螺丝」应用页上的 `01a1cddd-b6e3-70d1-8132-f37aceee7d9c`。要改 ID 或版本时：

```sh
cd mapp && MINI_APP_ID=<应用页复制的 UUID> MINI_APP_VERSION=1.0.10 bun run build
```

需要带 source map 的调试包时在 `mapp/` 里用 `MINI_APP_DEBUG=1 bun run build`。官方要求正式发布去掉 source map；调试包只用于排查。

本分支打出的包（沙箱 ZIP 上限 4 096 KiB，即 4 194 304 字节）：

| 项 | 值 |
| --- | --- |
| 路径 | `mapp/dist/package/app.zip`（本地执行上面的命令生成，不入库） |
| 体积 | 3 713 693 字节（约 3.54 MiB，低于 3 900 KiB） |
| SHA-256 | `9be0f56ed9b652efbbe4f685284ef3faee49fdfd97bee323cedc0a3f53a82cc7` |
| 解压总量 / 文件数 | 见 `mapp/dist/package/app.zip`，156 个文件 |
| 应用 ID | `01a1cddd-b6e3-70d1-8132-f37aceee7d9c` |
| 版本 | `1.0.10` |
| 入口 | 单一 IIFE `app.js`，没有 `chunks/game.js` |

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
