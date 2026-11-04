# 夜班气象站 · 3D 翻书阅读器

手机优先的翻书页面：横屏双页摊开、竖屏单页、硬封面、书脊阴影、纸张厚度与真实折页动画。

- 线上地址：`https://13120740298z-lang.github.io/night-weather-station/book/`
- 页数：166 页（P.1–5 导读、P.6 总目录、P.7–166 正文 160 页）
- 页图：1600×2263、JPEG q80，共 97.6 MiB，来自 `reader_pages/`

## 目录结构

```
flipbook/
├── index.html          阅读器骨架
├── assets/reader.css   视觉：纸面、书脊、纸张厚度、控制条
├── assets/reader.js    翻页、懒加载、预取、跳页、热区
├── pages/              page_001.jpg … page_166.jpg
├── vendor/
│   ├── page-flip.browser.js   StPageFlip 2.0.7 浏览器包
│   └── page-flip.LICENSE      MIT 许可证原文
├── sync_pages.ps1      一条命令同步/校验页图
└── README.md
```

## 重建页图（换图后一条命令）

```powershell
powershell -ExecutionPolicy Bypass -File .\sync_pages.ps1
```

默认从另一个任务的产出目录 `reader_pages` 拷贝 166 张图并校验：
数量 166、首末页名、宽 1600px。换目录时传参：

```powershell
.\sync_pages.ps1 -Source "D:\somewhere\reader_pages"
```

## 本地预览

```powershell
python -m http.server 8123 --directory ..
# 打开 http://127.0.0.1:8123/flipbook/
```

## 选型：为什么是 StPageFlip（page-flip）

| 候选 | Star | 最后提交 | 许可证 | jQuery | 触摸 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| **Nodlik/StPageFlip** | 903 | 2024-01（代码 2021-04） | MIT | 无 | 有 | **选用** |
| blasten/turn.js | 7,495 | 2024-02 | non-commercial BSD | 必需 | 有 | 许可不干净，商用需授权 |
| 3d-flip-book 类仓库 | 51 以下 | 参差 | GPL / 无 | 无 | 部分 | 无跨页/硬封，维护弱 |
| BookBlock (Codrops) | — | 2013 示例 | 无明确许可 | 必需 | 弱 | 过时，jQuery 1.x |

选择理由：MIT 许可干净、零依赖、移动端触摸拖拽成熟、原生支持跨页/硬页/阴影/翻折；API 稳定，npm `page-flip@2.0.7` 仍被广泛引用。

## 实现要点

- **双页/单页**：`usePortrait` 由容器宽度自动切换；书宽 < 720px 时单页。
- **懒加载**：初始只加载 P.1、P.2、P.3（封面 + 第一跨页）并预取 P.4；翻页后窗口为当前 ±2/+3，预取下一跨页；距当前超过 7 页即卸载 `src`，避免 166 张 1600px 图解码爆内存。
- **动画**：`flippingTime: 720ms`，`drawShadow` + 硬页 `data-density="hard"`，实测 60fps、帧间差异明显（不是淡入淡出）。
- **交互**：自定义 pointer 手势（横向滑动 > 45px 翻页；点左/右 1/3 翻页），按钮 48×48、滑杆 44px、跳页输入 44px。
- **书脊/厚度**：书脊居中的 multiply 渐变；左右纸缘按矩形定位，封面/末页自动隐藏另一侧。

## 已知限制

1. StPageFlip 代码最后提交是 2021-04，仓库 2024 年只有文档/分支更新，**并非活跃维护项目**；选它是许可与完成度优先。
2. 为绕开库在 `disableFlipByClick=true` 时 `flipPrev` 被折角判定拦截的问题，调用瞬间临时关闭该开关；同时关闭了库的拖拽跟随（`useMouseEvents:false`），滑动是“松手后播放折页动画”，不是手指实时带纸。
3. 166 页共 97.6 MiB，单页约 0.59 MiB；首屏 4 张（封面 + 第一跨页 + 预取）约 2.4 MiB，弱网仍需等待。
4. 远页卸载后快速回翻可能先看到短暂加载转圈（通常命中 HTTP 缓存）。
5. 仅在 Chromium（Playwright 无头）与 390×844 / 844×390 / 1440×900 视口验证；iOS Safari 真机未测。
6. 横屏跨页时页码显示当前左页，右侧页不单独计数。

## 许可证

- StPageFlip © 2020 Nodlik，MIT，见 `vendor/page-flip.LICENSE`。
- 源码：https://github.com/Nodlik/StPageFlip
- 页面图片来自《夜班气象站》画册，版权归原作者所有。
