/** FIT 编码：先清洗 core 骨架，再叠 remainder 原值写出 .fit */
import type { Activity, WriteOptions } from '../types';
import { deepMerge } from '../field-map/deep-merge';
import { loadFitSdk, type Encoder } from '../utils/fit-sdk';
import { sanitizeFitMessage } from './fit-sanitize.util';

/** FIT 消息写入顺序：fileId 必须最先，activity 最后，中间按 Profile 惯例。 */
const FIT_ENCODE_ORDER = [
  'fileIdMesgs',
  'developerDataIdMesgs',
  'fieldDescriptionMesgs',
  'deviceInfoMesgs',
  'eventMesgs',
  'recordMesgs',
  'lapMesgs',
  'sessionMesgs',
  'activityMesgs',
] as const;

/** 核心消息失败时必须抛错；扩展类消息可跳过以免整文件写失败。 */
const CORE_FIT_MESSAGE_KEYS = new Set<string>([
  'fileIdMesgs',
  'eventMesgs',
  'recordMesgs',
  'lapMesgs',
  'sessionMesgs',
  'activityMesgs',
]);

interface FitPosition {
  positionLat?: unknown;
  positionLong?: unknown;
}

/**
 * 将 messages 字典的 key（如 recordMesgs）解析为 FIT Profile 消息号。
 * @param key merge 产出的消息数组字段名，须以 Mesgs 结尾
 * @returns Profile.MesgNum 中的数字编号；未知消息返回 undefined
 */
function mesgNumForKey(
  key: string,
  mesgNumByName: Record<string, number>,
): number | undefined {
  // 去掉 Mesgs 后缀，再把 camelCase 转成 PROFILE 用的 SNAKE_CASE
  const base = key.replace(/Mesgs$/, '');
  const snake = base
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase();
  return mesgNumByName[snake];
}

/**
 * 写入单条 FIT 消息；空对象直接跳过。
 * core 骨架已在叠 remainder 前清洗；remainder 字段保持 Decoder 原类型。
 * @param encoder fitsdk Encoder（只需 onMesg）
 * @param mesgNum Profile 消息号
 * @param message 待写入的字段字典
 */
function writeFitMessage(
  encoder: {
    onMesg: (mesgNum: number, message: Record<string, unknown>) => void;
  },
  mesgNum: number,
  message: Record<string, unknown>,
): void {
  if (Object.keys(message).length === 0) {
    return;
  }
  encoder.onMesg(mesgNum, message);
}

/**
 * 只清洗 reverseMap / 补全后的骨架，不碰 remainder。
 * @param raw 规范化后的 FIT messages
 * @returns 各条消息经 sanitizeFitMessage 后的副本
 */
function sanitizeFitSkeleton(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...raw };
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    sanitized[key] = value.map((item) => {
      if (
        item === null ||
        item === undefined ||
        typeof item !== 'object' ||
        Array.isArray(item)
      ) {
        return item;
      }
      return sanitizeFitMessage(item as Record<string, unknown>);
    });
  }
  return sanitized;
}

/**
 * 把 remainder 里的 developer 字段定义登记到 Encoder，与原文件一致。
 * @param encoder fitsdk Encoder
 * @param raw 已叠 remainder 的 messages
 */
function registerDeveloperFields(
  encoder: Encoder,
  raw: Record<string, unknown>,
): void {
  const ids = asMessageArray(raw.developerDataIdMesgs);
  const descriptions = asMessageArray(raw.fieldDescriptionMesgs);
  if (ids.length === 0 || descriptions.length === 0) {
    return;
  }
  for (const description of descriptions) {
    const developerDataIndex = description.developerDataIndex;
    const developerDataId =
      ids.find((item) => item.developerDataIndex === developerDataIndex) ??
      ids[0];
    const key = fitNumber(
      description.key ?? description.fieldDefinitionNumber,
    );
    if (key === undefined) continue;
    try {
      encoder.addDeveloperField(key, developerDataId, description);
    } catch {
      /* 缺 index 时跳过，避免未登记的 developerFields 拖垮整文件 */
    }
  }
}

/**
 * 把未知值收成「对象数组」，非数组或元素不是普通对象则丢弃。
 * @param value merge 后某类消息字段（可能缺、可能脏）
 * @returns 可安全遍历的 message 对象数组
 */
function asMessageArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );
}

/**
 * 把未知时间值转成有效 Date。
 * @param value Date / ISO 字符串 / 时间戳毫秒
 * @returns 有效 Date；无法解析时返回 undefined
 */
function fitDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return undefined;
}

/**
 * 提取有限数字，供 FIT 数值字段使用。
 * @param value 任意值
 * @returns 有限 number，否则 undefined
 */
function fitNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * 提取非空字符串（去空白）。
 * @param value 任意值
 * @returns 修剪后的字符串，空串返回 undefined
 */
function fitString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * 取消息数组中第一条有效时间（优先 timestamp，其次 startTime）。
 * @param messages record / session / lap 等消息
 * @returns 最早可用 Date；全部无效则 undefined
 */
function firstTimestamp(
  messages: Array<Record<string, unknown>>,
): Date | undefined {
  for (const message of messages) {
    const timestamp = fitDate(message.timestamp ?? message.startTime);
    if (timestamp) {
      return timestamp;
    }
  }
  return undefined;
}

/**
 * 取消息数组中最后一条有效时间（优先 timestamp，其次 startTime）。
 * @param messages record / session / lap 等消息
 * @returns 最晚可用 Date；全部无效则 undefined
 */
function lastTimestamp(
  messages: Array<Record<string, unknown>>,
): Date | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const timestamp = fitDate(
      messages[index].timestamp ?? messages[index].startTime,
    );
    if (timestamp) {
      return timestamp;
    }
  }
  return undefined;
}

/**
 * 计算起止时间间隔（秒），负值钳为 0。
 * @param startTime 开始时间
 * @param endTime 结束时间
 * @returns 时长秒数
 */
function durationSec(startTime: Date, endTime: Date): number {
  return Math.max(0, (endTime.getTime() - startTime.getTime()) / 1000);
}

/**
 * 取第一条带有效 GPS 的 record 坐标。
 * @param records FIT record 消息
 * @returns { positionLat, positionLong }；没有有效点则空对象
 */
function firstPosition(records: Array<Record<string, unknown>>): FitPosition {
  const record = records.find(
    (item) =>
      fitNumber(item.positionLat) !== undefined &&
      fitNumber(item.positionLong) !== undefined,
  );
  return record
    ? {
        positionLat: record.positionLat,
        positionLong: record.positionLong,
      }
    : {};
}

/**
 * 取最后一条带有效 GPS 的 record 坐标。
 * @param records FIT record 消息
 * @returns { positionLat, positionLong }；没有有效点则空对象
 */
function lastPosition(records: Array<Record<string, unknown>>): FitPosition {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (
      fitNumber(record.positionLat) !== undefined &&
      fitNumber(record.positionLong) !== undefined
    ) {
      return {
        positionLat: record.positionLat,
        positionLong: record.positionLong,
      };
    }
  }
  return {};
}

/**
 * 把 record 的 positionLat/Long 改名为 session/lap 的 start/end 坐标字段。
 * @param position record 级坐标
 * @param prefix `start` 或 `end`
 * @returns 如 { startPositionLat, startPositionLong }
 */
function renamePosition(
  position: FitPosition,
  prefix: 'start' | 'end',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (position.positionLat !== undefined) {
    result[`${prefix}PositionLat`] = position.positionLat;
  }
  if (position.positionLong !== undefined) {
    result[`${prefix}PositionLong`] = position.positionLong;
  }
  return result;
}

/**
 * 从后往前取第一条有效累计距离。
 * @param records FIT record 消息
 * @returns 末点 distance（米），没有则 undefined
 */
function lastDistance(
  records: Array<Record<string, unknown>>,
): number | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const distance = fitNumber(records[index].distance);
    if (distance !== undefined) {
      return distance;
    }
  }
  return undefined;
}

/**
 * 补全 session 必填字段（sport、起止时间、时长、圈数等），原字段优先。
 * @param session merge 得到的 session 消息（可为空对象）
 * @param context 从 record/session 推断出的兜底上下文
 * @returns 可写入 Encoder 的 session 消息
 */
