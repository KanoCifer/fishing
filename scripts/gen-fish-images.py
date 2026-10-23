#!/usr/bin/env python3
"""
生成鱼种图片素材 —— 从 Wikimedia Commons 取图，压成 WebP，产出清单。

为什么需要这个脚本：这个仓库里鱼种素材是**外部来源**的资产，
不是画出来的 —— Commons 上有各鱼种的活体照片，许可干净、覆盖够用。
但手工下载的结果是「一堆散图 + 一堆版权信息」，过三个月没人说得清
哪张图配哪个鱼、能不能商用、作者是谁。所以取图这一步也必须有脚本，
和 `gen-icons.mjs` 是同一个思路：**脚本是资产的唯一出处**。

产物落在两处：

- `scripts/assets/cdn/fish/<id>.webp` —— 要上传到 `VITE_CDN_BASE_URL/fish/` 下。
  和 `scripts/assets/cdn/` 其余内容一样是暂存区，**不进版本库**（见 .gitignore）。
  走 CDN 而不是进代码包：鱼种图是「按需才露面」的（钓点详情里的鱼种卡），
  而主包上限 2MB，一批鱼种图塞进去就是拿所有用户的下载量替少数场景买单。

- `src/types/fish.ts` 与 `src/constants/fish-images.ts` —— 清单与类型。
  图上哪部分是别人做的、许可是什么、链接回哪，都得跟着图走，
  否则将来改了图或者要下架，就找不到那张图的出处了。

## 取图为什么走「分类」而不是「搜索」

Commons 的全文搜索接口（`list=search`）对匿名客户端限流得很凶 ——
实测同一个 IP 连续查，**返回空结果而不是报错**，很容易被误读成「这个物种没有图」。
分类接口（`generator=categorymembers`）没有这个问题，而且更准：
`Category:Carassius auratus` 里就是鲫鱼的东西，不会混进「鲫鱼养殖」或「钓鱼比赛」。

所以取图有三路，从准到糊：

1. **物种分类** —— 首选。
2. **维基百科首图**（`prop=pageimages`）—— 分类空时的补位，
   条目的头图通常就是最正的那张物种照。
3. **Wikidata P18** —— 该物种的定妆照字段。最后兜底。

三路的许可都回 Commons 查，同一把尺子。

## 「没图」和「查不到」必须分开

⚠️ **这是本脚本最容易出错的地方**（第一版就踩了）：
Wikimedia 会按 IP 限流，429 之后请求会返回**空结果而不是报错**。
第一版把「接口空返回」当成「这个鱼种没图」，
结果清单里少了 7 个鱼种 —— 其中 `Sparus aurata` 事后实测有 38 张完全合格的图。

所以现在每个取图环节都把「查询失败」和「确实没有」分开报：
查询失败会**重试**，重试还失败就记成 `查询失败` 而不是 `无合格图`。
清单里少一个鱼种，得知道是哪个原因。

## 只收可商用许可

许可白名单（`COMMERCIAL_LICENSES`）里只有公有领域、CC0、CC BY、CC BY-SA。
**CC BY-NC 一律不要**：这条产品随时可能带付费或广告，
拿 NC 图进去是个定时炸弹，改的时候没人会想到去看图上的许可。

CC BY / CC BY-SA 要求署名，所以每张图的作者和许可都写进清单 ——
应用里得把「图片：某某 / 来源」显示出来，这条在 `src/constants/fish-images.ts` 的注释里。

## 选图规则

Commons 一个分类里几百个文件，绝大多数不能用。按这几条筛：

- 排除标题含 map / range / distribution / anatomy / skull / larva / egg /
  stamp / coin / figure / drawing / plate / specimen / market / fishing … 的
  —— 这些是分布图、解剖图、标本照、集市照、钓场照，不是鱼。
- 只留 jpeg / png，宽 ≥ 600、高 ≥ 480。
- 宽高比 0.8–3.5：竖着的鱼也能用（`<image mode="aspectFit">` 会兜住），
  太离谱的（横条拼图）不要。
- 标题里带学名的优先 —— 那是「这文件确实是这个种」的最强信号。

## 体积预算

单张上限 60KB。钓鱼的人在野外，弱网是常态（见 HANDOFF 里字体那条），
一张 300KB 的鱼种图在 2G 环境下就是十几秒的白屏。

光压质量不够 —— 水下照片噪点多，q82 能压到 150KB 以上。
所以是**降质 + 降尺寸**一起往下退（`QUALITY_LADDER`），取第一个进预算的档位。
写死一个参数的结果就是一半图超预算、一半图被过度压缩。

## API 文档在哪

Commons 没有自己的 API 文档页了（`commons.wikimedia.org/wiki/API:*` 全是 404），
文档跟着 MediaWiki 走：

- `https://commons.wikimedia.org/wiki/Commons:API` —— Commons 侧的说明与入口
- `https://www.mediawiki.org/wiki/API:Main_page` —— Action API 总览
- `https://www.mediawiki.org/wiki/API:Query` —— `action=query` 与 generator/prop
- `https://www.mediawiki.org/wiki/API:Categories` —— `generator=categorymembers`、`prop=categoryinfo`
- `https://www.mediawiki.org/wiki/API:Images` —— `prop=imageinfo` 与 `extmetadata`
- `https://commons.wikimedia.org/wiki/Special:ApiSandbox` —— 在线沙盒，改参数先在这儿试
- 模块级的内置帮助随时能查：`w/api.php?action=help&modules=query+categorymembers`

读操作**不需要 token**（只有写操作要）。但匿名请求按 IP 限流，
而且限流的表现是**静默返回空结果**而不是报错 —— 见下面「没图和查不到要分开」。

## 用法

    python3 scripts/gen-fish-images.py            # 全量
    python3 scripts/gen-fish-images.py carpio     # 只跑 id 含 carpio 的
    python3 scripts/gen-fish-images.py --refresh  # 绕过接口缓存，重新问 Commons

改了 `SPECIES` 清单就重跑。别手改产物 —— 产物是脚本的输出，改了就对不上了。

原图缓存在 `scripts/assets/cdn/fish/.raw/`，重跑时不会重复下载；
那个目录**不要上传到 CDN**（那是 Commons 原图，不是产物）。
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CDN_DIR = ROOT / "scripts" / "assets" / "cdn" / "fish"
RAW_DIR = CDN_DIR / ".raw"
TYPES_OUT = ROOT / "src" / "types" / "fish.ts"
CONST_OUT = ROOT / "src" / "constants" / "fish-images.ts"

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIPEDIA_ZH_API = "https://zh.wikipedia.org/w/api.php"
USER_AGENT = "yulu-fish-assets/1.0 (mini-program asset pipeline; contact: repo owner)"

# 请求间隔下限。Wikimedia 对匿名 IP 限流很紧，
# 429 之后会**静默返回空结果**而不是报错 —— 放慢比重试便宜。
MIN_INTERVAL = 1.0
_last_call = 0.0

# API 响应缓存目录。存在的理由：反复调选图规则时，
# 每次重跑都重打一遍 Commons 是把自己往限流上推。
# 缓存的是**接口响应**，不是素材 —— 素材另有 .raw 缓存。
CACHE_DIR = CDN_DIR / ".cache"
CACHE_ENABLED = True

# 可商用许可白名单。CC BY-NC 明确不在里面 —— 见文件头「只收可商用许可」。
COMMERCIAL_LICENSES = {
    "Public domain",
    "PDM",
    "CC0",
    "CC BY 2.0",
    "CC BY 2.5",
    "CC BY 3.0",
    "CC BY 4.0",
    "CC BY-SA 2.0",
    "CC BY-SA 2.5",
    "CC BY-SA 3.0",
    "CC BY-SA 4.0",
}

# 标题黑名单：这些不是「一条鱼的活体照片」。
TITLE_BLOCKLIST = (
    "map", "range", "distribution", "anatom", "skull", "skeleton", "egg", "larva",
    "scale", "stamp", "coin", "chart", "graph", "logo", "icon", "signature",
    "dissect", "gill", "parasite", "diagram", "drawing", "illustration", "figure",
    "plate", "specimen", "preserved", "market", "fishing", "fisher", "boat",
    "feed", "food", "restaurant", "aquarium", "captive", "poster", "banner",
    "museum", "collection", "size", "length", "weight", "growth", "breeding",
    "spawning", "farm", "culture", "dead", "carcass", "fossil",
)

# 输出规格：最大边 960 起（钓点详情里的鱼种卡在 375pt 机型上撑不满这个宽度，
# 960 已经是 2.5 倍余量，再大只是白占 CDN 流量 —— 野外弱网是常态），
# 但**不保证**每张都是 960：体积超预算时往下退档，见 QUALITY_LADDER。
MAX_BYTES = 60 * 1024
# 退档阶梯的终点是 480px：再小在 2x 屏上就发虚了。
# 宁可让个别图停在 60KB 线上，也不给一张看不清的图。
QUALITY_LADDER = [
    (960, 82), (960, 74), (840, 72), (720, 70), (640, 66), (560, 62), (480, 58),
]

# 鱼种清单 —— 唯一出处。
#
# `categories` 是 Commons 分类名（按顺序试，第一个取到图的算数）。
# `wikipedia` 是英文维基条目名，用它的首图补位。
# `wikidata` 是 P18 兜底。
# 中文名放在这里而不是别处：鱼种名是文案，而文案得有一处出处。
SPECIES = [
    {"id": "carassius-auratus", "name": "鲫鱼", "latin": "Carassius auratus",
     "categories": ["Carassius auratus"], "wikipedia": "Carassius auratus",
     "wikidata": "Carassius auratus"},
    {"id": "cyprinus-carpio", "name": "鲤鱼", "latin": "Cyprinus carpio",
     "categories": ["Cyprinus carpio"], "wikipedia": "Common carp",
     "wikidata": "Common carp"},
    {"id": "ctenopharyngodon-idella", "name": "草鱼", "latin": "Ctenopharyngodon idella",
     "categories": ["Ctenopharyngodon idella"], "wikipedia": "Ctenopharyngodon idella",
     "wikidata": "Ctenopharyngodon idella"},
    {"id": "mylopharyngodon-pike", "name": "青鱼", "latin": "Mylopharyngodon pike",
     # 「Mylopharyngodon piceus」是黑鲿青的同物异名（FishBase 沿用 pike 为接受名，
     # 旧文献与 Commons 的分类仍用 piceus）。这张图是 US FWS 的公有领域照，
     # 是 Commons 上唯一能用的黑鲿青活体图 —— 所以把异名写进白名单。
     "synonyms": ["Mylopharyngodon piceus"],
     "categories": ["Mylopharyngodon pike", "Mylopharyngodon"],
     "wikipedia": "Black carp", "wikidata": "Black carp"},
    {"id": "hypophthalmichthys-molitrix", "name": "鲢鱼", "latin": "Hypophthalmichthys molitrix",
     "categories": ["Hypophthalmichthys molitrix"],
     "wikipedia": "Hypophthalmichthys molitrix", "wikidata": "Hypophthalmichthys molitrix"},
    {"id": "aristichthys-nobilis", "name": "鳙鱼", "latin": "Aristichthys nobilis",
     "categories": ["Aristichthys nobilis", "Hypophthalmichthys nobilis"],
     "wikipedia": "Hypophthalmichthys nobilis", "wikidata": "Hypophthalmichthys nobilis"},
    {"id": "lateolabrax-maculatus", "name": "花鲈", "latin": "Lateolabrax maculatus",
     "categories": ["Lateolabrax maculatus", "Lateolabrax"],
     "wikipedia": "Lateolabrax maculatus", "wikidata": "Lateolabrax maculatus"},
    {"id": "silurus-asotus", "name": "鲶鱼", "latin": "Silurus asotus",
     "categories": ["Silurus asotus"], "wikipedia": "Japanese catfish",
     "wikidata": "Silurus asotus"},
    {"id": "pelteobagrus-fulvidraco", "name": "黄颡鱼", "latin": "Pelteobagrus fulvidraco",
     "categories": ["Pelteobagrus fulvidraco", "Pelteobagrus", "Yellow catfish"],
     "wikipedia": "Yellow catfish", "wikidata": "Yellow catfish"},
    {"id": "megalobrama-amblycephala", "name": "鳊鱼", "latin": "Megalobrama amblycephala",
     "categories": ["Megalobrama amblycephala", "Megalobrama"],
     "wikipedia": "Megalobrama amblycephala", "wikidata": "Megalobrama amblycephala"},
    {"id": "opsariichthys-bidens", "name": "马口鱼", "latin": "Opsariichthys bidens",
     # GBIF 的异名表里有「Opsariichthys uncirostris bidens」，
     # 而 Commons 上「Opsariichthys uncirostris」分类里有可用照片。
     # ⚠️ 别用「Opsariichthys evolans」那张 —— WoRMS 认定 evolans 是独立种，
     # 维基条目却拿它当马口鱼的头图，这是维基那边的分类错误，不是同物异名。
     "synonyms": ["Opsariichthys uncirostris"],
     "categories": ["Opsariichthys bidens", "Opsariichthys uncirostris", "Opsariichthys"],
     "wikipedia": "Opsariichthys bidens", "wikidata": "Opsariichthys bidens"},
    {"id": "siniperca-chuatsi", "name": "鳜鱼", "latin": "Siniperca chuatsi",
     "categories": ["Siniperca chuatsi"], "wikipedia": "Siniperca chuatsi",
     "wikidata": "Siniperca chuatsi"},
    {"id": "channa-argus", "name": "乌鳢", "latin": "Channa argus",
     "categories": ["Channa argus"], "wikipedia": "Channa argus",
     "wikidata": "Channa argus"},
    {"id": "anguilla-japonica", "name": "日本鳗鲡", "latin": "Anguilla japonica",
     "categories": ["Anguilla japonica"], "wikipedia": "Anguilla japonica",
     "wikidata": "Anguilla japonica"},
    {"id": "sparus-aurata", "name": "金鲷", "latin": "Sparus aurata",
     "categories": ["Sparus aurata", "Sparus"], "wikipedia": "Sparus aurata",
     "wikidata": "Sparus aurata"},
    {"id": "pagrus-major", "name": "真鲷", "latin": "Pagrus major",
     "categories": ["Pagrus major", "Pagrus"], "wikipedia": "Red seabream",
     "wikidata": "Red seabream"},
    {"id": "takifugu-rubripes", "name": "红鳍东方鲀", "latin": "Takifugu rubripes",
     "categories": ["Takifugu rubripes", "Takifugu"],
     "wikipedia": "Takifugu rubripes", "wikidata": "Takifugu rubripes"},
    {"id": "paralichthys-olivaceus", "name": "牙鲆", "latin": "Paralichthys olivaceus",
     "categories": ["Paralichthys olivaceus"], "wikipedia": "Paralichthys olivaceus",
     "wikidata": "Paralichthys olivaceus"},
    {"id": "epinephelus-akaara", "name": "花斑石斑鱼", "latin": "Epinephelus akaara",
     "categories": ["Epinephelus akaara", "Epinephelus"],
     "wikipedia": "Epinephelus akaara", "wikidata": "Epinephelus akaara"},
    {"id": "trachurus-japonicus", "name": "竹荚鱼", "latin": "Trachurus japonicus",
     "categories": ["Trachurus japonicus", "Trachurus"],
     "wikipedia": "Trachurus japonicus", "wikidata": "Trachurus japonicus"},
    {"id": "scomber-japonicus", "name": "日本鲭", "latin": "Scomber japonicus",
     "categories": ["Scomber japonicus"], "wikipedia": "Scomber japonicus",
     "wikidata": "Scomber japonicus"},
    {"id": "sepia-pharaonis", "name": "乌贼", "latin": "Sepia pharaonis",
     "categories": ["Sepia pharaonis"], "wikipedia": "Sepia pharaonis",
     "wikidata": "Sepia pharaonis"},
    {"id": "penaeus-monodon", "name": "斑节对虾", "latin": "Penaeus monodon",
     "categories": ["Penaeus monodon"], "wikipedia": "Penaeus monodon",
     "wikidata": "Penaeus monodon"},
]


# 中文维基条目名 —— 有些鱼种英文站没条目，中文站有；
# 中文站的图片往往也更贴近国内用户的认知。
ZH_ARTICLES = {
    "carassius-auratus": "鲫",
    "cyprinus-carpio": "鲤",
    "ctenopharyngodon-idella": "草鱼",
    "mylopharyngodon-pike": "青鱼",
    "hypophthalmichthys-molitrix": "鲢",
    "aristichthys-nobilis": "鳙",
    "lateolabrax-maculatus": "花鲈",
    "silurus-asotus": "鲶",
    "pelteobagrus-fulvidraco": "黄颡鱼",
    "megalobrama-amblycephala": "鳊",
    "opsariichthys-bidens": "马口鱼",
    "siniperca-chuatsi": "鳜",
    "channa-argus": "乌鳢",
    "anguilla-japonica": "日本鳗鲡",
    "sparus-aurata": "金鲷",
    "pagrus-major": "真鲷",
    "takifugu-rubripes": "虫纹东方鲀",
    "paralichthys-olivaceus": "牙鲆",
    "epinephelus-akaara": "花斑石斑鱼",
    "trachurus-japonicus": "竹荚鱼",
    "scomber-japonicus": "鲭",
    "sepia-pharaonis": "乌贼",
    "penaeus-monodon": "斑节对虾",
}

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _throttle() -> None:
    """全局限速。Wikimedia 按 IP 限流，放慢比事后重试便宜。

    加一点随机抖动：固定间隔的请求看起来像机器，
    抖一下能让彼此错开，少触发一点限流。
    """
    global _last_call
    gap = time.time() - _last_call
    wait = MIN_INTERVAL + random.uniform(0, 0.3)
    if gap < wait:
        time.sleep(wait - gap)
    _last_call = time.time()


def api_get(base: str, params: dict, tries: int = 4) -> tuple[dict, str]:
    """调 Commons / Wikipedia / Wikidata 的 action API。

    返回 (数据, 错误说明)。错误说明为空串表示成功 ——
    **成功但内容为空**和**请求失败**必须能分开，见文件头「没图和查不到要分开」。

    ⚠️ 一律用 **POST** 发参数。
    GET 把 `titles=File:A|File:B|…` 拼进 URL，文件名一长就 414
    （URI Too Long）—— 实测 331 个文件名的分类里，
    批量查元信息直接整批失败，而失败的表现只是「这批没结果」。
    POST 没有长度上限，也省得自己截断批次。

    成功的响应落盘缓存（`.cache/`）：调选图规则时反复重跑，
    不该每次都去撞 Wikimedia 的限流。`--refresh` 可绕过缓存。
    """
    body_params = dict(params, format="json")
    body = urllib.parse.urlencode(body_params).encode()
    cache_key = hashlib.sha1(
        json.dumps([base, body_params], sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    cache_path = CACHE_DIR / f"{cache_key}.json"

    if CACHE_ENABLED and cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            return cached.get("data") or {}, cached.get("err") or ""
        except Exception:  # noqa: BLE001 — 缓存坏了就当没有，重新打一次
            pass

    delay = 2.0
    last = "unknown"
    for _ in range(tries):
        _throttle()
        try:
            req = urllib.request.Request(
                base,
                data=body,
                headers={
                    "User-Agent": USER_AGENT,
                    "Api-User-Agent": USER_AGENT,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            with urllib.request.urlopen(req, timeout=40) as resp:
                data = json.loads(resp.read())
            if CACHE_ENABLED:
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(
                    json.dumps({"data": data, "err": ""}, ensure_ascii=False),
                    encoding="utf-8",
                )
            return data, ""
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code in (429, 503):
                time.sleep(delay)
                delay *= 2
                continue
            return {}, last
        except Exception as e:  # noqa: BLE001 — 网络异常一律重试
            last = str(e)[:80]
            time.sleep(delay)
            delay *= 2
    return {}, last


def download(url: str, dest: Path) -> None:
    _throttle()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


# ---------------------------------------------------------------------------
# 取图
# ---------------------------------------------------------------------------

def category_files(cat: str, limit: int = 400) -> tuple[list[str], str]:
    """取一个分类下的文件标题。

    `generator=categorymembers` 一次拿一批，用 cmcontinue 翻页。
    不下钻子分类 —— 子分类里往往是「某某属」的一堆无关文件。
    """
    titles: list[str] = []
    cont = None
    while len(titles) < limit:
        params = {
            "action": "query",
            "generator": "categorymembers",
            "gcmtitle": f"Category:{cat}",
            "gcmtype": "file",
            "gcmlimit": 50,
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": 1400,
        }
        if cont:
            params["gcmcontinue"] = cont
        data, err = api_get(COMMONS_API, params)
        if err:
            return titles, err
        pages = (data.get("query") or {}).get("pages") or {}
        if not pages and not cont:
            return titles, ""  # 分类是空的（真的没有），不是查询失败
        for page in pages.values():
            titles.append(page.get("title", ""))
        cont = (data.get("continue") or {}).get("gcmcontinue")
        if not cont:
            break
    return [t for t in titles if t], ""


def wikipedia_lead(api_base: str, title: str) -> tuple[str | None, str]:
    """取维基条目的首图文件名。

    ⚠️ `piprop=name` 给的是 `File:xxx.jpg` 这样的**标题**；
    `piprop=original` 给的是**完整 URL**。
    两者混用就会拼出 `File:https://upload.wikimedia.org/…` 这种废标题，
    拿去查元信息自然什么都查不到 —— 首图兜底整条路会静默失效。
    """
    data, err = api_get(
        api_base,
        {"action": "query", "titles": title, "prop": "pageimages",
         "piprop": "name|original", "redirects": "yes"},
    )
    if err:
        return None, err
    for page in (data.get("query") or {}).get("pages", {}).values():
        src = page.get("original") or {}
        name = page.get("name") or src.get("source")
        if not name:
            continue
        if name.startswith("File:"):
            return name[5:], ""
        # 落到这里说明给的是 URL —— 取路径最后一段并解码
        path = urllib.parse.urlparse(name).path
        decoded = urllib.parse.unquote(path.rsplit("/", 1)[-1])
        if decoded:
            return decoded, ""
    return None, ""


def wikidata_p18(title: str) -> tuple[str | None, str]:
    """取 Wikidata 的 P18（该物种的定妆照文件名）。"""
    data, err = api_get(
        WIKIDATA_API,
        {"action": "wbgetentities", "sites": "enwiki", "titles": title,
         "props": "claims", "redirects": "yes"},
    )
    if err:
        return None, err
    for entity in (data.get("entities") or {}).values():
        for claim in (entity.get("claims") or {}).get("P18", []):
            value = (claim.get("mainsnak") or {}).get("datavalue") or {}
            name = value.get("value")
            if isinstance(name, str) and name:
                return name, ""
    return None, ""


def file_info(titles: list[str]) -> tuple[dict[str, dict], str]:
    """批量取文件元信息（许可、作者、原图地址、尺寸）。"""
    out: dict[str, dict] = {}
    # 一批 50 个：POST 没有 URL 长度限制，没必要切太碎（切碎了请求数翻倍）。
    for i in range(0, len(titles), 50):
        batch = titles[i : i + 50]
        data, err = api_get(
            COMMONS_API,
            {"action": "query", "titles": "|".join(batch), "prop": "imageinfo",
             "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1400},
        )
        if err:
            return out, err
        for page in (data.get("query") or {}).get("pages", {}).values():
            info = (page.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata") or {}
            out[page.get("title", "")] = {
                "url": info.get("url"),
                "thumb": info.get("thumburl"),
                "width": info.get("width") or 0,
                "height": info.get("height") or 0,
                "mime": info.get("mime") or "",
                "license": (meta.get("LicenseShortName") or {}).get("value", ""),
                "author": strip_html((meta.get("Artist") or {}).get("value", "")),
                "descurl": (meta.get("CanonicalPageURL") or {}).get("value", ""),
            }
    return out, ""


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = text.replace("&amp;", "&").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", text).strip()


def allowed_names(sp: dict) -> tuple[str, set[str]]:
    """这个鱼种允许出现在标题里的全名：正名 + 人工确认过的同物异名。

    同物异名是**人工确认后写进清单的**，不是自动查出来的 ——
    自动查异名的数据库对这几个鱼种要么查不到、要么互相矛盾
    （Wikidata 的 P1420 对这两个物种都是空的；
    GBIF 把 Mylopharyngodon pike 只匹配到属级，
    而 Commons 又把 piceus 单独立了分类）。
    既然查不出一致答案，就让人来定，并把决定留在清单里可追溯。

    返回 (正名, {允许的种加词})。
    """
    latin = sp["latin"]
    genus, _, epithet = latin.partition(" ")
    epithets = {epithet.lower()} if epithet else set()
    for syn in sp.get("synonyms", []):
        _, _, syn_epithet = syn.partition(" ")
        if syn_epithet:
            epithets.add(syn_epithet.lower())
    return latin, epithets


def score_candidate(title: str, info: dict, sp: dict) -> float | None:
    """给候选文件打分。返回 None 表示不可用。"""
    low = title.lower()
    latin, allowed = allowed_names(sp)
    genus, _, epithet = latin.partition(" ")
    # **同属异种直接拒**：标题写着「Opsariichthys evolans」的图不是马口鱼
    # （Opsariichthys bidens），两者长得像但不是一种。
    # 实测 Commons 的物种分类里确实混着这种文件，
    # 选错了卡片就成了误导 —— 所以不是扣分，是排除。
    if genus and epithet:
        for found in re.findall(rf"\b{re.escape(genus.lower())}\s+([a-z][a-z\-]*)", low):
            if found in ("sp", "spp", "sp.", "cf", "aff", "group", "species"):
                continue
            if found not in allowed:
                return None
    for bad in TITLE_BLOCKLIST:
        if bad in low:
            return None
    if info["license"] not in COMMERCIAL_LICENSES:
        return None
    if info["mime"] not in ("image/jpeg", "image/png"):
        return None
    w, h = info["width"], info["height"]
    if w < 600 or h < 480:
        return None
    ratio = w / h if h else 0
    if ratio < 0.8 or ratio > 3.5:
        return None

    score = min(w, 2400) / 1000.0
    if 1.4 < ratio < 2.4:
        score += 1.0  # 教科书式的侧视构图
    if latin.lower() in low:
        score += 2.5  # 标题带完整学名 = 这个文件确实是这个种
    elif any(e in low for e in allowed):
        score += 1.2  # 只带种加词（含确认过的异名），也基本对得上
    return score


def match_confidence(title: str, sp: dict) -> str:
    """这张图和目标鱼种的匹配有多确定 —— 用来标出需要人工确认的。

    Commons 的物种分类里混着**同属不同种**的文件：
    `Category:Takifugu rubripes` 里出现过 `Takifugu stictonotus`（星点东方鲀），
    两条长得像但不是一种。选到近似种，卡片就成了误导。
    所以标题只对上属名的一律标出来，让人来过一眼。
    """
    low = title.lower()
    latin, allowed = allowed_names(sp)
    genus, _, _ = latin.partition(" ")
    if latin.lower() in low:
        return "exact"
    if any(e in low for e in allowed):
        return "close"
    if genus and genus.lower() in low:
        return "genus"  # 只对上属 —— 可能是近似种
    return "unknown"  # 标题完全没学名（常见于日文标题）


def pick_from_candidates(titles: list[str], sp: dict) -> tuple[dict | None, str]:
    """在一批文件里挑最好的那个。返回 (图, 错误说明)。

    ⚠️ 错误必须往外传：第一版把查询失败当成「没有合格图」，
    结果鲫鱼这种明明有图的鱼种被静默漏掉 —— 清单少一条，
    而清单少了没人会发现。
    """
    infos, err = file_info(titles)
    if err:
        return None, err
    best = None
    for title, info in infos.items():
        if not info.get("url"):
            continue
        s = score_candidate(title, info, sp)
        if s is None:
            continue
        # 同分时按文件名排 —— API 返回顺序不保证稳定，
        # 不定这一条的话，同一个鱼种两次跑出来会是两张不同的图。
        if best is None or (s, title) > (best[0], best[1]):
            best = (s, title, info)
    return ({"title": best[1], **best[2]} if best else None), ""


def category_file_count(cat: str) -> tuple[int | None, str]:
    """查一个分类里有多少文件。

    用来分辨「这个分类本来就是空的」和「查询被限流，返回了空」——
    这两件事在 `category_files` 里长得一模一样，都是零个文件。
    """
    data, err = api_get(
        COMMONS_API,
        {"action": "query", "prop": "categoryinfo", "titles": f"Category:{cat}"},
    )
    if err:
        return None, err
    for page in (data.get("query") or {}).get("pages", {}).values():
        if "missing" in page:
            return 0, ""  # 分类不存在 —— 确实没有
        info = page.get("categoryinfo") or {}
        return int(info.get("files") or 0), ""
    return None, "categoryinfo 无结果"


def pick_for_species(sp: dict) -> tuple[dict | None, str]:
    """给一个鱼种挑一张图。

    返回 (图, 状态)。状态取值：
    - `ok` —— 找到了
    - `无合格图` —— 三路都查到了，但没有符合许可与尺寸的
    - `查询失败` —— 接口没给回结果，**不代表这个鱼种没有图**

    ⚠️ 整段包在重试里：Wikimedia 限流时不报错，只给空结果。
    一次拿不到就歇几秒再来一轮 —— 三轮都空才算「无合格图」。
    """
    for attempt in range(3):
        last_err = ""

        for cat in sp.get("categories", []):
            titles, err = category_files(cat)
            if err:
                last_err = f"{cat}: {err}"
                continue
            if not titles:
                # 空返回有两种可能，用 categoryinfo 判一下
                count, err = category_file_count(cat)
                if err:
                    last_err = f"{cat}: {err}"
                elif count:
                    last_err = f"{cat}: 查询空返回（分类实际有 {count} 个文件）"
                continue
            picked, err = pick_from_candidates(titles, sp)
            if err:
                last_err = f"{cat}: {err}"
                continue
            if picked:
                return picked, "ok"

        # 维基百科首图：英文条目与中文条目都试。
        # 中文条目这边常能给出更准的那张（条目作者按中文名组织图片），
        # 而且有些鱼种英文站压根没条目、中文站有。
        for api_base, key in ((WIKIPEDIA_API, "wikipedia"), (WIKIPEDIA_ZH_API, "wikipedia_zh")):
            article = sp.get(key)
            if key == "wikipedia_zh" and not article:
                article = ZH_ARTICLES.get(sp["id"])
            if not article:
                continue
            lead, err = wikipedia_lead(api_base, article)
            if err:
                last_err = f"{key}/{article}: {err}"
                continue
            if not lead:
                continue
            picked, err = pick_from_candidates([f"File:{lead}"], sp)
            if err:
                last_err = f"{key}/{article}: {err}"
                continue
            if picked:
                return picked, "ok"

        wd_title = sp.get("wikidata")
        if wd_title:
            p18, err = wikidata_p18(wd_title)
            if err:
                last_err = f"wikidata/{wd_title}: {err}"
            elif p18:
                picked, err = pick_from_candidates([f"File:{p18}"], sp)
                if err:
                    last_err = f"wikidata/{wd_title}: {err}"
                elif picked:
                    return picked, "ok"

        if not last_err:
            return None, "无合格图"  # 三路都正常查完了，确实没有
        # 有报错 —— 多半是限流，歇一会儿再来
        time.sleep(4 + attempt * 6)

    return None, "查询失败：" + last_err


# ---------------------------------------------------------------------------
# 处理与产出
# ---------------------------------------------------------------------------

def process(src: Path, dest: Path) -> tuple[int, int]:
    """压成 WebP：保持比例不裁，按 QUALITY_LADDER 往下退直到进体积预算。

    为什么是「退档」而不是「死磕一个质量参数」：水下照片的噪点密度差得很远，
    同一组参数下，有的鱼 30KB 就够，有的要 150KB。写死一个参数，
    结果就是一半图超预算、一半图被过度压缩。
    退档的顺序是「先降质、再降尺寸」——尺寸降下去，糊的是鱼的整体轮廓，
    而轮廓正是鱼种卡要给人看的东西。
    """
    with Image.open(src) as im:
        im = im.convert("RGB")
        width = height = 0
        for max_side, quality in QUALITY_LADDER:
            work = im.copy()
            work.thumbnail((max_side, max_side), Image.LANCZOS)
            dest.parent.mkdir(parents=True, exist_ok=True)
            work.save(dest, "WEBP", quality=quality, method=6)
            width, height = work.width, work.height
            if dest.stat().st_size <= MAX_BYTES:
                break
        return width, height


def ts_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write_outputs(entries: list[dict]) -> None:
    ids = [e["id"] for e in entries]
    id_union = " | ".join(f"'{i}'" for i in ids)

    types_src = f"""/**
 * 鱼种域类型 —— 由 `scripts/gen-fish-images.py` 生成，不要手改。
 *
 * 为什么鱼种单独一套类型：鱼种在这套系统里有两个来源 ——
 * 后端钓点数据里带的鱼种标签（将来加），和这张素材清单。
 * 图片这块的字段（许可、作者、来源链接）跟后端 DTO 无关，
 * 混进 `types/fishing.ts` 会让「接口返回的东西」和「素材元信息」搅在一起。
 *
 * 改法：改 `scripts/gen-fish-images.py` 的 `SPECIES` 清单，重跑脚本。
 */

