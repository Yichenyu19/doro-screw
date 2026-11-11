# 声音设计说明（修订 4）

听力状态：**未经耳听。** 本说明只依据检索证据（下载量、评分数、上传者描述）、ffmpeg 测量（时长、能量位置、真峰值、RMS）与分层混音规则，不能代替人耳验收。试听文件在 `/workspace/doro-screw-review/sfx-v2/*.wav`。发行文件是 `public/sfx/*.ogg`，合计 **89 345 字节（0.085 MiB）**，低于 1.5 MiB 上限。

门限（按 audio-mixing / procedural-audio）：短音效的 Integrated LUFS 常落到 −70（片段太短，ebur128 给不出有意义的响度），因此不以 Integrated LUFS 作为通过条件。实际门限是 **真峰值 ≤ −1 dBTP**，并用 max volume 与 RMS 做层间对比。本批全部真峰值在 −4.7 到 −1.6 dBTP 之间，无削波。运行时另有 ±3% 音高、±8% 音量抖动、6 路复音上限和同类短间隔合并，避免连点机枪声和叠加削波。

## 检索与不可达来源

按 sxsound `sfx-sources` 的方法，用 `python3 /workspace/sxsound/sfx-sources/scripts/sfx.py` 检索与下载。

- **Kenney**：优先考虑用于点击/入盒。目录页可打开，但当前站点用 `initiateDownload` + `https://kenney.nl/download-link/<hex>`，本环境请求返回 `{"error":"forbidden"}` / HTTP 403，**未能取得官方 zip，发行包不含 Kenney 文件。**
- **Pixabay**：按下载量排序检索，本环境（含 curl_cffi）返回 HTTP 403，**未能检索或下载。**
- **Freesound**：可检索。只用 **CC0**；本批未采用需署名的 BY，也未采用 BY-NC。
- **Mixkit**：可下载。按其 Sound Effects 许可使用（不强制署名，仍写入 `ASSETS.md`）。

下载原文件仅作构建输入，不进仓库，路径 `/tmp/doro-sfx-raw/`。构建脚本：`scripts/build-sfx.py`。

## 候选、证据与最终选择

票数（括号内是评分数）优先于单纯均分。描述要能对上金属螺丝、玻璃或塑料声源，而不是口技或合成器。时长与能量位置用 ffmpeg 实测。

### 拧出 / 金属摩擦（`pick.ogg`）

| 候选 | 许可 | 证据 | 实测 | 结论 |
| --- | --- | --- | --- | --- |
| Freesound 353245 *screwing and unscrewing brass* | CC0 | ↓1019 ★4.9（14） | 33.9 s，能量峰约 5.492 s，原真峰值略超 0 | **主层**。描述明确是黄铜拧动，裁 5.492 s 起 0.32 s，高通 120 Hz |
| Freesound 181635 *Tools Screw Clamp* | CC0 | ↓1943 ★4.8（13），近距金属螺丝夹 | 12.2 s，能量约 10.62 s，原真峰值约 +1.5 dB | **辅层**。票数更高，但过长且削波，只取 0.35 s 并限幅 |
| Freesound 442313 *Metal Tssht* | CC0 | ↓447 ★5.0（5） | 0.10 s，原真峰值略超 0 | **起音层**，补金属摩擦的前缘 |
| Freesound 457460 *Karabiner click and screw* | CC0 | ↓579 ★4.9（9），Zoom H4n | 同时含卡扣与螺丝，入盒和拧出职责不清 | 未作主层，避免一个音同时冒充两件事 |
| Freesound 706440 *Flashlight battery compartment unscrew* | CC0 | ↓124 ★5.0（4） | 能量约 3.17 s | 留给松开，不与拧出抢同一条录音 |

最终：353245 主层 + 442313 起音 + 181635 轻辅，峰值归一到 0.72。成片 0.35 s，真峰值 −2.9 dBTP，RMS −24.8 dB。

### 单钉松开（`loosen.ogg`）

| 候选 | 许可 | 证据 | 结论 |
| --- | --- | --- | --- |
| Freesound 706440 手电筒电池舱拧盖 | CC0 | ↓124 ★5.0（4），描述对得上“拧松” | **主层**，裁 3.17 s 起 0.42 s |
| Freesound 181635 螺丝夹 | CC0 | 见上 | 低音量辅层，避免两次都只用黄铜 |

成片 0.42 s，真峰值 −4.2 dBTP，RMS −26.7 dB，比拧出略弱、略长。

### 入盒叮 / 升调（`arrive-0/1/2.ogg`）

Kenney UI 点击本应优先，源不可达。Freesound / Mixkit 候选：

| 候选 | 许可 | 证据 | 结论 |
| --- | --- | --- | --- |
| Freesound 220179 *Click Metal Ting* | CC0 | ↓1196 ★5.0（8），0.55 s，短金属 click + 高音 ting | **主层** |
| Freesound 422516 *Menu FX 03 (ascending)* | CC0 | ↓1513 ★4.8（30），0.29 s，铁丝雕塑敲击上行 | 留给装满和弦和揭示，不占入盒主声 |
| Mixkit 1109 *Select click* / 1117 *Classic click* | Mixkit | 通用 UI 点击；1117 原真峰值约 +0.2 | 偏塑料菜单，金属感不如 220179 |
| Mixkit 2936 *Wine glass clink* | Mixkit | 短玻璃叮 | 第三颗入盒的轻辅，不做前两颗主声 |