function normalizeSessionMessage(
  session: Record<string, unknown>,
  context: {
    startTime: Date;
    endTime: Date;
    totalTimerTime: number;
    totalDistance?: number;
    startPosition: Record<string, unknown>;
    endPosition: Record<string, unknown>;
    numLaps: number;
  },
): Record<string, unknown> {
  // 没有 totalElapsedTime 时用计时时长；再没有则两者互为回退
  const totalElapsedTime =
    fitNumber(session.totalElapsedTime) ?? context.totalTimerTime;
  const totalTimerTime = fitNumber(session.totalTimerTime) ?? totalElapsedTime;
  return {
    ...context.startPosition,
    ...context.endPosition,
    ...(context.totalDistance !== undefined
      ? { totalDistance: context.totalDistance }
      : {}),
    // session 原字段覆盖推断值，再强制补 enum / 时间默认值
    ...session,
    event: fitString(session.event) ?? 'session',
    eventType: fitString(session.eventType) ?? 'stop',
    sport: fitString(session.sport) ?? 'running',
    startTime: fitDate(session.startTime) ?? context.startTime,
    timestamp: fitDate(session.timestamp) ?? context.endTime,
    totalElapsedTime,
    totalTimerTime,
    numLaps: fitNumber(session.numLaps) ?? context.numLaps,
  };
}

/**
 * 补全 lap 必填字段（event、触发方式、时长等），原字段优先。
 * @param lap merge 得到的 lap 消息（可为空对象）
 * @param context 从 record/session 推断出的兜底上下文
 * @returns 可写入 Encoder 的 lap 消息
 */
function normalizeLapMessage(
  lap: Record<string, unknown>,
  context: {
    startTime: Date;
    endTime: Date;
    totalTimerTime: number;
    totalDistance?: number;
    startPosition: Record<string, unknown>;
    endPosition: Record<string, unknown>;
  },
): Record<string, unknown> {
  const totalElapsedTime =
    fitNumber(lap.totalElapsedTime) ?? context.totalTimerTime;
  const totalTimerTime = fitNumber(lap.totalTimerTime) ?? totalElapsedTime;
  return {
    ...context.startPosition,
    ...context.endPosition,
    ...(context.totalDistance !== undefined
      ? { totalDistance: context.totalDistance }
      : {}),
    ...lap,
    event: fitString(lap.event) ?? 'lap',
    eventType: fitString(lap.eventType) ?? 'stop',
    sport: fitString(lap.sport) ?? 'running',
    lapTrigger: fitString(lap.lapTrigger) ?? 'manual',
    startTime: fitDate(lap.startTime) ?? context.startTime,
    timestamp: fitDate(lap.timestamp) ?? context.endTime,
    totalElapsedTime,
    totalTimerTime,
  };
}

/**
 * 为 Encoder 补齐 fileId / session / lap / event / activity 等骨架消息。
 *
 * merge 可能只给出 record；缺少这些消息时手表/平台会拒收文件。
 * @param raw merge 产出的 FIT messages 字典
 * @returns 补全后的 messages，可直接按 FIT_ENCODE_ORDER 写入
 */
function normalizeFitRaw(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...raw };
  const records = asMessageArray(normalized.recordMesgs);
  const sessions = asMessageArray(normalized.sessionMesgs);
  const laps = asMessageArray(normalized.lapMesgs);
  // 时间：record → session → 当前时刻；结束时间至少不低于开始时间
  const startTime =
    firstTimestamp(records) ?? firstTimestamp(sessions) ?? new Date();
  const endTime =
    lastTimestamp(records) ?? firstTimestamp(sessions) ?? startTime;
  // 时长：session 计时/经过时间，再退化为起止差
  const totalTimerTime =
    fitNumber(sessions[0]?.totalTimerTime) ??
    fitNumber(sessions[0]?.totalElapsedTime) ??
    durationSec(startTime, endTime);
  const totalDistance =
    fitNumber(sessions[0]?.totalDistance) ?? lastDistance(records);
  const startPosition = renamePosition(firstPosition(records), 'start');
  const endPosition = renamePosition(lastPosition(records), 'end');
  const numLaps = Math.max(laps.length, records.length > 0 ? 1 : 0);
  const messageContext = {
    startTime,
    endTime,
    totalTimerTime,
    totalDistance,
    startPosition,
    endPosition,
  };

  // 没有 file_id 时补一条 activity 类型，否则 Encoder 写出的文件无法被识别
  if (asMessageArray(normalized.fileIdMesgs).length === 0) {
    normalized.fileIdMesgs = [
      {
        type: 'activity',
        manufacturer: 'development',
        product: 0,
        timeCreated: startTime,
      },
    ];
  }

  if (sessions.length === 0) {
    normalized.sessionMesgs = [
      normalizeSessionMessage({}, { ...messageContext, numLaps }),
    ];
  } else {
    normalized.sessionMesgs = sessions.map((session) =>
      normalizeSessionMessage(session, { ...messageContext, numLaps }),
    );
  }

  // 有轨迹但无圈：合成一圈；已有圈则逐条补字段
  if (laps.length === 0 && records.length > 0) {
    normalized.lapMesgs = [normalizeLapMessage({}, messageContext)];
  } else if (laps.length > 0) {
    normalized.lapMesgs = laps.map((lap) =>
      normalizeLapMessage(lap, messageContext),
    );
  }

  if (asMessageArray(normalized.eventMesgs).length === 0) {
    normalized.eventMesgs = [
      { timestamp: startTime, event: 'timer', eventType: 'start' },
      { timestamp: endTime, event: 'timer', eventType: 'stopAll' },
    ];
  }

  if (asMessageArray(normalized.activityMesgs).length === 0) {
    normalized.activityMesgs = [
      {
        timestamp: endTime,
        totalTimerTime,
        numSessions: Math.max(
          asMessageArray(normalized.sessionMesgs).length,
          1,
        ),
        type: 'manual',
        event: 'activity',
        eventType: 'stop',
      },
    ];
  }

  return normalized;
}

