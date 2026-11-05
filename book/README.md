# 夜班气象站 · 漫画阅读站 v2

手机优先的《夜班气象站》在线阅读器：翻书、单页、竖滚、纯文字四种模式，支持捏合缩放、全屏/沉浸、目录跳册与进度记忆。

- 线上地址：<https://13120740298z-lang.github.io/night-weather-station/book/>
- 全书：166 页（P.1–5 导读、P.6 总目录、P.7–166 正文，共 80 册，每册 2 页）
- 手机档 `pages_m/`：宽 1000、WebP q72，共 27.6 MiB；桌面档 `pages_d/`：宽 1600、WebP q78，共 71.1 MiB
- 回退档 `pages_v4/`：原始 1600×2263 JPEG q80（103.4 MiB），浏览器不支持 WebP 时自动使用

## 三种阅读模式 + 文字模式

顶栏左侧「目录」按钮打开章节目录；底部 dock 四个标签随时切换：

| 模式 | 说明 | 手势 |
| --- | --- | --- |
| 翻书 | 双页摊开 + StPageFlip 折页动画（窄屏自动单页） | 左右滑动、点左/右 1/3、底部按钮 |
| 单页 | 一屏一页，手机单手翻 | 上下/左右滑动，点左/右 1/3 |
| 竖滚 | 连续下拉 webtoon，无翻页 | 原生滚动，进度随滚动记录 |
| 文字 | 纯文字层（80 册旁白 + 台词 + 导读） | 上册/下册切换，字号与主题可调 |

### 缩放（翻书 / 单页模式）

- **双指捏合**：1×–4× 实时缩放，以两指中点为中心；
- **双击**：放大到 2.4×（以双击点为中心），再次双击复位；
- **放大后拖移**：单指平移，边界自动回弹；
- 缩放状态（>1.01×）下横向滑动不会翻页，先复位再翻页。

### 全屏 / 沉浸

- 顶栏右侧「全屏」按钮：调用浏览器 Fullscreen API 并隐藏全部自有 UI；
- 全屏后轻点任意位置临时唤出工具栏，3.2 秒后自动隐藏；
- iOS Safari 不支持元素全屏时自动退化为**沉浸模式**：隐藏工具栏 + 隐藏状态栏区域（`viewport-fit=cover` + `safe-area-inset-*`），滚动时工具栏自动收起；
- `Esc` 或再次点击按钮退出全屏，退出后恢复工具栏与页面位置。

### 进度与目录

- 进度写入 `localStorage`（键 `nws.reader.v2`），同时保存模式、档位、文字设置；
- 重新打开自动回到上次页码，并提示「上次读到 P.xx」；
- 目录按「起 / 承 / 转 / 合」四阶段分组、可折叠，点任意册直接跳页；
- 底部进度滑块可快速拖到任意页，拖动时实时显示页码。

### 文字模式设置

- **字号**：A− / A＋，14–26px；
- **行距**：1.4 / 1.7 / 2.0 三档（设置面板）；
- **背景**：纸色 `#f4ecdb` / 护眼绿 `#d9e7d2` / 夜间黑 `#0a0f14`；
- **字重**：常规 / 中等，配合夜间底使用；
- 上下文固定：旁白与台词分色排版，按册分组，上册/下册一键切换。

## 目录结构

```
flipbook/
├── index.html                阅读器骨架（首屏 preload 按档位 media 选择）
├── assets/reader.css         视觉与布局（modes / themes / safe-area）
├── assets/reader.js          四种模式、手势、缩放、全屏、进度、文字渲染
├── assets/data/book.json     文字层与目录数据（101.6 KiB）
├── tools/build_tiers.py      WebP 档位图生成
├── tools/build_book_data.py  captions + story_guide → book.json
├── pages_m/                  手机档 1000px WebP（166 张）
├── pages_d/                  桌面档 1600px WebP（166 张）
├── pages_v4/                 JPEG 回退档（166 张，原图）
├── pages/                    更早版本存档，阅读器不再读取
├── vendor/                   StPageFlip 2.0.7（MIT）
├── sync_pages.ps1            同步/校验 pages_v4
├── shots/                    验收截图
└── README.md
```

## 重新生成档位图

依赖 Pillow：

```powershell
python -m pip install pillow
python tools\build_tiers.py              # 同时生成 pages_m 与 pages_d
python tools\build_tiers.py --only m     # 只重建手机档
python tools\build_tiers.py --force      # 忽略缓存，全部重建
```

- 输入：`pages_v4/page_*.jpg`（1600×2263）；
- 输出：`pages_m/`（1000×1414，WebP q72，method=6）与 `pages_d/`（1600×2263，WebP q78）；
- 每档生成 `manifest.json`，记录每页字节数、首屏与下一跨页预算；
- 换图流程：先用 `sync_pages.ps1` 更新 `pages_v4/`，再跑 `build_tiers.py --force`。

## 重新生成文字层数据

```powershell
python tools\build_book_data.py
```

读取 `captions/vol01..vol80.json` 与 `story_guide.md`，输出 `assets/data/book.json`。
页码映射：导读 P.1–5、总目录 P.6、正文 P.7 起，第 n 册占 `P.7+(n-1)*2` 与 `+1` 两页。

## 本地预览

```powershell
python -m http.server 8124 --directory ..
# 打开 http://127.0.0.1:8124/flipbook/
```

测试时可加 `?nohint=1` 关闭首次手势提示。

## 性能实测（Playwright + CDP 网络节流，390×844）

| 指标 | Fast 3G（1.6 Mbps / 150 ms） | 4G（4 Mbps / 60 ms） |
| --- | --- | --- |
| 可阅读（首图就绪） | 1.58 s | 0.71 s |
| 首屏总字节 | 130.9 KiB | 130.9 KiB |
| 首屏页图 | P.1 12.6 KiB | 12.6 KiB |
| 跳到未缓存的 P.83 | 150.2 KiB / 4.1 s | 150.2 KiB / 1.7 s |
| 下一跨页预取（2 页） | ≈ 171–342 KiB | 同左 |

- 首屏只加载 HTML/CSS/JS（≈118 KiB，Pages 开 gzip 后更小）与当前页图；目录数据延迟 300 ms 后加载；
- 翻书模式预取当前 ±2 页并在 ±8 页外卸载 `src`；单页/竖滚预取 ±2 页，竖滚用 IntersectionObserver 懒加载与卸载；
- 每页预算：手机档均值 170 KiB、最大 268 KiB；未缓存远页只取 1 页，不是整跨页。

## 已知限制

1. StPageFlip 最后代码提交为 2021-04，非活跃项目；选它是 MIT 许可与完成度优先。
2. 首屏 `startFirstImage` 与 `window.__reader` 初始化顺序导致 `perf.firstPageMs` 为 `null`，实际首图时延以上表「可阅读」为准。
3. 竖滚模式在大屏桌面下仍按屏宽铺满，页图被放大，清晰度受 1600px 源图限制。
4. 中文断行依赖浏览器默认规则，未做避头尾标点微调。
5. 仅在 Chromium（Playwright 无头）与 390×844 / 844×390 / 1440×900 验证；iOS Safari 真机未测，全屏走沉浸模式兜底。
6. 横屏双页的页码显示当前左页，右页不单独计数。

## 许可证

- StPageFlip © 2020 Nodlik，MIT，见 `vendor/page-flip.LICENSE`。
- 页面图片、文字来自《夜班气象站》画册，版权归原作者所有。
