#!/usr/bin/env python3
"""把 captions/*.json 与 story_guide.md 合成阅读器需要的 book.json（文字模式 / 目录 / 册信息）。

用法：python tools/build_book_data.py
输出：assets/data/book.json
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.dirname(ROOT)
CAPTIONS = r"C:\Users\18201\Documents\Trae-CN\temp_20261102_03\night_weather\captions"
GUIDE = r"C:\Users\18201\Documents\Trae-CN\temp_20261102_03\night_weather\story_guide.md"
OUT = os.path.join(ROOT, "assets", "data", "book.json")

TOTAL_PAGES = 166
GUIDE_END = 5
TOC_PAGE = 6
BODY_START = 7
PAGES_PER_VOL = 2
STAGE_ORDER = ["起", "承", "转", "合"]
STAGE_RANGE = {"起": [1, 20], "承": [21, 45], "转": [46, 65], "合": [66, 80]}


def parse_guide():
    with open(GUIDE, "r", encoding="utf-8") as f:
        text = f.read()
    lines = text.splitlines()
    one_liner = ""
    sections = []
    cur = None
    for raw in lines:
        line = raw.rstrip()
        if line.startswith("# "):
            continue
        if not one_liner and line.startswith("一句话："):
            one_liner = line.split("：", 1)[1]
            continue
        if line.startswith("## "):
            cur = {"title": line[3:].strip(), "body": []}
            sections.append(cur)
            continue
        if cur is not None and line.strip() and not line.startswith("#"):
            cur["body"].append(line.strip())
    # 每个段落单独存一条，前端按 <p> 渲染
    for s in sections:
        s["body"] = [p for p in s["body"] if p]
    return {"title": "通读导读", "oneLiner": one_liner, "sections": sections}


def parse_captions():
    vols = []
    for v in range(1, 81):
        path = os.path.join(CAPTIONS, f"vol{v:02d}.json")
        if not os.path.exists(path):
            raise SystemExit(f"缺 captions：{path}")
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
        start = BODY_START + (v - 1) * PAGES_PER_VOL
        panels = []
        for p in d.get("panels") or []:
            panels.append({
                "n": p.get("n"),
                "caption": p.get("caption") or "",
                "speaker": p.get("speaker"),
                "line": p.get("line"),
            })
        vols.append({
            "v": v,
            "title": d.get("title") or f"第{v}册",
            "stage": d.get("stage") or "",
            "synopsis": d.get("synopsis") or "",
            "range": [start, start + PAGES_PER_VOL - 1],
            "panels": panels,
        })
    return vols


def main():
    vols = parse_captions()
    guide = parse_guide()
    stages = []
    for key in STAGE_ORDER:
        lo, hi = STAGE_RANGE[key]
        item = next((s for s in guide["sections"] if s["title"].startswith(key)), None)
        stages.append({
            "key": key,
            "volRange": [lo, hi],
            "pageRange": [BODY_START + (lo - 1) * PAGES_PER_VOL, BODY_START + hi * PAGES_PER_VOL - 1],
            "title": item["title"] if item else key,
            "summary": item["body"][0] if item and item["body"] else "",
        })
    data = {
        "title": "夜班气象站",
        "subtitle": "80 册 · 160 页正文 + 5 页导读 + 总目录",
        "pages": {
            "total": TOTAL_PAGES, "guideStart": 1, "guideEnd": GUIDE_END,
            "tocPage": TOC_PAGE, "bodyStart": BODY_START, "pagesPerVolume": PAGES_PER_VOL,
        },
        "guide": guide,
        "stages": stages,
        "volumes": vols,
        "generatedAt": __import__("time").strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(payload)
    size = os.path.getsize(OUT)
    print(f"volumes={len(vols)} stages={len(stages)} sections={len(guide['sections'])} bytes={size} ({size/1024:.1f} KiB)")
    print("first:", vols[0]["title"], vols[0]["range"], "last:", vols[-1]["title"], vols[-1]["range"])


if __name__ == "__main__":
    main()
