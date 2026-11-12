# Linux DO 微应用适配（阶段 E）

本目录是提审材料草稿和本地验收说明。官方文档以 [linux-do/mapp-developer-guide](https://github.com/linux-do/mapp-developer-guide) 为准，当前对照的是该仓库提交 `ae0b523297a8c25314304f2cd92270badc0ac629`。

**不要把这里的材料当成已经提交。** 本分支不会代替任何人登录 Linux DO，也不会上传 `app.zip` 或发起正式审核。

网站版构建（`npm run build`）、`main` 分支和线上站点都不走这条入口。微应用使用 `npm run build:mapp`，产物在 `dist-mapp/`（已 gitignore），运行包是 `dist-mapp/package/app.zip`。

## 本地构建

```sh
npm run build:mapp
```

将官方应用页分配的 ID 写入清单后再打一次包（占位符 ID 不能用于上传）：

```sh
MINI_APP_ID=<应用页复制的 UUID> MINI_APP_VERSION=1.0.0 npm run build:mapp
```

需要带 source map 的调试包时用 `npm run build:mapp:debug`。官方要求正式发布去掉 source map；调试包只用于沙箱。

本分支打出的参考包（清单仍是占位符 ID `019a0d0d-0000-7000-8000-00000000d0d0`）：

| 项 | 值 |
| --- | --- |
| 路径 | `dist-mapp/package/app.zip`（需本地执行 `npm run build:mapp` 生成，不入库） |
| 体积 | 7 616 266 字节（约 7.26 MiB） |
| SHA-256 | `8756baf338bfa7694820828d6df4381e581f9ad33f9e122d9ac3a68364a26969` |
| 解压总量 / 文件数 | 8 813 816 字节（约 8.41 MiB） / 156 个文件 |
| 版本 | `1.0.0` |
| 最大单文件 | `app.js` 1 626 350 字节（约 1.55 MiB） |

换成真实应用 ID 后，ZIP 的 SHA-256 会变。同一份 SHA-256 再次上传会被平台拒绝（`BUILD_EXISTS`），过期构建也不例外。

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
