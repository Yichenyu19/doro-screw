# Doro · 打个螺丝

一个面向手机和桌面浏览器的螺丝解谜小游戏。拆开叠放的玻璃板，把螺丝按颜色装盒，再用收集到的材料填完画册。

[在线玩 Doro R2](https://doro.suki520.com/)

修订 3 主线包含 10 关和 1,020 颗螺丝（在原第二关后插入两道短桥关）。完成第二关后开放残局解围和主题挑战。游戏支持长按检查、缩放、键盘视图操作、颜色辅助与轻柔动效。进度保存在当前浏览器中，可通过游戏菜单导出和导入恢复记录。

## 本地开发

使用 Node.js 22.12 或更高版本。

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

打开终端显示的本地地址。游戏使用 TypeScript、Vite 和 Phaser。

```sh
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

将 `dist/` 的内容部署到静态 HTTP 服务即可。仓库中的 `src/` 包含游戏逻辑和界面，`public/campaign/` 保存关卡数据，`public/runtime/` 保存运行素材，`tests/` 包含规则、物理、存档和操作相关测试。

## 许可证

项目原创代码及关卡数据采用 [MIT 许可证](LICENSE)。游戏美术和 Doro 同人形象的范围见 [素材说明](ASSETS.md)，依赖项目的授权见 [第三方声明](docs/THIRD-PARTY-NOTICES.txt)。
