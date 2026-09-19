/**
 * Garmin `product` / `garminProduct` 对照表。
 *
 * 常用机型 + 本仓库 demo 出现过的编号。全集以 FIT Profile `garmin_product` 为准，
 * 后续随 SDK / Profile 发版在本文件增补即可。
 *
 * @see https://github.com/garmin/fit-sdk-tools/releases/latest
 */
export const GARMIN_PRODUCTS = [
  { id: 717, slug: 'fr405', label: 'Forerunner 405' },
  { id: 782, slug: 'fr50', label: 'Forerunner 50' },
  { id: 1018, slug: 'fr310xt', label: 'Forerunner 310XT' },
  { id: 1036, slug: 'edge500', label: 'Edge 500' },
  { id: 1124, slug: 'fr110', label: 'Forerunner 110' },
  { id: 1169, slug: 'edge800', label: 'Edge 800' },
  { id: 1328, slug: 'fr910xt', label: 'Forerunner 910XT' },
  { id: 1345, slug: 'fr610', label: 'Forerunner 610' },
  { id: 1482, slug: 'fr10', label: 'Forerunner 10' },
  { id: 1551, slug: 'fenix', label: 'Fenix' },
  { id: 1623, slug: 'edge510', label: 'Edge 510' },
  { id: 1765, slug: 'fr620', label: 'Forerunner 620' },
  { id: 1766, slug: 'fr220', label: 'Forerunner 220' },
  { id: 1967, slug: 'fenix2', label: 'Fenix 2' },
  { id: 2050, slug: 'fenix3', label: 'Fenix 3' },
  { id: 2153, slug: 'fr225', label: 'Forerunner 225' },
  { id: 2156, slug: 'fr630', label: 'Forerunner 630' },
  { id: 2157, slug: 'fr230', label: 'Forerunner 230' },
  { id: 2158, slug: 'fr735xt', label: 'Forerunner 735XT' },
  { id: 2396, slug: 'fr235Asia', label: 'Forerunner 235 (Asia)' },
  { id: 2397, slug: 'fr235Japan', label: 'Forerunner 235 (Japan)' },
  { id: 2431, slug: 'fr235', label: 'Forerunner 235' },
  { id: 2691, slug: 'fr935', label: 'Forerunner 935' },
  { id: 2697, slug: 'fenix5', label: 'Fenix 5' },
  { id: 2700, slug: 'vivoactive3', label: 'vívoactive 3' },
  { id: 2713, slug: 'edge1030', label: 'Edge 1030' },
  { id: 2886, slug: 'fr645', label: 'Forerunner 645' },
  { id: 2888, slug: 'fr645m', label: 'Forerunner 645 Music' },
  { id: 2900, slug: 'fenix5sPlus', label: 'Fenix 5S Plus' },
  { id: 2924, slug: 'fr245', label: 'Forerunner 245' },
  { id: 2927, slug: 'fr245Music', label: 'Forerunner 245 Music' },
  { id: 3110, slug: 'fenix5Plus', label: 'Fenix 5 Plus' },
  { id: 3111, slug: 'fenix5xPlus', label: 'Fenix 5X Plus' },
  { id: 3113, slug: 'fr945', label: 'Forerunner 945' },
  { id: 3121, slug: 'edge530', label: 'Edge 530' },
  { id: 3122, slug: 'edge830', label: 'Edge 830' },
  { id: 3299, slug: 'fenix6S', label: 'Fenix 6S' },
  { id: 3308, slug: 'fenix6', label: 'Fenix 6' },
  { id: 3469, slug: 'fr745', label: 'Forerunner 745' },
  { id: 3589, slug: 'fr745', label: 'Forerunner 745' },
  { id: 3905, slug: 'fenix6Pro', label: 'Fenix 6 Pro' },
  { id: 4312, slug: 'fr955', label: 'Forerunner 955' },
  { id: 4375, slug: 'fenix7', label: 'Fenix 7' },
  { id: 4440, slug: 'edge1050', label: 'Edge 1050' },
  { id: 4542, slug: 'fr255', label: 'Forerunner 255' },
] as const;

/** 产品编号 → 显示名 */
export const GARMIN_PRODUCT_BY_ID: Readonly<Record<number, string>> =
  Object.fromEntries(
    GARMIN_PRODUCTS.map((item) => [item.id, item.label]),
  ) as Record<number, string>;

/** SDK 标识 → 显示名（同一 slug 多编号时保留第一条） */
export const GARMIN_PRODUCT_BY_SLUG: Readonly<Record<string, string>> =
  Object.fromEntries(
    [...GARMIN_PRODUCTS].reverse().map((item) => [item.slug, item.label]),
  ) as Record<string, string>;

const REGION_SUFFIXES = ['Asia', 'Japan', 'China', 'Korea', 'Taiwan'] as const;

const SLUG_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['vivoactive', 'vívoactive '],
  ['approach', 'Approach '],
  ['instinct', 'Instinct '],
  ['fenix', 'Fenix '],
  ['edge', 'Edge '],
  ['venu', 'Venu '],
  ['fr', 'Forerunner '],
];

/**
 * 把 Garmin `product` 编号或 SDK 标识转成给人看的型号。
 *
 * 查表优先；未知 slug 按前缀规则美化；未知编号保留 `Garmin ${id}`。
 * @param idOrSlug 数字编号、数字字符串，或 `fr235Asia` 这类 SDK 标识
 * @returns 显示名；无法识别时为 undefined
 */
export function garminProductToLabel(
  idOrSlug: string | number,
): string | undefined {
  if (typeof idOrSlug === 'number' || /^\d+$/.test(String(idOrSlug))) {
    const id = Number(idOrSlug);
    if (!Number.isFinite(id)) return undefined;
    return GARMIN_PRODUCT_BY_ID[id] ?? `Garmin ${id}`;
  }
  const slug = String(idOrSlug).trim();
  if (!slug) return undefined;
  return GARMIN_PRODUCT_BY_SLUG[slug] ?? beautifyGarminSlug(slug);
}

/**
 * 未入库的 SDK 标识按常见前缀和地区后缀美化。
 * @param slug 如 `fr265Asia`
 * @returns 如 `Forerunner 265 (Asia)`
 */
function beautifyGarminSlug(slug: string): string {
  let region: string | undefined;
  let base = slug;
  for (const suffix of REGION_SUFFIXES) {
    if (!slug.endsWith(suffix)) continue;
    region = suffix;
    base = slug.slice(0, -suffix.length);
    break;
  }

  let label = base;
  for (const [prefix, name] of SLUG_PREFIXES) {
    if (!base.toLowerCase().startsWith(prefix)) continue;
    label = `${name}${base.slice(prefix.length)}`;
    break;
  }
  if (label === base && base.length > 0) {
    label = base.charAt(0).toUpperCase() + base.slice(1);
  }
  return region ? `${label} (${region})` : label;
}
