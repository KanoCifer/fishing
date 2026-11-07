#!/usr/bin/env python3
"""
生成 tabBar 图标 —— 钓点（地图钉）/ 数据（趋势线）/ 记录 / 我的，各含未选中与选中两态。

这个脚本只管**颜色**，不管图形。

图形是设计稿导出的静态资源（src/static/tabbar/*.png，随包进来）。
颜色是令牌层的值，而令牌层读不到 PNG —— 所以这里把令牌层的色值烤进图里，
改色只改这一个文件（COLOR_* 四个常量），图形一个字都不动。

为什么图形不能由脚本重画：脚本里画过一套（地图钉、折线、人形），
但那套画法早就跟设计稿对不上了。重画会把在用的图形换成旧版 ——
那是产品改动，不该由跑一次脚本顺手做掉。改图形要改设计稿，不是改这个脚本。

深色那套从浅色那套换色派生：换色保证两套形状完全一致，
同一枚图标在浅色下和深色下差半像素，切主题时看着就是一枚图标跳了一下。

尺寸按微信的官方建议：81×81 px，正方形透明底，图标本身留出四周安全边距
（微信会按 tabBar 实际高度等比缩放，图形顶到边会被切掉一截）。
"""

from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - 环境问题，不是逻辑问题
    raise SystemExit(
        "这个脚本需要 Pillow。项目里的解释器是 .venv-assets/bin/python：\n"
        "  .venv-assets/bin/python scripts/tabbar-icons.py"
    ) from exc

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "static" / "tabbar"

"""
未选中 / 选中两态的色值，必须与令牌层 _color.scss 对齐。

选中态是 $fish-blue（浅色 #0f66d6）而不是 systemBlue（#007aff）：
底栏的文字用令牌蓝，图标烤成另一个蓝，同一个选中态就是两个蓝 ——
令牌是唯一那一份，两边都得跟它走。

未选中这一档取 $fish-muted-60（#666666）：底栏里未选中的图标与文字是同一个档，
图标烤进 PNG、文字写在 index.wxss 里，两边必须同色 ——
以前图标烤的是 #3c3c43、文字写的是 #666666，同一个状态两种灰。
"""
COLOR_IDLE = (102, 102, 102, 255)  # #666666 = $fish-muted-60
COLOR_ACTIVE = (15, 102, 214, 255)  # #0f66d6 = $fish-blue

# 深色两态。
#
# 未选中的那一档在浅色下是 #666666 —— 压在深色底上几乎看不见，
# 所以深色必须另出一套，不能拿浅色图凑合。
#
# 取值与 src/styles/theme.scss 的深色段一致：
# 辅助文字 #8e939c（--fish-muted-60）、品牌蓝 #4c9bff（--fish-blue-600 的深色档）。
COLOR_IDLE_DARK = (142, 147, 156, 255)  # #8e939c = --fish-muted-60
COLOR_ACTIVE_DARK = (76, 155, 255, 255)  # #4c9bff = --fish-blue-600（深色档）

# 图标名与它对应的态。深色那套从浅色那套换色派生，所以名单只有浅色这一份。
LIGHT_NAMES = (
    "spots",
    "spots-active",
    "data",
    "data-active",
    "mine",
    "mine-active",
    "records",
    "records-active",
)


def recolor(src: Path, dst: Path, color: tuple[int, int, int, int]) -> None:
    """
    把一张单色图标换色，alpha 原样保留。

    为什么深色那套是「换色」而不是「重画」：重画要写两遍图形，
    两遍迟早画得不一样 —— 同一枚图标在浅色下和深色下形状差了半像素，
    切主题时看着就是一枚图标跳了一下。换色保证形状完全一致。

    换色只动 rgb 不动 alpha：这些图标是实心单色 + 抗锯齿边，
    边缘的半透明像素本来就带着同一个 rgb，只是 alpha 不同。
    """
    im = Image.open(src).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, _g, _b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (color[0], color[1], color[2], a)
    im.save(dst)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"生成 tabBar 图标颜色 → {OUT_DIR}")

    # 浅色那套：就地换色，图形保持设计稿导出的那一份。
    for name in LIGHT_NAMES:
        active = name.endswith("-active")
        src = OUT_DIR / f"{name}.png"
        recolor(src, src, COLOR_ACTIVE if active else COLOR_IDLE)
        print(f"  {name}.png")

    # 深色那套：从浅色那套换色派生。
    for name in LIGHT_NAMES:
        active = name.endswith("-active")
        recolor(
            OUT_DIR / f"{name}.png",
            OUT_DIR / f"{name}-dark.png",
            COLOR_ACTIVE_DARK if active else COLOR_IDLE_DARK,
        )
        print(f"  {name}-dark.png")


if __name__ == "__main__":
    main()