export type FishSpeciesId =
  | {id_union};

/**
 * 一张鱼种图片及其出处。
 *
 * 许可与作者不是装饰字段：Commons 上多数图是 CC BY / CC BY-SA，
 * **署名是许可条件**，应用里得把「图片：作者 / 来源」显示出来。
 * 少了这两个字段，图就成了没来路的素材，将来想下架都找不到源头。
 */
export interface FishImage {{
  /** 鱼种 id */
  id: FishSpeciesId;
  /** 中文名 */
  name: string;
  /** 学名 */
  scientific: string;
  /** CDN 上的文件名（相对 `fish/` 目录） */
  file: string;
  /** 像素宽 */
  width: number;
  /** 像素高 */
  height: number;
  /** 许可标识，例如 `CC BY-SA 4.0` */
  license: string;
  /** 作者署名，展示时用 */
  author: string;
  /** Commons 文件页，署名的链接指向这里 */
  source: string;
  /**
   * 这张图与鱼种的匹配置信度。
   *
   * Commons 的物种分类里混着同属不同种的文件（红鳍东方鲀的分类里
   * 出现过星点东方鲀），选到近似种，卡片就成了误导。
   * `genus` 与 `unknown` 这两档说明只对上了属名或完全没学名，
   * 展示前值得让人过一眼。
   */
  confidence: FishImageConfidence;
}}

