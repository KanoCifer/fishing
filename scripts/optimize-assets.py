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

**小程序码走无损 PNG。**
它是微信的**彩色**小程序码：中间蓝鱼黄圈、右下角绿色微信角标。
所以只能存成 PNG —— JPEG 会把「黄」和「绿」压出色度噪点，
而那张码靠对比度识别，糊了就扫不出来。
PNG 无损，边界比 JPEG 干净，体积还小（52KB → 44KB）。

⚠️ **不能压成 1-bit，也不能转灰度。**
- 1-bit：这张码中间的鱼是网点画的（半调），不是实心模块 ——
  阈值化会把它打成一片碎点，码直接废掉。
- 灰度：更隐蔽。那张码**八成像素确实是灰的**（白底 + 黑环占了绝大多数），
  于是很容易得出「这本来就是张灰度图，转一下无损」的结论 ——
  但剩下那两成是整张码的品牌：蓝鱼、黄圈、绿角标。
  转灰度看着「没损失多少像素」，实际上把那部分全弄没了。
  **按面积算比例会骗人，要看那部分是什么。**

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
        "mode": "RGB",
        "options": {"quality": 92, "subsampling": 0, "optimize": True},
        "note": "占位插画 —— 要进 canvas，海报路径上只认 jpg/png",
    },
    {
        "src": "logo.png",
        "out": "logo.webp",
        "format": "WEBP",
        "mode": "RGBA",
        "options": {"quality": 95, "method": 6},
        "note": "应用 logo —— 只在 <image> 里出现，WebP 带 alpha",
    },
    {
        "src": "wxacode.jpg",
        "out": "wxacode.png",
        "format": "PNG",
        "mode": "RGB",
        "options": {"optimize": True},
        "note": "小程序码 —— 彩色，不能转灰度；JPEG 会糊掉边界",
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
        # 模式逐张定死，不靠「反正先转 RGBA」——
        # 给一张本来不透明的图加透明通道，白白多几 KB 包体，
        # 而那些像素永远是 alpha=255，透明通道一点用没有。
        if job.get("mode"):
            im = im.convert(job["mode"])
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
