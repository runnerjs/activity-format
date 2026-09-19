import { TRACK_SOURCE } from '../constants';
import type { Activity, TrackSource } from '../types';
import { asArray, unwrapXmlLeaf } from '../field-map/path-util';

export const CODOON_GPX_NAME_PATTERN = /Codoon_/i;
export const CODOON_CREATOR_PATTERN = /codoon|ledong/i;
export const CODOON_SPORT_DESC_TIME_PATTERN =
  /Codoon_Sport_(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/i;
export const CODOON_GENERIC_RECORD_NAME = 'Codoon_Sport_Record';

const DEFAULT_CODOON_TIME_ZONE = 'Asia/Shanghai';

/**
 * 从咕咚 GPX metadata/desc 解析本地开始时间，输出 ISO UTC。
 * @param desc metadata/desc 文本，形如 Codoon_Sport_2016-02-27 08:40:23
 * @param timeZone 本地时区，默认 Asia/Shanghai
 * @returns UTC ISO 字符串；无法解析时为 null
 */
export function parseCodoonGpxDescStartTime(
  desc: string,
  timeZone = DEFAULT_CODOON_TIME_ZONE,
): string | null {
  const match = desc.trim().match(CODOON_SPORT_DESC_TIME_PATTERN);
  if (!match) {
    return null;
  }

  // desc 只有本地墙钟，不含偏移，需按时区补上再转 UTC
  const localDateTime = `${match[1]}T${match[2]}`;
  const offset = formatTimeZoneOffset(localDateTime, timeZone);
  if (!offset) {
    return null;
  }

  const parsed = Date.parse(`${localDateTime}${offset}`);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}

/**
 * 是否为咕咚 GPX 占位活动名（空串或固定的 Codoon_Sport_Record）。
 * @param name trk/name 或 metadata/name
 * @returns 应视为无真实名称时为 true
 */
export function isCodoonPlaceholderName(name: string | undefined): boolean {
  const trimmed = name?.trim();
  return !trimmed || trimmed === CODOON_GENERIC_RECORD_NAME;
}

/**
 * 从 metadata/desc 解析活动开始时间。只返回 ISO，不改 endTime、不改轨迹点。
 * 已有 trkpt/time 时不读 desc。
 * @param raw xml2js GPX 树
 * @returns 解析出的 UTC ISO；无法应用时为 null
 */
export function readCodoonDescStartTime(raw: unknown): string | null {
  if (gpxRawHasTrackpointTimes(raw)) {
    return null;
  }
  const desc = readGpxMetadataText(raw, 'desc');
  return desc ? parseCodoonGpxDescStartTime(desc) : null;
}

/**
 * 判断 GPX 是否为咕咚导出。
 * @param creator gpx@creator 属性
 * @param metadataName metadata/name 文本
 * @param source 已探测或用户指定的来源；为 codoon 时直接视为咕咚
 * @returns 是否应按咕咚规则处理
 */
export function isCodoonGpxContent(
  creator: string,
  metadataName: string,
  source?: TrackSource,
): boolean {
  if (source === TRACK_SOURCE.codoon) {
    return true;
  }
  return (
    CODOON_CREATOR_PATTERN.test(creator) ||
    CODOON_GPX_NAME_PATTERN.test(metadataName)
  );
}

/**
 * GPX 是否包含任意 trkpt/time（有则不走咕咚 metadata 兜底）。
 * @param raw xml2js 解析后的 GPX 树
 * @returns 任一轨迹点带 time 元素则为 true
 */
export function gpxRawHasTrackpointTimes(raw: unknown): boolean {
  const gpx = (raw as Record<string, unknown> | undefined)?.gpx as
    | Record<string, unknown>
    | undefined;
  if (!gpx) {
    return false;
  }

  // 配置 B 下 trk / trkseg / trkpt / time 均为数组
  for (const trk of asArray(gpx.trk)) {
    for (const trkseg of asArray((trk as Record<string, unknown>).trkseg)) {
      for (const trkpt of asArray((trkseg as Record<string, unknown>).trkpt)) {
        const time = (trkpt as Record<string, unknown>).time;
        if (asArray(time).length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * 读取 GPX metadata 下指定文本字段。
 * @param raw xml2js 解析后的 GPX 树
 * @param field metadata 子元素名（name / desc / time）
 * @returns 去空白后的文本；缺失或空串为 null
 */
export function readGpxMetadataText(
  raw: unknown,
  field: 'name' | 'desc' | 'time',
): string | null {
  const gpx = (raw as Record<string, unknown> | undefined)?.gpx as
    | Record<string, unknown>
    | undefined;
  if (!gpx) {
    return null;
  }

  const metadata = asArray(gpx.metadata)[0] as Record<string, unknown> | undefined;
  if (!metadata) {
    return null;
  }

  const value = asArray(metadata[field])[0];
  if (value === undefined) {
    return null;
  }
  // xml2js 叶子可能是字符串或 `{ _: 'text' }`，统一展开
  const text = String(unwrapXmlLeaf(value)).trim();
  return text || null;
}

/**
 * 读取 GPX 根元素的 creator 属性。
 * @param raw xml2js 解析后的 GPX 树
 * @returns creator 文本；缺失时为空串
 */
export function readGpxCreator(raw: unknown): string {
  const gpx = (raw as Record<string, unknown> | undefined)?.gpx as
    | Record<string, unknown>
    | undefined;
  // 配置 B 下属性挂在 `$`
  const creator = (gpx?.$ as Record<string, unknown> | undefined)?.creator;
  return creator ? String(creator).trim() : '';
}

/**
 * 咕咚本地 GPX 常无 trkpt/time，开始时间写在 metadata/desc。
 * 仅在识别为咕咚且缺少轨迹点时间时，用 desc 填 summary.startTime。
 * 不填 endTime，也不给轨迹点补时间。
 * @param raw xml2js 解析后的 GPX 树，用于读 creator / metadata
 * @param model 已 split 的 Activity，就地改写 summary.startTime
 * @param source 当前解析来源，用于确认是否走咕咚兜底
 * @returns 无返回值；不满足条件时直接返回
 */
export function applyCodoonGpxMetadataFallback(
  raw: unknown,
  model: Activity,
  source: TrackSource,
): void {
  const creator = readGpxCreator(raw);
  const metadataName = readGpxMetadataText(raw, 'name') ?? '';
  if (!isCodoonGpxContent(creator, metadataName, source)) {
    return;
  }

  const startTime = readCodoonDescStartTime(raw);
  if (startTime) {
    model.summary.startTime = startTime;
  }
}

/**
 * 计算某本地墙钟在指定时区下的 UTC 偏移。
 * @param localDateTime 无时区的 ISO 本地时间，如 2016-02-27T08:40:23
 * @param timeZone IANA 时区名，如 Asia/Shanghai
 * @returns ±HH:mm 偏移；无法解析时为 null
 */
function formatTimeZoneOffset(
  localDateTime: string,
  timeZone: string,
): string | null {
  // 先按 UTC 解析出 Date，再问 Intl 该瞬间在目标时区的 shortOffset
  const parsed = Date.parse(`${localDateTime}Z`);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(parsed));
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value;
  if (!offset || offset === 'GMT') {
    return '+00:00';
  }

  const match = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return null;
  }

  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = (match[3] ?? '00').padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}
