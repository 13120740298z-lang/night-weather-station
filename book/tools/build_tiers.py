#!/usr/bin/env python3
"""从 pages_v4 的 1600px JPEG 母版生成手机/桌面 WebP 档位图。

用法：
  python tools/build_tiers.py            # 缺什么补什么
  python tools/build_tiers.py --force    # 全部重压
  python tools/build_tiers.py --only m   # 只做手机档

输出：
  pages_m/page_001.webp …  宽 1000、q72
  pages_d/page_001.webp …  宽 1600、q78
  各自目录下的 manifest.json（含每页字节数，供阅读器做预取预算）
"""
import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "pages_v4")
SRC_MANIFEST = os.path.join(SRC, "manifest.json")

TIERS = {
    "m": {"dir": "pages_m", "width": 1000, "quality": 72, "method": 6, "label": "手机档"},
    "d": {"dir": "pages_d", "width": 1600, "quality": 78, "method": 6, "label": "桌面档"},
}


def load_source():
    with open(SRC_MANIFEST, "r", encoding="utf-8") as f:
        data = json.load(f)
    pages = data["pages"]
    pages.sort(key=lambda p: p["page"])
    for i, p in enumerate(pages):
        if p["page"] != i + 1:
            raise SystemExit(f"源 manifest 页码不连续：第 {i + 1} 项是 P.{p['page']}")
        p["path"] = os.path.join(SRC, p["file"])
        if not os.path.exists(p["path"]):
            raise SystemExit(f"缺页图：{p['path']}")
    return pages


def convert(job):
    page = job["page"]
    src = job["path"]
    cfg = job["cfg"]
    out_dir = os.path.join(ROOT, cfg["dir"])
    out = os.path.join(out_dir, f"page_{page:03d}.webp")
    if job["skip"] and os.path.exists(out):
        st = os.stat(out)
        with Image.open(out) as im:
            w, h = im.size
        return {"page": page, "file": os.path.basename(out), "bytes": st.st_size, "w": w, "h": h, "cached": True}

    with Image.open(src) as im:
        im = im.convert("RGB")
        if im.width != cfg["width"]:
            h = round(im.height * cfg["width"] / im.width)
            im = im.resize((cfg["width"], h), Image.LANCZOS)
        im.save(out, "WEBP", quality=cfg["quality"], method=cfg["method"], exact=False)
        w, h = im.size
    return {"page": page, "file": os.path.basename(out), "bytes": os.path.getsize(out), "w": w, "h": h, "cached": False}


def build(tier_key, pages, force, workers):
    cfg = TIERS[tier_key]
    out_dir = os.path.join(ROOT, cfg["dir"])
    os.makedirs(out_dir, exist_ok=True)
    jobs = [{"page": p["page"], "path": p["path"], "cfg": cfg, "skip": not force} for p in pages]

    t0 = time.time()
    results = []
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(convert, j) for j in jobs]
        for fut in as_completed(futs):
            results.append(fut.result())
            done += 1
            if done % 20 == 0 or done == len(jobs):
                print(f"  {cfg['label']} {done}/{len(jobs)}", flush=True)
    results.sort(key=lambda r: r["page"])

    total = sum(r["bytes"] for r in results)
    manifest = {
        "version": "v5-webp",
        "tier": tier_key,
        "width": cfg["width"],
        "quality": cfg["quality"],
        "format": "webp",
        "page_count": len(results),
        "source": "pages_v4 (1600px JPEG q80)",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "total_bytes": total,
        "pages": [{k: r[k] for k in ("page", "file", "bytes", "w", "h")} for r in results],
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    first = sum(r["bytes"] for r in results[:3])
    next_spread = sum(r["bytes"] for r in results[3:5])
    max_single = max(r["bytes"] for r in results)
    report = {
        "tier": tier_key,
        "width": cfg["width"],
        "quality": cfg["quality"],
        "total_bytes": total,
        "total_mib": round(total / 1048576, 2),
        "avg_kib": round(total / len(results) / 1024, 1),
        "first_screen_3pages_kib": round(first / 1024, 1),
        "next_spread_2pages_kib": round(next_spread / 1024, 1),
        "max_single_kib": round(max_single / 1024, 1),
        "seconds": round(time.time() - t0, 1),
        "reused": sum(1 for r in results if r["cached"]),
    }
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", choices=["m", "d"], default=None)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    if not os.path.exists(SRC_MANIFEST):
        raise SystemExit(f"找不到母版清单：{SRC_MANIFEST}")
    pages = load_source()
    print(f"母版 {len(pages)} 页")

    keys = [args.only] if args.only else ["m", "d"]
    reports = []
    for k in keys:
        print(f"[{TIERS[k]['label']}] {TIERS[k]['width']}px q{TIERS[k]['quality']} → {TIERS[k]['dir']}/")
        reports.append(build(k, pages, args.force, args.workers))

    print(json.dumps(reports, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
