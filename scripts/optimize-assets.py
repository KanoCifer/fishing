#!/usr/bin/env python3
"""
压缩静态图片 —— scripts/assets/ 里的源图出发，产物落到该去的地方。

为什么静态图要专门压一遍：静态目录是**直接进代码包**的，
微信主包上限 2MB，一张 1.2MB 的 PNG 就吃掉半个包。
包在用户手机上要下载、解压、加载，图越大，首页越慢。

为什么产物不手搓：格式的选择带着**平台约束**，手改一次就丢一次 ——
而丢的代价不是「图丑了」，是「海报上那块插画压根没画出来」。

## 产物去哪儿：两个地方

**进代码包（`src/static/`）**：几乎每次打开都要用的图。
包在用户手机上要下载、解压、加载，图越大，首页越慢。

**走 CDN（`scripts/assets/cdn/` 暂存，人工上传）**：只在少数场景才露面的图。
现在只有占位插画 spots —— 它只在「这条钓点没有照片」时才出现，
绝大多数会话根本用不上。放进包里等于让所有人替少数人下载 158KB。
产物出到暂存区，上传到 `VITE_CDN_BASE_URL` 下，代码里引的是那个地址
（见 `src/constants/spot-detail.ts`）。

⚠️ 搬去 CDN 之后，那个域名要在微信后台配成 **downloadFile 合法域名**，
否则 `<image>` 和海报的 `canvas.createImage()` 都拿不到图。
留在同一个脚本里是为了**两处永远一致**：改了源图跑一遍，
出来的 jpg 既是要上传的那份，也是本地能验的那份。

## 两张图为什么格式不同

**占位插画（spots）走 JPEG。**
它有两条使用路径，其中一条是 canvas：
`SpotShareSheet` 把它画进海报（`canvas.createImage()`）。
`createImage()` 的 src 官方只承诺**网络地址**与 **base64 Data URI**；
它现在就是网络地址（CDN），而 data URI 那条路（包内文件读成 base64）
只剩小程序码在用 —— 见 src/utils/canvasImage.ts。

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

产物落在两个地方：

- `src/static/` —— 直接进代码包，跑完即用，不用管。
- `scripts/assets/cdn/` —— **要自己上传**。上传到 `VITE_CDN_BASE_URL` 下
  （同名文件覆盖），代码里引的就是那个地址。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scripts" / "assets"
OUT_DIR = ROOT / "src" / "static"
# 要上传到 CDN 的图的暂存区。
# 放在 scripts/assets/ 底下 —— 产物是脚本的输出，不进代码包，也不用提交。
CDN_DIR = SRC_DIR / "cdn"


# 每张图一条：源文件名、产物文件名、编码参数、产物去哪儿、以及为什么是这个格式。
# dest 缺省是代码包（src/static）；"cdn" 表示产物出到暂存区，等人工上传。
JOBS = [
    {
        "src": "spots.png",
        "out": "spots.jpg",
        "format": "JPEG",
        "mode": "RGB",
        "options": {"quality": 92, "subsampling": 0, "optimize": True},
        "dest": "cdn",
        "note": "占位插画 —— 走 CDN，不进代码包；要进 canvas，海报路径上只认 jpg/png",
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
    out_dir = CDN_DIR if job.get("dest") == "cdn" else OUT_DIR
    out_path = out_dir / job["out"]
    out_dir.mkdir(parents=True, exist_ok=True)

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
    # 产物路径要说清楚 —— 两个去处的手续不一样
    where = "scripts/assets/cdn" if job.get("dest") == "cdn" else "src/static"
    print(
        f"  · {job['src']} → {where}/{job['out']}  "
        f"{kb(before)} → {kb(after)}（省 {kb(saved)}）  {job['note']}"
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("压缩静态图片：")
    for job in JOBS:
        run(job)

    cdn_jobs = [job for job in JOBS if job.get("dest") == "cdn"]
    if cdn_jobs:
        print()
        print("要自己上传的（不会进代码包）：")
        for job in cdn_jobs:
            print(f"  · scripts/assets/cdn/{job['out']} → $VITE_CDN_BASE_URL/{job['out']}")
        print("  上传后确认那个域名在微信后台的 downloadFile 合法域名里。")

    print()
    print("完成。src/static/ 里的会随代码包一起发出去。")


if __name__ == "__main__":
    main()
