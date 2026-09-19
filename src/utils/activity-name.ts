import { SPORT_TYPE } from '../constants';
import type { SportType } from '../types';

/** 运动类型展示名（与列表默认活动名一致）。 */
export const SPORT_TYPE_LABEL: Partial<Record<SportType, string>> = {
  [SPORT_TYPE.run]: '跑步',
  [SPORT_TYPE.bike]: '骑行',
  [SPORT_TYPE.swim]: '游泳',
  [SPORT_TYPE.hike]: '徒步',
  [SPORT_TYPE.trailRun]: '越野跑',
  [SPORT_TYPE.droneFlight]: '无人机',
  [SPORT_TYPE.paragliding]: '滑翔伞',
  [SPORT_TYPE.skiing]: '滑雪',
};

/**
 * 将活动开始时间格式化为指定时区的日历日。
 * @param startTime ISO 字符串或 Date
 * @param timeZone IANA 时区，默认 Asia/Shanghai
 * @returns YYYY-MM-DD（该时区下的日期，跨日会反映时区偏移）
 */
export function formatActivityDateInTz(
  startTime: string | Date,
  timeZone = 'Asia/Shanghai',
): string {
  const date = typeof startTime === 'string' ? new Date(startTime) : startTime;
  // en-CA 的 formatToParts 给出零填充的年/月/日，且尊重 timeZone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/**
 * 将时间格式化为指定时区的日期时间字符串。
 * @param value ISO 字符串或 Date
 * @param timeZone IANA 时区，默认 Asia/Shanghai
 * @returns YYYY-MM-DD HH:mm:ss（24 小时制）
 */
export function formatDateTimeInTz(
  value: string | Date,
  timeZone = 'Asia/Shanghai',
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  // hour12: false 保证 24 小时制，避免上午/下午标记
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const min = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const s = parts.find((p) => p.type === 'second')?.value ?? '00';
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

/**
 * 文件无名称时的默认活动名。
 * @param sportType 运动类型，用于取中文展示名
 * @param startTime 活动开始时间
 * @param timeZone IANA 时区，默认 Asia/Shanghai
 * @returns 如「跑步 2024-09-15」；未知运动类型时用「活动」
 */
export function defaultActivityName(
  sportType: SportType,
  startTime: string | Date,
  timeZone = 'Asia/Shanghai',
): string {
  const label = SPORT_TYPE_LABEL[sportType] ?? '活动';
  return `${label} ${formatActivityDateInTz(startTime, timeZone)}`;
}

/** 颂拓等平台自动生成的 GPX 活动名（UTC 时间戳嵌入文件名）。 */
const SUUNTO_AUTO_NAME =
  /^suuntoapp-(?:\w+-)?(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z(?:-track)?$/i;

/** 任意字符串中嵌入的 UTC 时间戳（日期与时分秒用连字符分隔）。 */
const EMBEDDED_UTC_DASH_NAME =
  /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/;

/**
 * 从字符串中提取嵌入的 UTC 时间戳（`YYYY-MM-DDTHH-mm-ssZ`）。
 * @param value 活动名或文件名
 * @returns 解析成功的 Date；无法匹配或非法则返回 null
 */
function parseEmbeddedUtcDashTimestamp(value: string): Date | null {
  const match = value.match(EMBEDDED_UTC_DASH_NAME);
  if (!match) {
    return null;
  }
  // 文件名里时分秒用 `-` 分隔，还原为标准 ISO 后再解析
  const iso = `${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 规范化导入活动名：无名称时用默认名；颂拓等自动名中的 UTC 时间转为目标时区日期。
 * @param name 文件或元数据中的原始名称，可为空
 * @param sportType 运动类型，用于生成默认名
 * @param startTime 活动开始时间（自动名解析失败时的回退）
 * @param timeZone IANA 时区，默认 Asia/Shanghai
 * @returns 可展示的活动名
 */
export function normalizeActivityName(
  name: string | null | undefined,
  sportType: SportType,
  startTime: string | Date,
  timeZone = 'Asia/Shanghai',
): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return defaultActivityName(sportType, startTime, timeZone);
  }

  // 颂拓导出文件名整段匹配时，用嵌入 UTC 时间生成默认名（跨日会落到东八区次日）
  if (SUUNTO_AUTO_NAME.test(trimmed)) {
    const parsed = parseEmbeddedUtcDashTimestamp(trimmed);
    if (parsed) {
      return defaultActivityName(sportType, parsed, timeZone);
    }
  }

  // 名称中夹带 UTC 时间戳时同样改写，避免列表里出现设备自动串
  const embedded = parseEmbeddedUtcDashTimestamp(trimmed);
  if (embedded) {
    return defaultActivityName(sportType, embedded, timeZone);
  }

  return trimmed;
}

/**
 * 列表/详情展示用活动名（兼容历史导入数据）。
 * @param name 已存名称，可为空
 * @param sportType 运动类型
 * @param startTime 活动开始时间
 * @param timeZone IANA 时区，默认 Asia/Shanghai
 * @returns 与 {@link normalizeActivityName} 相同规则的展示名
 */
export function resolveActivityDisplayName(
  name: string | null | undefined,
  sportType: SportType,
  startTime: string | Date,
  timeZone = 'Asia/Shanghai',
): string {
  return normalizeActivityName(name, sportType, startTime, timeZone);
}