最终：同一金属 ting 上叠合成正弦 520 / 620 / 740 Hz（第三颗再加一点玻璃），形成盒内升调。成片真峰值 −3.1 / −3.1 / −2.6 dBTP。

### 装满和弦（`box.ogg`）与回流（`refill.ogg`）

`box`：Mixkit 2936 玻璃叮 + Freesound 422516 上行短音 + 合成 C5–E5–G5（523/659/784 Hz）。0.55 s，真峰值 −1.9 dBTP。

`refill`：Freesound 822397 *small metal clasp*（CC0，短金属卡扣）+ 660→880、880→1100 Hz 短滑音。0.18 s，真峰值 −3.7 dBTP，故意短、轻，避免盖过入盒。

未采用 Mixkit 2836 *Glasses clinking*：比 2936 更碎、更长，装满收尾不够干净。

### 整板落地（`fall.ogg`）与新层露出（`reveal.ogg`）

| 候选 | 许可 | 证据 | 结论 |
| --- | --- | --- | --- |
| Mixkit 3158 *Thin metal plate drop* | Mixkit | 薄金属板落地 | **主层** |
| Mixkit 835 *Metal tool drop* | Mixkit | 金属工具落地 | 低音量辅层 |
| 合成 70→42 Hz | 自制 | 给质量感，避免只有金属亮边 | 低频层 |
| Mixkit 833 *Metal hammer hit* | Mixkit | 锤击 | 留给破墙，不当普通落板 |

`fall` 0.70 s，真峰值 −1.6 dBTP。`reveal` 用 422516 上行加 1240→1860 Hz 短滑音，0.245 s，真峰值 −4.3 dBTP，比落板更轻。

### 辅助按钮（`tool.ogg`）与卡住（`blocked.ogg`）

| 候选 | 许可 | 证据 | 结论 |
| --- | --- | --- | --- |
| Freesound 63531 *click1* | CC0 | ↓6138 ★4.6（30），上传者写 plastic click | **主层**。票数明显高于同系列 63532 |
| Freesound 63532 *click2* | CC0 | 同作者塑料点击 | 备用，未进成片，避免两颗按钮听起来像拷贝 |
| Freesound 448393 *Satisfying Plastic Handle Unlock*，裁 0.48 s 起 | CC0 | ↓2344，塑料把手解锁 | 辅层 |
| Freesound 582904 *Snap Click 03* | CC0 | 短金属/塑料卡扣，约 0.2 s | **卡住** 主层，再加 160→110 Hz 闷音 |

`tool` 0.35 s，−3.5 dBTP；`blocked` 0.18 s，−4.7 dBTP。

### 通关（`win.ogg`）与第二关破墙（`wall.ogg`）

`win`：玻璃叮 + 上行短音 + C–E–G–C 和弦（523/659/784/1047 Hz），0.55 s，−1.9 dBTP，短而清楚，不做长号角。

`wall`：Mixkit 833 锤击 + 薄板落地 + 玻璃叮 + 上行短音 + 196→98 / 392 / 587 Hz，0.70 s，−1.6 dBTP。只在主线第二关通关时播放。比普通通关更有重量，仍控制在 0.7 s 内。

`chain` 用于连消点缀，结构接近 win 的短版，−2.9 dBTP。

## 成片计量

数据来自 ffmpeg `ebur128=peak=true` 与 `volumedetect`，完整 JSON 见 `/workspace/doro-screw-review/sfx-v2/measurements.json`。

| 文件 | 时长 s | 真峰值 dBTP | max vol dB | RMS dB | ogg 字节 |
| --- | ---: | ---: | ---: | ---: | ---: |
| pick | 0.35 | −2.9 | −2.9 | −24.8 | 6325 |
| loosen | 0.42 | −4.2 | −4.2 | −26.7 | 7005 |
| arrive-0 | 0.42 | −3.1 | −3.1 | −20.0 | 5543 |
| arrive-1 | 0.42 | −3.1 | −3.1 | −20.1 | 5529 |
| arrive-2 | 0.55 | −2.6 | −2.6 | −22.5 | 5929 |
| box | 0.55 | −1.9 | −1.9 | −21.6 | 6324 |
| refill | 0.18 | −3.7 | −3.7 | −30.1 | 4960 |
| fall | 0.70 | −1.6 | −2.2 | −22.2 | 9567 |
| reveal | 0.245 | −4.3 | −4.4 | −18.7 | 5131 |
| tool | 0.35 | −3.5 | −3.7 | −24.9 | 6287 |
| blocked | 0.18 | −4.7 | −5.2 | −22.2 | 4377 |
| chain | 0.55 | −2.9 | −2.9 | −20.7 | 6357 |
| win | 0.55 | −1.9 | −1.9 | −21.4 | 6304 |
| wall | 0.70 | −1.6 | −2.2 | −21.1 | 9707 |

运行时：`src/audio.ts` 先加载对应 ogg，失败则回退到 `SYNTH_RECIPES`。开关、页面隐藏静音、减弱动效（只减动画，不自动静音）行为保持不变。

请用仓库外的试听 WAV 听一遍再定稿。若某条过亮、过闷或与画面错位，应改 `scripts/build-sfx.py` 的裁切或增益后重编，不要直接拉高运行时音量。
