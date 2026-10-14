import type { Activity } from '../types';
import type { FitMessages } from './fit-decoder';

/** 至少两次明显回落，避免把累计轨迹里的单次抖动当成咕咚分段距离。 */
const MIN_SEGMENT_DISTANCE_DECREASES = 2;
/**
 * 相对上一值至少少这么多才算回落。
 * 5404→5402 只少了不到 0.1%，是几米误差；23→8、1269→10 这种才是分段距离。
 */
const DISTANCE_DECREASE_RATIO = 0.2;
/** 速度与距离差的相对误差不超过此值，视为对得上。 */
const SPEED_MATCH_TOLERANCE = 0.25;
/** 速度比较至少要有这么多段，才用来决定距离含义。 */
const MIN_SPEED_MATCHES = 3;
/** 超过此时长的间隔多半是暂停，不拿来对速度。 */
const MAX_SPEED_SAMPLE_SEC = 120;
/** 末点与文件总距离相差不超过该值，视为同一份累计距离。 */
const TOTAL_DISTANCE_ABSOLUTE_TOLERANCE_M = 50;
/** 末点与文件总距离的相对误差不超过该值，也视为同一份累计距离。 */
const TOTAL_DISTANCE_RATIO = 0.05;

/**
 * 无厂商 FIT 是否为咕咚 App 导出。以下任一成立即可，不必同时满足：
 * 距离明显回落至少两次、轨迹点带 speed、session 同时有 avgSpeed 与爬升下降。
 * 悦跑圈无厂商 FIT 的距离累计递增，点上有 cadence、没有 speed，session 也没有 avgSpeed 和爬升下降。
 * @param messages 已解码的 FIT 消息
 * @returns 符合任一咕咚特征时为 true
 */
export function isCodoonAppFit(messages: FitMessages): boolean {
  return (
    hasSegmentDistance(messages) ||
    hasRecordSpeed(messages) ||
    hasSessionSpeedAndElevation(messages)
  );
}

function hasSegmentDistance(messages: FitMessages): boolean {
  const records = messages.recordMesgs;
  if (!Array.isArray(records)) {
    return false;
  }
  const distances: number[] = [];
  for (const record of records) {
    const distance = readFiniteNumber(record, 'distance');
    if (distance !== undefined) {
      distances.push(distance);
    }
  }
  return hasRepeatedDistanceDecrease(distances);
}

function hasRecordSpeed(messages: FitMessages): boolean {
  const records = messages.recordMesgs;
  if (!Array.isArray(records)) {
    return false;
  }
  return records.some(
    (record) =>
      readFiniteNumber(record, 'speed') !== undefined ||
      readFiniteNumber(record, 'enhancedSpeed') !== undefined,
  );
}

function hasSessionSpeedAndElevation(messages: FitMessages): boolean {
  const sessions = messages.sessionMesgs;
  if (!Array.isArray(sessions)) {
    return false;
  }
  return sessions.some(
    (session) =>
      readFiniteNumber(session, 'avgSpeed') !== undefined &&
      readFiniteNumber(session, 'totalAscent') !== undefined &&
      readFiniteNumber(session, 'totalDescent') !== undefined,
  );
}