/**
 * 写入单条消息；扩展类消息失败时吞掉错误，核心消息继续抛出。
 * @param encoder fitsdk Encoder
 * @param mesgNum Profile 消息号
 * @param message 待写入字段
 * @param key 消息数组字段名，用于判断是否核心消息
 */
function writeMessageSafely(
  encoder: {
    onMesg: (mesgNum: number, message: Record<string, unknown>) => void;
  },
  mesgNum: number,
  message: Record<string, unknown>,
  key: string,
): void {
  try {
    writeFitMessage(encoder, mesgNum, message);
  } catch (error) {
    if (CORE_FIT_MESSAGE_KEYS.has(key)) {
      throw error;
    }
  }
}

/**
 * 将 core 骨架编码为 .fit；remainder 原样叠入，不再经 sanitizer。
 * @param raw reverseMap / 测试夹具产出的消息字典
 * @param remainder preservation 残余；缺省时只写已清洗的骨架
 * @returns FIT 文件 Buffer
 */
export async function encodeFitMessages(
  raw: Record<string, unknown>,
  remainder?: Record<string, unknown> | null,
): Promise<Buffer> {
  const { Encoder, Profile } = await loadFitSdk();
  const skeleton = sanitizeFitSkeleton(normalizeFitRaw(raw));
  const merged =
    remainder && Object.keys(remainder).length > 0
      ? (deepMerge(skeleton, remainder) as Record<string, unknown>)
      : skeleton;
  const encoder = new Encoder();
  registerDeveloperFields(encoder, merged);
  const written = new Set<string>();

  // 先按固定顺序写标准消息，保证 file_id 在文件头附近
  for (const key of FIT_ENCODE_ORDER) {
    const messages = merged[key];
    if (!Array.isArray(messages)) continue;
    const mesgNum = mesgNumForKey(key, Profile.MesgNum);
    if (mesgNum === undefined) continue;
    written.add(key);
    for (const message of messages) {
      if (message === null || message === undefined) continue;
      if (typeof message !== 'object') continue;
      writeMessageSafely(
        encoder,
        mesgNum,
        message as Record<string, unknown>,
        key,
      );
    }
  }

  // 再写未列入顺序表的扩展消息（developer 字段等）
  for (const [key, messages] of Object.entries(merged)) {
    if (written.has(key) || !Array.isArray(messages)) continue;
    const mesgNum = mesgNumForKey(key, Profile.MesgNum);
    if (mesgNum === undefined) continue;
    for (const message of messages) {
      if (message === null || message === undefined) continue;
      if (typeof message !== 'object') continue;
      writeMessageSafely(
        encoder,
        mesgNum,
        message as Record<string, unknown>,
        key,
      );
    }
  }

  return Buffer.from(encoder.close());
}

/**
 * 将 Activity 序列化为 FIT 二进制。
 * @param activity 待导出的 Activity
 * @param options 写入选项，可指定目标坐标系与 preservation 合并策略
 * @returns FIT 文件二进制（Uint8Array；Node 下实际为 Buffer）
 */
export async function writeFit(
  activity: Activity,
  options?: WriteOptions,
): Promise<Uint8Array> {
  // 动态导入避免与 activity-export 形成循环依赖
  const { prepareFitEncodeParts } = await import('./activity-export');
  const { skeleton, remainder } = prepareFitEncodeParts(activity, options);
  return encodeFitMessages(skeleton, remainder);
}
