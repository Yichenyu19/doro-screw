# 素材说明

`public/runtime/` 包含运行所需的 WebP 图片，包括角色、螺丝、玻璃板、界面图集、背景和画册。项目为这些素材生成了原图，随后裁切、缩放并导出运行版本。修订 4 起，运行时音效以 `public/sfx/` 的短采样为主，辅以程序化合成层（入盒音阶、收尾和弦、撤回、界面与暂存满）。采样编码为低码率 Ogg Vorbis，十八个文件合计约 0.092 MiB。构建脚本为 `scripts/build-sfx.py`，计量脚本为 `scripts/measure-sfx.py`。试听 WAV、叠加混音与频谱图见 `/workspace/doro-screw-review/sfx-v3/` 与 `docs/sfx-design.md`。音效未经人耳验收。

### 第三方音效来源与许可

检索方法：优先看 Freesound 下载量与评分数（高票数优于高均分）、上传者对录音声源的描述，再用 ffmpeg 看时长和峰值。Pixabay 本机返回 HTTP 403，未能检索。Kenney 的 UI/游戏包页面能打开，但新的 `/download-link/` 接口在本环境返回 403，未能取得官方 zip，因此发行包里没有 Kenney 文件。撤回、界面确认、画册翻开和暂存满以程序化合成为主，体积更小。

实际采用（均为裁切、均衡与限幅后的短片段，峰值目标 ≤ −1 dBTP）：

| 用途 | 来源 | 许可 | 证据（检索时） | 采用理由 |
| --- | --- | --- | --- | --- |
| 拧出摩擦 | Freesound 353245 *screwing and unscrewing brass*，裁约 5.492s 起 0.28s；叠加 442313 *Metal Tssht*、181635 *Tools Screw Clamp* 片段 | CC0 | 353245 ↓1019 ★4.9(14)；442313 ↓447 ★5.0(5)；181635 ↓1943 ★4.8(13)，描述为金属螺丝夹近距录音 | 描述明确是黄铜拧动/金属螺丝夹，不是口技或合成器 |
| 松开 | Freesound 706440 *Flashlight battery compartment unscrew*，裁约 3.17s 起 0.40s | CC0 | ↓124 ★5.0(4) | 票数不多，但描述是电池舱拧盖，声源对得上 |
| 入盒叮 | Freesound 220179 *Click Metal Ting*（↓1196 ★5.0(8)），再叠 C5 / E5 / G5 | CC0 | 短、有金属余响，适合入盒进度 | |
| 装满收尾 | Mixkit 2936 *Wine glass clink*，叠合成 C–E–G | Mixkit 音效许可 | 玻璃叮作为盒盖收束；不再用菜单上行占主声，以免和通关撞车 | |
| 整板落地 | Mixkit 3158 *Thin metal plate drop* + 835 *Metal tool drop* | Mixkit 音效许可 | 薄板落地，给清层重量 | |
| 塑料/辅助 | Freesound 63531 *click1*（↓6138 ★4.6(30)，描述为 plastic click）+ 448393 塑料把手解锁片段 | CC0 | 63531 下载量高、明确塑料 | |
| 卡住/卡扣 | Freesound 582904、822397 | CC0 | 短金属卡扣；822397 另倒放后用于撤回 | |
| 破墙锤击 | Mixkit 833 *Metal hammer hit* | Mixkit 音效许可 | 只进入第二关破墙，不当普通落板 | |
| 揭示上行点缀 | Freesound 422516 *Menu FX 03 (ascending)*（↓1513 ★4.8(30)） | CC0 | 铁丝雕塑敲击上行；v3 大幅降低增益，只作揭示辅层 | |

Mixkit 音效按 https://mixkit.co/license/ 的 Sound Effects 许可使用（免费用于商业与非商业项目；本仓库仍列出文件名以便追溯）。Freesound 条目均为 CC0，不强制署名，仍记作者作品名以便查源。未使用 BY-NC 素材。若权利人或许可页变更，应替换对应文件后重新打包。

站点图标与分享图（`public/favicon.ico`、`public/og-image.jpg` 等）由上述运行角色与标志图生成，适用同一同人与版权风险说明。