function readFiniteNumber(message: unknown, field: string): number | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  const value = (message as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * 把咕咚 record 上的本段距离累加成从起点起的累计距离，写入统一模型 points[].dist。
 * 先看速度是否对得上相邻差值；再看末点与文件总距离是否在 50 米或 5% 以内；
 * 前两项都无法确认时，才用明显回落判断分段距离。
 * @param points split 后的轨迹点，就地修改 dist
 * @param totalDistanceM 文件 session 总距离（米）；没有时跳过第二优先级
 */
export function accumulateCodoonSegmentDistances(
  points: Activity['points'],
  totalDistanceM?: number,
): void {
  const meaning = classifyDistanceBySpeed(points);
  if (meaning === 'cumulative') {
    return;
  }
  if (meaning !== 'segment') {
    if (lastDistanceAgreesWithTotal(points, totalDistanceM)) {
      return;
    }
    if (!hasRepeatedDistanceDecrease(readDistances(points))) {
      return;
    }
  }

  let total = 0;
  for (const point of points) {
    if (!isFiniteDistance(point.dist)) {
      continue;
    }
    total += point.dist;
    point.dist = total;
  }
}

/**
 * 用速度判断 record.distance 是从起点累计，还是上一点到这一点。
 * 累计：speed × Δt 对得上相邻 dist 差值。分段：speed × Δt 对得上本点 dist。
 */
function classifyDistanceBySpeed(
  points: Activity['points'],
): 'cumulative' | 'segment' | 'unknown' {
  let cumulativeMatches = 0;
  let segmentMatches = 0;
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    if (!isFiniteDistance(current.dist) || !isFiniteDistance(previous.dist)) {
      continue;
    }
    const speed = current.spd;
    const elapsedSec = elapsedSeconds(previous.t, current.t);
    if (
      speed === undefined ||
      !Number.isFinite(speed) ||
      speed < 0 ||
      elapsedSec === undefined ||
      elapsedSec <= 0 ||
      elapsedSec > MAX_SPEED_SAMPLE_SEC
    ) {
      continue;
    }
    const expectedM = speed * elapsedSec;
    const scale = Math.max(expectedM, 1);
    const segmentError = Math.abs(current.dist - expectedM) / scale;
    const deltaM = current.dist - previous.dist;
    const cumulativeError =
      deltaM >= 0 ? Math.abs(deltaM - expectedM) / scale : Number.POSITIVE_INFINITY;
    if (segmentError <= SPEED_MATCH_TOLERANCE && segmentError <= cumulativeError) {
      segmentMatches += 1;
    } else if (cumulativeError <= SPEED_MATCH_TOLERANCE) {
      cumulativeMatches += 1;
    }
  }
  if (cumulativeMatches >= MIN_SPEED_MATCHES && cumulativeMatches > segmentMatches) {
    return 'cumulative';
  }
  if (segmentMatches >= MIN_SPEED_MATCHES && segmentMatches > cumulativeMatches) {
    return 'segment';
  }
  return 'unknown';
}

/**
 * 末点距离和文件总距离是否可以当作同一份累计距离。
 * 绝对误差 50 米以内，或相对误差 5% 以内，满足任一即可。
 * @param points 轨迹点
 * @param totalDistanceM 文件总距离（米）
 * @returns 末点与总距离足够接近时为 true
 */
function lastDistanceAgreesWithTotal(
  points: Activity['points'],
  totalDistanceM: number | undefined,
): boolean {
  const lastDist = lastPositiveDistance(points);
  if (
    lastDist === undefined ||
    totalDistanceM === undefined ||
    !Number.isFinite(totalDistanceM) ||
    totalDistanceM <= 0
  ) {
    return false;
  }
  const differenceM = Math.abs(lastDist - totalDistanceM);
  return (
    differenceM <= TOTAL_DISTANCE_ABSOLUTE_TOLERANCE_M ||
    differenceM / totalDistanceM <= TOTAL_DISTANCE_RATIO
  );
}

function lastPositiveDistance(points: Activity['points']): number | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const dist = points[index]?.dist;
    if (isFiniteDistance(dist) && dist > 0) {
      return dist;
    }
  }
  return undefined;
}

/** 读取 FIT session.totalDistance 合计，作为文件给出的总距离。 */
export function readFitTotalDistanceM(messages: FitMessages): number | undefined {
  const sessions = messages.sessionMesgs;
  if (!Array.isArray(sessions)) {
    return undefined;
  }
  let total = 0;
  let hasValue = false;
  for (const session of sessions) {
    const distance = readFiniteNumber(session, 'totalDistance');
    if (distance === undefined || distance <= 0) {
      continue;
    }
    total += distance;
    hasValue = true;
  }
  return hasValue ? total : undefined;
}

function readDistances(points: Activity['points']): number[] {
  return points
    .map((point) => point.dist)
    .filter((dist): dist is number => isFiniteDistance(dist));
}

function hasRepeatedDistanceDecrease(distances: readonly number[]): boolean {
  if (distances.length < 2) {
    return false;
  }
  let decreases = 0;
  for (let index = 1; index < distances.length; index += 1) {
    if (isSignificantDistanceDecrease(distances[index - 1], distances[index])) {
      decreases += 1;
    }
  }
  return decreases >= MIN_SEGMENT_DISTANCE_DECREASES;
}

function isSignificantDistanceDecrease(previous: number, current: number): boolean {
  return previous > 0 && (previous - current) / previous >= DISTANCE_DECREASE_RATIO;
}

function elapsedSeconds(previousTime: string, currentTime: string): number | undefined {
  const previousMs = Date.parse(previousTime);
  const currentMs = Date.parse(currentTime);
  if (!Number.isFinite(previousMs) || !Number.isFinite(currentMs)) {
    return undefined;
  }
  return (currentMs - previousMs) / 1000;
}

function isFiniteDistance(dist: number | undefined): dist is number {
  return typeof dist === 'number' && Number.isFinite(dist) && dist >= 0;
}
