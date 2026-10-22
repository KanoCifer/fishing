#!/usr/bin/env python3
"""
压缩静态图片 —— scripts/assets/ 里的源图出发，产物落到 src/static/。

为什么静态图要专门压一遍：静态目录是**直接进代码包**的，
微信主包上限 2MB，一张 1.2MB 的 PNG 就吃掉半个包。
包在用户手机上要下载、解压、加载，图越大，首页越慢。

为什么产物不手搓：格式的选择带着**平台约束**，手改一次就丢一次 ——
而丢的代价不是「图丑了」，是「海报上那块插画压根没画出来」。

## 两张图为什么格式不同

**占位插画（spots）走 JPEG。**
它有两条使用路径，其中一条是 canvas：
`SpotShareSheet` 把它画进海报（`canvas.createImage()`）。
`createImage()` 的 src 官方只承诺**网络地址**与 **base64 Data URI**，
代码包内的本地路径不在承诺里，得先读成 base64（见 src/utils/canvasImage.ts）——
而 data URI 的 mime 必须跟真实格式对得上，对不上画布就解不出图。

所以这里选 JPEG：jpg 的 mime 推断那条路**已经存在**（同一张海报上的
小程序码 wxacode.jpg 就是 jpg，走的是同一条已验证的路）。
WebP 在这里有风险：mime 对不上必然解不出图，对得上也未必每个基础库都认 WebP。
少省 100KB 不值得拿「海报少一块图」去换。

**logo 走 WebP。**
它只出现在 `<image>` 里（AboutHeader），不进 canvas ——
`<image>` 对 WebP 的支持是稳的，而 WebP 带 alpha 且比 PNG 小一个量级。
PNG 版要多背 60KB，logo 又只有 120rpx 大，图里那些渐变经得起 WebP。
这条分工是本脚本存在的主要理由：手改很容易把 logo 也存成 PNG，白背 60KB。

**小程序码走灰度 PNG。**
它是黑白的二维码图，JPEG 恰恰是最不适合它的格式 ——
JPEG 把「白」也存成了一堆色度噪点，压缩时为了省那点色度信息，
把黑白边界也糊了。而这张码糊一点就扫不出来，扫不出来是它最硬的失败。
灰度 PNG 是无损的：亮度一格不差，色度噪点（纯 JPEG 产物）直接丢掉。
61.8KB → 21.5KB，而且边界比原来干净。

⚠️ **不能压成 1-bit。** 这张码的中间那只鱼是网点画的（半调），
不是实心模块 —— 阈值化会把它打成一片碎点，码直接废掉。
灰度是安全的那一档：不丢信息，只是换个无损的容器装。

## 参数

- JPEG quality 92 + **4:4:4 不做色度抽样**：这张图是大面积柔和渐变，
  4:2:0 的色度抽样正好在这种边缘上漏色。多花 39KB 换一条「肯定不漏」的底线。
- WebP quality 95：logo 有硬边（鱼身轮廓、太阳），质量再低边缘会发糊。
  透明通道保留 —— logo 是圆角方块，四角要透出页面底色。

## 用法

    python3 scripts/optimize-assets.py

改了 scripts/assets/ 里的源图就跑一遍，别直接改 src/static/ 里的产物 ——
产物是脚本的输出，改了就对不上了。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scripts" / "assets"
OUT_DIR = ROOT / "src" / "static"


# 每张图一条：源文件名、产物文件名、编码参数、以及为什么是这个格式。
JOBS = [
    {
        "src": "spots.png",
        "out": "spots.jpg",
        "format": "JPEG",
        "options": {"quality": 92, "subsampling": 0, "optimize": True},
        "note": "占位插画 —— 要进 canvas，海报路径上只认 jpg/png",
    },
    {
        "src": "logo.png",
        "out": "logo.webp",
        "format": "WEBP",
        "options": {"quality": 95, "method": 6},
        "note": "应用 logo —— 只在 <image> 里出现，WebP 带 alpha",
    },
    {
        "src": "wxacode.jpg",
        "out": "wxacode.png",
        "format": "PNG",
        "mode": "L",
        "options": {"optimize": True},
        "note": "小程序码 —— JPEG 会把黑白边界糊了，灰度 PNG 无损",
    },
]


def kb(size: int) -> str:
    return f"{size / 1024:.0f} KB"


def run(job: dict) -> None:
    src_path = SRC_DIR / job["src"]
    out_path = OUT_DIR / job["out"]

    if not src_path.exists():
        raise SystemExit(f"[error] 找不到源图：{src_path}")

    before = src_path.stat().st_size

    with Image.open(src_path) as im:
        if job.get("mode"):
            # 指定了模式就按它来（灰度 PNG 走这条）
            im = im.convert(job["mode"])
        elif job["format"] == "JPEG":
            # JPEG 不带 alpha 通道；这张占位插画本来也没有透明像素
            im = im.convert("RGB")
        else:
            im = im.convert("RGBA")
        im.save(out_path, job["format"], **job["options"])

    after = out_path.stat().st_size

    # 压完比原图还大，说明参数选错了 —— 那就宁可报错也别悄悄换回去
    if after >= before:
        out_path.unlink()
        raise SystemExit(
            f"[error] {job['src']} 压完反而更大（{kb(before)} → {kb(after)}），"
            "产物已删除。检查编码参数。"
        )

    saved = before - after
    print(
        f"  · {job['src']} → src/static/{job['out']}  "
        f"{kb(before)} → {kb(after)}（省 {kb(saved)}）  {job['note']}"
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("压缩静态图片：")
    for job in JOBS:
        run(job)
    print("完成。产物已进 src/static/，会随代码包一起发出去。")


if __name__ == "__main__":
    main()
