import { isPlainObject } from './path-util';

/** GPX 1.1 默认命名空间。 */
export const GPX_NS = 'http://www.topografix.com/GPX/1/1';

/** Garmin TrackPointExtension 命名空间。 */
export const GPX_TRACK_POINT_EXTENSION_NS =
  'http://www.garmin.com/xmlschemas/TrackPointExtension/v1';

/**
 * 从 xml2js `$` 属性桶里找出绑定到指定 URI 的 xmlns 前缀。
 * @param attrs `gpx.$` 一类的属性对象
 * @param namespaceUri 目标命名空间 URI
 * @returns 前缀（如 `ns3` / `gpxtpx`）；未声明时为 undefined
 */
export function xmlNsPrefixForUri(
  attrs: Record<string, unknown> | undefined,
  namespaceUri: string,
): string | undefined {
  if (!attrs) return undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('xmlns:') && value === namespaceUri) {
      return key.slice('xmlns:'.length);
    }
  }
  return undefined;
}

/**
 * 从 GPX remainder 的根属性恢复 TrackPointExtension 所用前缀。
 * @param remainder split 留下的 GPX 树
 * @returns 原文件前缀；未声明时为 undefined（写出侧回退 `gpxtpx`）
 */
export function resolveGpxTrackPointExtensionPrefix(
  remainder: unknown,
): string | undefined {
  const gpx = isPlainObject(remainder) ? remainder.gpx : undefined;
  const attrs =
    isPlainObject(gpx) && isPlainObject(gpx.$) ? gpx.$ : undefined;
  return xmlNsPrefixForUri(attrs, GPX_TRACK_POINT_EXTENSION_NS);
}
