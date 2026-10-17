#!/usr/bin/env python3
"""
生成 `src/styles/qweather-icons.css` —— 和风天气图标字体的子集 + base64 内联。

为什么需要这个脚本：产出的 css 里是一段 35 KB 的 base64，没法手改，也没法 review diff。
字体升级、和风新增天气码、调整保留区间时，跑这个脚本重生成，别去编辑 css。

依赖（一次性）：
    python3 -m pip install fonttools

用法：
    python3 scripts/subset-qweather-icons.py [qweather-icons.ttf 路径]

不传路径则从 npm 包读取（需先 `npm i -D qweather-icons` 或手动下载
https://github.com/qwd/Icons/releases）。

⚠️ 三处必须同步改，否则会出现豆腐块（字体里没有的字形）：
    1. 本文件的 RANGES
    2. 生成的 css（自动跟随）
    3. `src/utils/weather.ts` 的 SUPPORTED_RANGES（TS 侧白名单，靠它把非法码挡在渲染前）
脚本末尾会断言 1 与字体实际内容一致，改区间时漏字形会当场报错。
"""

from __future__ import annotations

import base64
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# 和风 `condition.code` 里属于「天气现象」的部分。
# 刻意不含月相(1xxx)、预警(2xxx)、彩色 fill 变体 —— 本项目一个都用不到。
# 每一段都必须能在字体里找到对应字形，assert 会校验。
RANGES: list[tuple[int, int]] = [
    (100, 104),    # 白天：晴 / 多云 / 少云 / 晴间多云 / 阴
    (150, 153),    # 夜间：晴夜 / 多云夜 / 少云夜 / 晴间多云夜
    (300, 318),    # 阵雨 ~ 特大暴雨
    (350, 351),    # 小雨 / 中雨
    (399, 410),    # 雨 / 雪 / 雨夹雪 / 暴雪
    (499, 504),    # 雪 / 薄雾 / 雾 / 霾 / 扬沙 / 浮尘
    (507, 515),    # 沙尘暴 / 浓雾 / 中重度霾 / 大雾
    (900, 901),    # 热 / 冷
    (999, 999),    # 未知（兜底字形，必须保留）
]

OUT_CSS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src", "styles", "qweather-icons.css",
)


def resolve_source() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    local = os.path.join(
        os.getcwd(), "node_modules", "qweather-icons", "font", "fonts", "qweather-icons.ttf"
    )
    if os.path.exists(local):
        return local
    sys.exit(
        "找不到 qweather-icons.ttf。传路径作为参数，\n"
        "或先 `npm i -D qweather-icons`。"
    )


def main() -> None:
    src = resolve_source()
    font = TTFont(src)
    name2cp = {name: cp for cp, name in font.getBestCmap().items()}

    def in_ranges(n: int) -> bool:
        return any(lo <= n <= hi for lo, hi in RANGES)

    outline_codes = {
        int(name)
        for name in font.getBestCmap().values()
        if not name.endswith("-fill") and name.isdigit()
    }
    keep = sorted({n for n in outline_codes if in_ranges(n)})

    # RANGES 里写了但字体没有的区间，是 typo 或和风改版了 —— 当场炸，别静默少个字形。
    declared = {n for lo, hi in RANGES for n in range(lo, hi + 1)}
    absent = sorted(declared - outline_codes)
    assert not absent, f"RANGES 声明但字体里不存在的码: {absent}"
    assert set(keep) == declared & outline_codes

    opts = subset.Options()
    opts.desubroutinize = True        # 去 CFF 子程序，微缩体积
    opts.layout_features = []         # 小程序不跑 OpenType layout，GSUB/GPOS 全砍
    opts.name_IDs = [1, 2, 3, 4, 6]   # 只留最小字体名元数据
    opts.notdef_outline = True        # 保留 .notdef 轮廓，缺字时出豆腐块而非空白
    opts.recalc_bounds = True

    subset_font = subset.load_font(src, opts)
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=[name2cp[str(c)] for c in keep])
    subsetter.subset(subset_font)

    tmp = os.path.join("/tmp", "qweather-weather-subset.ttf")
    subset.save_font(subset_font, tmp, opts)
    size = os.path.getsize(tmp)
    b64 = base64.b64encode(open(tmp, "rb").read()).decode()

    rules = "\n".join(
        f'.qi-{c}::before {{ content: "\\{name2cp[str(c)]:04x}"; }}' for c in keep
    )
    span = "、".join(str(a) if a == b else f"{a}-{b}" for a, b in RANGES)

    css = f"""/**
 * 和风天气图标字体（qweather-icons 子集）—— 由 `scripts/subset-qweather-icons.py` 生成，勿手改。
 *
 * 为什么子集化：原字体 507 个字形、194 KB，其中 300+ 是月相 / 预警 / 彩色 fill 变体，
 * 本项目一个都用不到。全量进包会让主包从 440 KB 涨到 630 KB。这里只保留和风
 * `condition.code` 的天气码区段（{len(keep)} 个字形，{size / 1024:.1f} KB），base64 后约 {len(b64) / 1024:.1f} KB。
 *
 * 为什么必须 base64 而不是引 .ttf 路径：小程序 WXSS 不支持 `local()`，也不支持引包内字体文件。
 * `wx.loadFontFace` 只吃网络字体，且要提前在微信后台配 downloadFile 合法域名 ——
 * 本项目 `manifest.json` 的 AppID 尚为空，这条路走不通。base64 内联是当前唯一零外部依赖的方案。
 *
 * 保留区间：{span}
 * 该区间必须与 `src/utils/weather.ts` 的 `SUPPORTED_RANGES` 严格一致 ——
 * 字体里没有的字形会渲染成豆腐块，TS 侧的白名单负责在渲染前把非法码挡掉。
 *
 * 用法：`<text class="qi qi-{{code}}" />`，`code` 取和风的 `icon` / `iconDay` 字段，
 * 不要再用 CSS 伪类名直接写字面量。
 *
 * ⚠️ 已知限制：canvas 等原生组件不支持自定义字体。本项目天气图标全在普通 `<text>` 里渲染
 * （WeatherHero / HourlyWeather / WeatherCard），不涉及 canvas；若日后要在 TideChart /
 * LineChart / SnapSheet 的 canvas 里画天气图标，此方案不适用。
 *
 * 字体：QWeather Icons，MIT（代码）/ CC BY 4.0（图形），https://github.com/qwd/Icons
 * 编码：私用区 U+F101 起，与和风 API 的 `icon` 字段一一对应。
 */
@font-face {{
  font-family: 'qweather-icons';
  src: url('data:application/x-font-ttf;charset=utf-8;base64,{b64}') format('truetype');
}}

/* 字体族挂在这个基类上；::before 生成的内容会继承它。
 * 不设具体 color —— 单色字形会继承所在容器的文字色，各组件按自己的语义色令牌
 * 单独上色（见 WeatherHero / HourlyWeather / WeatherCard 的 __icon 规则）。
 * text-align: center 是保险：字体的 advance width 不保证各字形等宽，
 * 不居中会让同一行里不同天气码的图标左右跳动。 */
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
    with open(OUT_CSS, "w") as fh:
        fh.write(css)

    print(f"字形 {len(keep)} 个 | ttf {size / 1024:.1f} KB | base64 {len(b64) / 1024:.1f} KB")
    print(f"css  {os.path.getsize(OUT_CSS) / 1024:.1f} KB | class {len(keep) + 1} 条")
    print(f"→ {OUT_CSS}")


if __name__ == "__main__":
    main()
