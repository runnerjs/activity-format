import type { TrackPoint } from '../types';
import { estimateTotalDistance } from './geometry';

/** 轨迹清洗逻辑版本号，写入 preservation.meta.cleanupVersion，便于后续升级策略。 */
export const CURRENT_CLEANUP_VERSION = 1;

/** 合法轨迹时间戳的年份下界（排除 1970 epoch、设备未同步等脏数据）。 */
const MIN_VALID_YEAR = 2000;
/** 合法轨迹时间戳的年份上界。 */
const MAX_VALID_YEAR = 2100;

/**
 * 清洗轨迹点：仅过滤无效时间戳，按时间升序排列。
 * 不因缺坐标丢点（§3.1），以便 indoor / 无 GPS 段仍保留心率等指标。
 * @param points 原始轨迹点
 * @returns 时间合法且已按 ISO 时间升序排列的新数组
 */
export function sanitizeTrackPoints(
  points: readonly TrackPoint[],
): TrackPoint[] {
  return [...points]
    .filter((point) => isValidTrackTimestamp(point.t))
    .sort(
      (left, right) =>
        Date.parse(left.t) - Date.parse(right.t),
    );
}

/**
 * 类型守卫：点是否带有合法经纬度。
 * @param point 轨迹点
 * @returns 为 true 时 TypeScript 将 lat/lon 收窄为 number
 */
export function hasValidTrackCoordinate(
  point: TrackPoint,
): point is TrackPoint & { lat: number; lon: number } {
  return (
    point.lon !== undefined &&
    point.lat !== undefined &&
    isValidTrackCoordinate(point.lon, point.lat)
  );
}

/**
 * 过滤出带合法经纬度的轨迹点（地图绘制、距离估算等只需 GPS 点时使用）。
 * @param points 轨迹点
 * @returns 仅含有效坐标的子集（保持原顺序）
 */
export function filterPointsWithCoordinates(
  points: readonly TrackPoint[],
): TrackPoint[] {
  return points.filter(hasValidTrackCoordinate);
}

/**
 * 判断轨迹时间戳是否可解析且落在合理年份区间。
 * @param value ISO 8601 或 Date.parse 可识别的时间字符串
 * @returns 可解析且年份在 [2000, 2100] 内则为 true
 */
export function isValidTrackTimestamp(value: string): boolean {
  return isValidTrackTimestampMs(Date.parse(value));
}

/**
 * 判断 epoch 毫秒是否落在合法轨迹年份区间。
 * @param timeMs Date.parse / Date#getTime 的结果
 * @returns 有限且年份在 [2000, 2100] 内则为 true
 */
export function isValidTrackTimestampMs(timeMs: number): boolean {
  if (!Number.isFinite(timeMs)) {
    return false;
  }
  // 用 UTC 年避免时区把边界日期推到相邻年
  const year = new Date(timeMs).getUTCFullYear();
  return year >= MIN_VALID_YEAR && year <= MAX_VALID_YEAR;
}

/**
 * 判断经纬度是否为有限且落在合法地理范围内。
 * @param lon 经度（度）
 * @param lat 纬度（度）
 * @returns 合法则为 true
 */
export function isValidTrackCoordinate(lon: number, lat: number): boolean {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * 在文件距离、末点累计距离与 GPS 估算之间选取合理活动距离。
 * 优先取与估算值相对误差 ≤ 20% 的候选；否则用估算值；无估算时取第一个正数候选。
 * @param candidates 文件/设备给出的距离候选（米），无效值会被忽略
 * @param estimatedDistanceM 由轨迹点 Haversine 估算的距离（米）；无估算时传 null
 * @returns 选定距离（米，两位小数）；均不可用时返回 null
 */
export function pickReasonableDistanceM(
  candidates: Array<number | null | undefined>,
  estimatedDistanceM: number | null,
): number | null {
  // 丢掉 null / NaN / 非正数，只保留可用候选
  const validCandidates = candidates.filter(
    (value): value is number =>
      value !== null &&
      value !== undefined &&
      Number.isFinite(value) &&
      value > 0,
  );
  if (
    estimatedDistanceM !== null &&
    estimatedDistanceM > 0 &&
    Number.isFinite(estimatedDistanceM)
  ) {
    // 与 GPS 估算相差不超过 20% 的文件距离更可信（避免累计漂移或单位错误）
    const matched = validCandidates.find(
      (value) =>
        Math.abs(value - estimatedDistanceM) / estimatedDistanceM <= 0.2,
    );
    if (matched !== undefined) {
      return round(matched, 2);
    }
    // 候选都偏离过大时回退到 GPS 折线估算
    return round(estimatedDistanceM, 2);
  }
  if (validCandidates.length === 0) {
    return null;
  }
  // 无 GPS 估算时取第一个有效候选（通常是文件 summary）
  return round(validCandidates[0], 2);
}

/**
 * 由首末轨迹点时间差推导活动时长。
 * @param points 已按时间排序的轨迹点
 * @returns 时长（秒，保留 2 位小数）；点数不足或时间非法时返回 null
 */
export function deriveDurationSecFromPoints(
  points: readonly TrackPoint[],
): number | null {
  if (points.length < 2) {
    return null;
  }
  return durationSecFromWallClock(points[0].t, points[points.length - 1].t);
}

/**
 * 由起止墙钟差计算时长，保留 2 位小数。
 * @param start 开始时间（ISO 8601 或 Date.parse 可识别的字符串）
 * @param end 结束时间
 * @returns 时长（秒）；时间非法或结束不晚于开始时返回 null
 */
export function durationSecFromWallClock(
  start: string,
  end: string,
): number | null {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return round((endMs - startMs) / 1000, 2);
}

/**
 * 由轨迹点估算活动二维距离，作为 summary 距离的交叉校验。
 * @param points 轨迹点
 * @returns 累计距离（米）；点数不足时返回 null
 */
export function estimateActivityDistanceM(
  points: readonly TrackPoint[],
): number | null {
  if (points.length < 2) {
    return null;
  }
  return estimateTotalDistance(points);
}

/**
 * 按指定小数位四舍五入。
 * @param value 原值
 * @param decimalPlaces 保留小数位数
 * @returns 四舍五入后的数值
 */
function round(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(value * multiplier) / multiplier;
}