/**
 * 匹配置信度 —— 从高到低：
 * `exact` 标题含完整学名 / `close` 含种加词 / `genus` 只对上属名 / `unknown` 标题无学名
 */
export type FishImageConfidence = 'exact' | 'close' | 'genus' | 'unknown';
"""

    const_src = """/**
 * 鱼种图片清单 —— 由 `scripts/gen-fish-images.py` 生成，不要手改。
 *
 * 每条记录带许可与作者：Commons 的图多是 CC BY / CC BY-SA，
 * **署名是许可条件**。应用里展示鱼种图时要把这条署名一起显示，
 * 否则就是无署名使用。
 *
 * 图片走 CDN，不进代码包 —— 鱼种卡是「按需露面」的场景，
 * 而主包上限 2MB。CDN 域名要在微信后台配成 downloadFile 合法域名，
 * 否则 `<image>` 拉不到图（不报错，只是空一块）。
 *
 * 改法：改 `scripts/gen-fish-images.py` 的 `SPECIES` 清单，重跑脚本。
 */

import { ENV } from '@/config/env';
import type { FishImage, FishSpeciesId } from '@/types/fish';

/** 鱼种图在 CDN 上的目录 */
export const FISH_IMAGE_DIR = `${ENV.cdnBaseUrl}/fish`;

