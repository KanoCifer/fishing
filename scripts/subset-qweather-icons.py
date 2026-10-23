#!/usr/bin/env python3
"""
生成 `src/styles/generated/qweather-icons.css` —— 和风天气图标字体的**字形映射表**。

字体本体走网络（`wx.loadFontFace`），所以这里不再往 css 里内联 base64 ——
产出的 css 只剩「码 → 私用区位」的映射规则，2 KB 上下。

⚠️ 为什么字形码位必须从字体里取：私用区码位（U+F101 起）是和风自己定的，
不是「按顺序排」—— 比如 999（未知）的位在 515 之后、901 之前。
所以换一份字体文件，规则就得重算，不能手抄。

字体的码位有两个来源，优先用第一个：
1. `qweather-icons.json`（npm 包自带）—— 官方给出的「码 → 码位」表
2. 字体文件自身的 cmap（兜底）

依赖（仅在导出子集字体时需要）：
    python3 -m pip install fonttools

用法：
    python3 scripts/subset-qweather-icons.py                     # 生成 css
    python3 scripts/subset-qweather-icons.py --ttf-out <路径>    # 顺便导出子集字体

⚠️ 两处必须同步改，否则会出现豆腐块（字体里没有的字形）：
    1. 本文件的 RANGES
    2. `src/utils/weather.ts` 的 SUPPORTED_RANGES 与 MOON_PHASE_ICON_CODES
       （两张表的**并集**必须与本文件的 RANGES 一致：前者管天气现象，
        后者管月相，字体里没有的字形会渲染成豆腐块）
脚本末尾会断言 1 与字体实际内容一致，改区间时漏字形会当场报错。
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# 和风 `condition.code` 里属于「天气现象」的部分，外加月相图标（800-807）。
# 刻意不含预警(2xxx)、其它扩展码段(1xxx)、彩色 fill 变体 —— 本项目一个都用不到。
# 每一段都必须能在字体里找到对应字形，assert 会校验。
#
# 月相为什么是 800-807 而不是 1xxx：
# 和风官方《moon-phases.csv》给出的就是这 8 个码（新月 800 → 残月 807），
# API 的 `astro.moonPhase` 给出的是英文代码（'waxing-gibbous'），
# 两者的对应关系见 `src/utils/weather.ts` 的 MOON_PHASE_ICON_CODES。
RANGES: list[tuple[int, int]] = [
    (100, 104),    # 白天：晴 / 多云 / 少云 / 晴间多云 / 阴
    (150, 153),    # 夜间：晴夜 / 多云夜 / 少云夜 / 晴间多云夜
    (300, 318),    # 阵雨 ~ 特大暴雨
    (350, 351),    # 小雨 / 中雨
    (399, 410),    # 雨 / 雪 / 雨夹雪 / 暴雪
    (499, 504),    # 雪 / 薄雾 / 雾 / 霾 / 扬沙 / 浮尘
    (507, 515),    # 沙尘暴 / 浓雾 / 中重度霾 / 大雾
    (800, 807),    # 月相：新月 / 蛾眉月 / 上弦月 / 盈凸月 / 满月 / 亏凸月 / 下弦月 / 残月
    (900, 901),    # 热 / 冷
    (999, 999),    # 未知（兜底字形，必须保留）
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_CSS = os.path.join(ROOT, "src", "styles", "generated", "qweather-icons.css")
PKG_DIR = os.path.join(ROOT, "node_modules", "qweather-icons")
FONT_PATH = os.path.join(PKG_DIR, "font", "fonts", "qweather-icons.ttf")
CODE_MAP_PATH = os.path.join(PKG_DIR, "font", "qweather-icons.json")


def resolve_font() -> str:
    """字体源。可用 --font 指定别的路径。"""
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--font", default=FONT_PATH)
    args, _ = parser.parse_known_args()

    if os.path.exists(args.font):
        return args.font
    sys.exit(
        f"找不到字体文件：{args.font}\n"
        "先 `pnpm i -D qweather-icons`，或用 --font 指定路径。"
    )


def load_code_map(font_path: str) -> dict[int, int]:
    """
    码 → 私用区位。

    优先用 npm 包里的 `qweather-icons.json`（官方维护，跟字体同版本），
    没有就退回字体自己的 cmap。两条路给出的结果一致，但 json 不用装 fonttools。
    """
    if os.path.exists(CODE_MAP_PATH):
        with open(CODE_MAP_PATH, encoding="utf-8") as fh:
            raw = json.load(fh)
        # 表里还有 '100-fill' 这类彩色 fill 变体，本项目不用，跳过
        return {int(code): int(codepoint) for code, codepoint in raw.items() if code.isdigit()}

    from fontTools.ttLib import TTFont  # 兜底才需要

    font = TTFont(font_path)
    by_name: dict[str, list[int]] = {}
    for codepoint, name in font.getBestCmap().items():
        if name.isdigit():
            by_name.setdefault(name, []).append(codepoint)

    # 字体里有重名字形（901 就有两个：U+F145 和 U+F168），
    # 官方 json 取的是**最小**的那个 —— 跟官方 css 保持一致，别自己挑。
    return {int(name): min(codepoints) for name, codepoints in by_name.items()}


def subset_font(font_path: str, code_map: dict[int, int], keep: list[int], out_path: str) -> int:
    """导出只含这些字形的子集字体，字节数返回。"""
    from fontTools import subset
    from fontTools.ttLib import TTFont

    font = TTFont(font_path)
    available = set(font.getBestCmap())

    # 码位必须用 code_map（官方 json）给的，不能用字体的 cmap 反查：
    # 字体里有重名字形（901 → U+F145 与 U+F168 并存），
    # 按名字反查会被后一个覆盖，导出的子集就会缺 F145 —— 那个位置的字形，
    # 正是 css 规则指向的地方，渲染出来是豆腐块。
    missing = [c for c in keep if code_map[c] not in available]
    assert not missing, f"字体里找不到这些码位的字形: {missing}"

    opts = subset.Options()
    opts.desubroutinize = True        # 去 CFF 子程序，微缩体积
    opts.layout_features = []         # 小程序不跑 OpenType layout，GSUB/GPOS 全砍
    opts.name_IDs = [1, 2, 3, 4, 6]   # 只留最小字体名元数据
    opts.notdef_outline = True        # 保留 .notdef 轮廓，缺字时出豆腐块而非空白
    opts.recalc_bounds = True

    subset_font_obj = subset.load_font(font_path, opts)
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=[code_map[c] for c in keep])
    subsetter.subset(subset_font_obj)

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    subset.save_font(subset_font_obj, out_path, opts)
    return os.path.getsize(out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="生成和风天气图标字体的 css 映射表")
    parser.add_argument(
        "--ttf-out",
        default="",
        help="顺便把子集字体导出到这个路径（用于自建 CDN 托管）",
    )
    parser.add_argument("--font", default=FONT_PATH, help="字体源路径")
    args = parser.parse_args()

    font_path = resolve_font()
    code_map = load_code_map(font_path)

    def in_ranges(n: int) -> bool:
        return any(lo <= n <= hi for lo, hi in RANGES)

    keep = sorted(n for n in code_map if in_ranges(n))

    # RANGES 里写了但字体没有的码，是 typo 或和风改版了 —— 当场炸，别静默少个字形。
    declared = {n for lo, hi in RANGES for n in range(lo, hi + 1)}
    absent = sorted(declared - set(code_map))
    assert not absent, f"RANGES 声明但字体里不存在的码: {absent}"

    rules = "\n".join(f'.qi-{c}::before {{ content: "\\{code_map[c]:04x}"; }}' for c in keep)
    span = "、".join(str(a) if a == b else f"{a}-{b}" for a, b in RANGES)

    css = f"""/**
 * 和风天气图标字体（qweather-icons）—— 由 `scripts/subset-qweather-icons.py` 生成，勿手改。
 *
 * 这份 css 里**没有字体本体**，只有「码 → 字形」的映射规则。
 * 字体走网络加载（`wx.loadFontFace`，见 `src/composables/useQweatherFont.ts`），
 * 所以这里不需要 @font-face —— 运行时注册进来的字体族，css 直接按族名引用即可。
 *
 * 为什么字形码位必须从字体里取：私用区码位（U+F101 起）是和风自己定的，
 * 不是按顺序排的 —— 比如 999（未知）的位在 515 之后、901 之前。
 * 换一份字体文件，这张表就得重算，不能手抄。
 *
 * 保留区间：{span}
 * 该区间必须与 `src/utils/weather.ts` 的 `SUPPORTED_RANGES`（天气现象）和
 * `MOON_PHASE_ICON_CODES`（月相）两者的**并集**严格一致 ——
 * 字体里没有的字形会渲染成豆腐块，TS 侧的白名单负责在渲染前把非法码挡掉。
 *
 * 用法：`<text class="qi qi-{{code}}" />`，`code` 取和风的 `icon` / `iconDay` 字段，
 * 或月相经 `moonPhaseIconClass()` 换算出的码；不要再用 CSS 伪类名直接写字面量。
 *
 * ⚠️ 已知限制：canvas 等原生组件不支持自定义字体。本项目天气图标全在普通 `<text>` 里渲染
 * （HourlyWeather / WeekStrip / AstroCard），不涉及 canvas；若日后要在 TideChart /
 * LineChart / SnapSheet 的 canvas 里画天气图标，此方案不适用。
 *
 * 字体：QWeather Icons，MIT（代码）/ CC BY 4.0（图形），https://github.com/qwd/Icons
 * 编码：私用区 U+F101 起，与和风 API 的 `icon` 字段一一对应。
 */
.qi {{
  font-family: 'qweather-icons';
  font-weight: normal;
  font-style: normal;
  text-align: center;
  speak: never;
}}

/* 内容由 ::before 提供，调用方只需给 <text> 挂上 .qi-<code> */
{rules}
"""
    os.makedirs(os.path.dirname(OUT_CSS), exist_ok=True)
    with open(OUT_CSS, "w", encoding="utf-8") as fh:
        fh.write(css)

    print(f"码位映射 {len(keep)} 条 | css {os.path.getsize(OUT_CSS) / 1024:.1f} KB → {OUT_CSS}")

    if args.ttf_out:
        size = subset_font(font_path, code_map, keep, args.ttf_out)
        print(f"子集字体 {size / 1024:.1f} KB → {args.ttf_out}")


if __name__ == "__main__":
    main()
