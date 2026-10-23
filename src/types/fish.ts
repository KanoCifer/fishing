/**
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
  | 'carassius-auratus'
  | 'cyprinus-carpio'
  | 'ctenopharyngodon-idella'
  | 'mylopharyngodon-pike'
  | 'hypophthalmichthys-molitrix'
  | 'aristichthys-nobilis'
  | 'lateolabrax-maculatus'
  | 'silurus-asotus'
  | 'pelteobagrus-fulvidraco'
  | 'megalobrama-amblycephala'
  | 'opsariichthys-bidens'
  | 'siniperca-chuatsi'
  | 'channa-argus'
  | 'anguilla-japonica'
  | 'sparus-aurata'
  | 'pagrus-major'
  | 'takifugu-rubripes'
  | 'paralichthys-olivaceus'
  | 'epinephelus-akaara'
  | 'trachurus-japonicus'
  | 'scomber-japonicus'
  | 'sepia-pharaonis'
  | 'penaeus-monodon';

/**
 * 一张鱼种图片及其出处。
 *
 * 许可与作者不是装饰字段：Commons 上多数图是 CC BY / CC BY-SA，
 * **署名是许可条件**，应用里得把「图片：作者 / 来源」显示出来。
 * 少了这两个字段，图就成了没来路的素材，将来想下架都找不到源头。
 */
export interface FishImage {
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
}

/**
 * 匹配置信度 —— 从高到低：
 * `exact` 标题含完整学名 / `close` 含种加词 / `genus` 只对上属名 / `unknown` 标题无学名
 */
export type FishImageConfidence = 'exact' | 'close' | 'genus' | 'unknown';
