# 素材说明

`public/runtime/` 包含运行所需的 WebP 图片，包括角色、螺丝、玻璃板、界面图集、背景和画册。项目为这些素材生成了原图，随后裁切、缩放并导出运行版本。修订 4 起，运行时音效以 `public/sfx/` 的短采样为主，辅以少量合成层，详见下文。

## 角色与版权风险

Doro 是源自《胜利女神：妮姬》（GODDESS OF VICTORY: NIKKE）角色 Dorothy 的同人形象。本项目为非官方同人作品，与 Shift Up、Nexon 或《妮姬》的权利人没有合作、授权或隶属关系。角色、名称及相关标识的权利归各权利人所有。

仓库中的 MIT 许可证**只适用于**项目原创代码和关卡数据，**不构成**对 Dorothy / 《妮姬》角色或标识的再授权。运行美术是为这款同人游戏制作的派生向素材，随游戏展示；单独提取、再分发、用于其他项目或任何商业使用前，须自行向相应权利人核实授权。权利人如果提出异议，作者可能需要修改、替换或下架相关形象与站点内容。把本仓库或构建产物当作已获官方许可使用，是不安全的。

开发时参考过公开的拆螺丝游戏录像。录像、抽帧和对照图属于开发参考，仓库中的运行素材为本项目制作。

修订 4 起，运行时音效以短采样为主，辅以少量合成层（装箱升调和收尾和弦）。采样编码为低码率 Ogg Vorbis，全部放在 `public/sfx/`，合计约 0.085 MiB。构建脚本为 `scripts/build-sfx.py`。试听 WAV 与计量见 `/workspace/doro-screw-review/sfx-v2/` 与 `docs/sfx-design.md`。音效未经人耳验收。

### 第三方音效来源与许可

检索按 [sxsound/sfx-sources](https://github.com) 的方法：优先看 Freesound 下载量与评分数（高票数优于高均分）、上传者对录音声源的描述，再用 ffmpeg 看时长和峰值。Pixabay 本机返回 HTTP 403，未能检索。Kenney 的 UI/游戏包页面能打开，但新的 `/download-link/` 接口在本环境返回 403，未能取得官方 zip，因此发行包里没有 Kenney 文件。

实际采用（均为裁切与限幅后的短片段，峰值目标 ≤ −1 dBTP）：

| 用途 | 来源 | 许可 | 证据（检索时） | 采用理由 |
| --- | --- | --- | --- | --- |
| 拧出摩擦 | Freesound 353245 *screwing and unscrewing brass*，裁 5.492s 起 0.32s；叠加 442313 *Metal Tssht*、181635 *Tools Screw Clamp* 片段 | CC0 | 353245 ↓1019 ★4.9(14)；442313 ↓447 ★5.0(5)；181635 ↓1943 ★4.8(13)，描述为金属螺丝夹近距录音 | 描述明确是黄铜拧动/金属螺丝夹，不是口技或合成器 |
| 松开 | Freesound 706440 *Flashlight battery compartment unscrew*，裁 3.17s 起 0.42s | CC0 | ↓124 ★5.0(4) | 票数不多，但描述是电池舱拧盖，声源对得上 |
| 入盒叮 | Freesound 220179 *Click Metal Ting*（↓1196 ★5.0(8)，0.55s，描述为短金属 click + 高音 ting） | CC0 | 短、有金属余响，适合入盒 | |
| 装满收尾 | Mixkit 2936 *Wine glass clink* + Freesound 422516 *Menu FX 03 (ascending)*（↓1513 ★4.8(30)，铁丝雕塑敲击上行） | Mixkit 音效许可 / CC0 | 玻璃叮作为盒盖收束；上行短音作和弦点缀 | |
| 整板落地 | Mixkit 3158 *Thin metal plate drop* + 835 *Metal tool drop* | Mixkit 音效许可 | 薄板落地，时长约 1.3s，真峰值约 −2.7 dB | |
| 塑料/辅助 | Freesound 63531 *click1*（↓6138 ★4.6(30)，描述为 plastic click）+ 448393 塑料把手解锁片段 | CC0 | 63531 下载量高、明确塑料 | |
| 卡住/卡扣 | Freesound 582904、822397 | CC0 | 短金属卡扣，0.2s 左右 | |
| 玻璃碰金属（入盒第三颗、通关层） | Mixkit 2183 *Glass hitting a metal* | Mixkit 音效许可 | 玻璃击金属，0.56s | |

Mixkit 音效按 https://mixkit.co/license/ 的 Sound Effects 许可使用（免费用于商业与非商业项目；本仓库仍列出文件名以便追溯）。Freesound 条目均为 CC0，不强制署名，仍记作者作品名以便查源。未使用 BY-NC 素材。若权利人或许可页变更，应替换对应文件后重新打包。


站点图标与分享图（`public/favicon.ico`、`public/og-image.jpg` 等）由上述运行角色与标志图生成，适用同一同人与版权风险说明。