/** 按鱼种 id 取图片地址。取不到返回空串，让调用方走占位 */
export function fishImageUrl(id: FishSpeciesId): string {
  const entry = FISH_IMAGES[id];
  return entry ? `${FISH_IMAGE_DIR}/${entry.file}` : '';
}

export const FISH_IMAGES: Record<FishSpeciesId, FishImage> = {
"""

    for e in entries:
        const_src += (
            f"  '{e['id']}': {{\n"
            f"    id: '{e['id']}',\n"
            f"    name: {ts_string(e['name'])},\n"
            f"    scientific: {ts_string(e['latin'])},\n"
            f"    file: {ts_string(e['file'])},\n"
            f"    width: {e['width']},\n"
            f"    height: {e['height']},\n"
            f"    license: {ts_string(e['license'])},\n"
            f"    author: {ts_string(e['author'])},\n"
            f"    source: {ts_string(e['source'])},\n"
            f"    confidence: '{e['confidence']}',\n"
            f"  }},\n"
        )
    const_src += "};\n"

    TYPES_OUT.write_text(types_src, encoding="utf-8")
    CONST_OUT.write_text(const_src, encoding="utf-8")


def main() -> None:
    global CACHE_ENABLED

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--refresh" in sys.argv[1:]:
        CACHE_ENABLED = False  # 绕过接口缓存，重新去问 Commons
    only = args[0] if args else ""
    species = [s for s in SPECIES if only in s["id"]] if only else SPECIES

    CDN_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []
    skipped: list[tuple[str, str]] = []
    print(f"取鱼种图片（{len(species)} 个）：")
    for sp in species:
        picked, status = pick_for_species(sp)
        if not picked:
            skipped.append((sp["id"], status))
            print(f"  · {sp['id']:26} —— {status}")
            continue

        # 原图留作缓存：重新调参压图时不用再打一次 Commons 的 API。
        # 缓存目录**不要上传到 CDN**（那是 Commons 原图，不是产物）。
        # 文件名取 URL 的**路径后缀**，不能直接 Path(url).suffix ——
        # URL 后面挂着查询串，会取到「.org&utm_campaign=…」这种鬼名字。
        suffix = Path(urllib.parse.urlparse(picked["url"]).path).suffix or ".jpg"
        raw_path = RAW_DIR / f"{sp['id']}{suffix}"
        try:
            if not raw_path.exists():
                download(picked.get("thumb") or picked["url"], raw_path)
        except Exception as e:  # noqa: BLE001
            skipped.append((sp["id"], f"下载失败：{str(e)[:40]}"))
            print(f"  · {sp['id']:26} 下载失败：{str(e)[:60]}")
            continue

        out_name = f"{sp['id']}.webp"
        try:
            w, h = process(raw_path, CDN_DIR / out_name)
        except Exception as e:  # noqa: BLE001
            skipped.append((sp["id"], f"处理失败：{str(e)[:40]}"))
            print(f"  · {sp['id']:26} 处理失败：{str(e)[:60]}")
            continue

        entries.append(
            {
                "id": sp["id"],
                "name": sp["name"],
                "latin": sp["latin"],
                "file": out_name,
                "width": w,
                "height": h,
                "license": picked["license"],
                "author": picked["author"],
                "source": picked.get("descurl")
                or f"https://commons.wikimedia.org/wiki/{picked['title'].replace(' ', '_')}",
                "confidence": match_confidence(picked["title"], sp),
            }
        )
        size = (CDN_DIR / out_name).stat().st_size
        confidence = match_confidence(picked["title"], sp)
        flag = "" if size <= MAX_BYTES else "  ⚠ 超预算"
        if confidence in ("genus", "unknown"):
            flag += f"  ⚠ 匹配置信度 {confidence}（标题未含完整学名，需人工确认）"
        print(
            f"  · {sp['id']:26} {picked['license']:<14} "
            f"{size / 1024:5.0f} KB  {picked['title'][5:60]}{flag}"
        )

    if not only:
        write_outputs(entries)
        print()
        print(f"清单：{TYPES_OUT.relative_to(ROOT)}")
        print(f"清单：{CONST_OUT.relative_to(ROOT)}")
        print()
        print("要自己上传的（不会进代码包）：")
        for e in entries:
            print(f"  · scripts/assets/cdn/fish/{e['file']} → $VITE_CDN_BASE_URL/fish/{e['file']}")
        print("  上传后确认那个域名在微信后台的 downloadFile 合法域名里。")
        print("  ⚠ .raw/ 是 Commons 原图缓存，不要上传。")
        if skipped:
            print()
            print("没取到的（分清是查不到还是真没有）：")
            for sid, why in skipped:
                print(f"  · {sid:26} {why}")


if __name__ == "__main__":
    main()
