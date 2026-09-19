import type { LapSummary, TrackPoint } from '../types';

/** 单圈时间窗：startMs 为圈开始；endMs 为 lap.timestamp（圈结束），可缺。 */
export interface LapTimeWindow {
  startMs?: number;
  endMs?: number;
}

/**
 * 把 Date / 毫秒时间戳 / 日期字符串转成 epoch 毫秒。
 * @param value Date、毫秒数或 Date.parse 可识别的字符串
 * @returns 有限毫秒数；无法解析时为 undefined
 */
export function toTimeMs(value: unknown): number | undefined {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const text = String(value ?? '');
  if (!text) return undefined;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 按 lap 时间窗把已排序的轨迹点划入各圈 `pointRange`（两端闭区间）。
 *
 * 有 `endMs`（lap.timestamp）时窗口为 `startMs ≤ t ≤ endMs`；
 * 否则右端用下一圈 `startMs`，半开：`startMs ≤ t < nextStart`。
 * 落在上一圈结束时刻上的点归上一圈（先到先得）。
 * 无命中点的圈省略 `pointRange`。
 * @param laps 待写入 pointRange 的圈列表（文件顺序，不重排）
 * @param points 已按时间升序的轨迹点
 * @param windows 与 laps 按下标对齐的时间窗
 * @param options.sessionEndMs 最后一圈缺 endMs 时回退的 session 结束时间
 * @returns 无返回值，就地改写 laps[].pointRange
 */
export function assignLapPointRangesByTime(
  laps: LapSummary[],
  points: readonly TrackPoint[],
  windows: readonly LapTimeWindow[],
  options?: { sessionEndMs?: number },
): void {
  if (laps.length === 0 || points.length === 0) {
    return;
  }

  const pointTimes = points.map((point) => Date.parse(point.t));
  const owner = new Array<number>(points.length).fill(-1);
  const lastValidPointMs = pointTimes.filter((ms) => Number.isFinite(ms));
  const lastPointMs = lastValidPointMs[lastValidPointMs.length - 1];

  const order = laps
    .map((_, index) => index)
    .filter((index) => windows[index]?.startMs !== undefined)
    .sort((left, right) => {
      const startDelta =
        (windows[left].startMs ?? 0) - (windows[right].startMs ?? 0);
      return startDelta !== 0 ? startDelta : left - right;
    });

  for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
    const lapIndex = order[orderIndex];
    const window = windows[lapIndex];
    const startMs = window.startMs;
    if (startMs === undefined) continue;

    const hasLapTimestamp = window.endMs !== undefined;
    const nextStartMs = hasLapTimestamp
      ? undefined
      : findNextStartMs(order, orderIndex, windows);
    // 有 timestamp 或已无下一圈：闭区间；只用下一圈 startTime：半开
    const endMs = hasLapTimestamp
      ? window.endMs
      : (nextStartMs ?? options?.sessionEndMs ?? lastPointMs);
    const inclusiveEnd = hasLapTimestamp || nextStartMs === undefined;
    if (endMs === undefined) continue;

    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      if (owner[pointIndex] !== -1) continue;
      const timeMs = pointTimes[pointIndex];
      if (!Number.isFinite(timeMs)) continue;
      const inWindow = inclusiveEnd
        ? timeMs >= startMs && timeMs <= endMs
        : timeMs >= startMs && timeMs < endMs;
      if (inWindow) {
        owner[pointIndex] = lapIndex;
      }
    }
  }

  laps.forEach((lap, lapIndex) => {
    let first = -1;
    let last = -1;
    owner.forEach((assigned, pointIndex) => {
      if (assigned !== lapIndex) return;
      if (first === -1) first = pointIndex;
      last = pointIndex;
    });
    if (first === -1) {
      delete lap.pointRange;
      return;
    }
    lap.pointRange = [first, last];
  });
}

/**
 * 从 FIT lap / session 消息给各圈写入时间窗 pointRange。
 *
 * 窗口优先读消息上的 startTime / timestamp；startTime 缺失时回退到已抽出的 lap.startTime。
 * @param laps 与 lapMesgs 按下标对齐的圈摘要
 * @param points 已按时间升序的轨迹点
 * @param lapMesgs FIT lap 消息数组
 * @param sessionMesgs FIT session 消息，取最后一条 timestamp 作末圈回退
 * @returns 无返回值，就地改写 laps[].pointRange
 */
export function assignFitLapPointRangesFromMessages(
  laps: LapSummary[],
  points: readonly TrackPoint[],
  lapMesgs: unknown[] | undefined,
  sessionMesgs: unknown[] | undefined,
): void {
  const messages = lapMesgs ?? [];
  const windows = laps.map((lap, index) => {
    const message = asRecord(messages[index]);
    return {
      startMs: toTimeMs(message?.startTime) ?? toTimeMs(lap.startTime),
      endMs: toTimeMs(message?.timestamp),
    };
  });
  const sessions = sessionMesgs ?? [];
  const lastSession = asRecord(sessions[sessions.length - 1]);
  assignLapPointRangesByTime(laps, points, windows, {
    sessionEndMs: toTimeMs(lastSession?.timestamp),
  });
}

/**
 * 在已按开始时间排序的圈序里，找下一圈的 startMs。
 * @param order 圈下标，已按 startMs 升序
 * @param orderIndex 当前圈在 order 中的位置
 * @param windows 与 laps 对齐的时间窗
 * @returns 下一圈 startMs；没有下一圈时为 undefined
 */
function findNextStartMs(
  order: readonly number[],
  orderIndex: number,
  windows: readonly LapTimeWindow[],
): number | undefined {
  for (let next = orderIndex + 1; next < order.length; next += 1) {
    const startMs = windows[order[next]]?.startMs;
    if (startMs !== undefined) return startMs;
  }
  return undefined;
}

/**
 * 把未知值收窄为普通对象。
 * @param value 任意输入
 * @returns 对象或 undefined
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
