import { FILE_FORMAT } from '../constants';
import type { Activity, BinaryInput, ParseOptions } from '../types';
import { applyDerivers } from '../field-map/derive';
import { assignFitLapPointRangesFromMessages, toTimeMs } from '../field-map/lap-point-range';
import { split } from '../field-map/split';
import {
  CURRENT_CLEANUP_VERSION,
  isValidTrackTimestampMs,
} from '../utils/track-point';
import { toNum } from './types';
import { decodeFitBuffer, type FitMessages } from './fit-decoder';
import { finalizeParsedActivity, resolveParseContext } from './finalize-activity';

/**
 * 解析 FIT 二进制文件为统一 Activity 模型（佳明/颂拓等设备）。
 * @param input FIT 文件内容（Uint8Array / ArrayBuffer）
 * @param options 解析选项，可指定来源（source）与原始坐标系（sourceCoordSystem）
 * @returns 解析后的 Activity，内部坐标已统一为 WGS-84，并附带 preservation 元数据
 */
export async function parseFit(
  input: BinaryInput,
  options?: ParseOptions,
): Promise<Activity> {
  // 探测设备来源与坐标系（用户显式指定时跳过探测）
  const parseContext = await resolveParseContext(input, FILE_FORMAT.fit, options);

  // 用 @garmin/fitsdk 解码 FIT 二进制为消息字典（recordMesgs、sessionMesgs 等），供后续 split 映射
  const { messages, errors } = await decodeFitBuffer(input);
  if (errors.length > 0) {
    // FIT 解析失败：Decoder 报告 n 个错误
    throw new Error(`FIT parse failed: decoder reported ${errors.length} error(s)`);
  }

  // 先清洗 record，再 split，保证 core.points 与 remainder.recordMesgs 从同一数组投影
  const originalRecordCount = messages.recordMesgs?.length ?? 0;
  const preparedRecordCount = sanitizeFitRecordMesgs(messages);

  // 将 fitsdk 消息对象映射为 Activity core，未映射字段保留在 extensions（remainder）
  const { core, extensions, meta } = split(messages, FILE_FORMAT.fit, {
    source: parseContext.source,
    sourceCoordSystem: parseContext.activityCoords.sourceCoordSystem,
    meta: { derivedFields: [], cleanupVersion: CURRENT_CLEANUP_VERSION },
  });

  // 按 lap.startTime / timestamp 时间窗写 pointRange（下标已是清洗后的数组）
  assignFitLapPointRangesFromMessages(
    core.laps,
    core.points,
    messages.lapMesgs,
    messages.sessionMesgs,
  );
  // 注册表取值之后：按时长 / 距离 / 型号公式补全或纠正
  applyDerivers(core, messages, FILE_FORMAT.fit, meta);

  if (core.points.length === 0) {
    throw new Error(
      buildFitNoTrackPointsError(messages, originalRecordCount, preparedRecordCount),
    );
  }

  // 坐标系转换（GCJ-02 → WGS-84）并写入 preservation
  return finalizeParsedActivity(core, extensions, meta, parseContext);
}

/** FIT fileId.type 中非活动类文件，不含 GPS record，导入时应给出明确提示。 */
const FIT_NON_ACTIVITY_FILE_TYPES = new Set([
  'monitoring_a',
  'monitoring_b',
  'monitoring_daily',
  'activity_summary',
  'settings',
  'device',
  'sport',
  'workout',
  'course',
  'schedules',
  'weight',
  'totals',
  'goals',
  'blood_pressure',
  'segment',
  'segment_list',
]);

/** FIT 坐标半圆（semicircle）转 WGS-84 度数的比例因子。 */
const SEMICIRCLE_SCALE = 180 / 2 ** 31;

interface FitRecordLike {
  timestamp?: unknown;
  positionLat?: number;
  positionLong?: number;
  position_lat?: number;
  position_long?: number;
  position?: { lat: number; long: number };
}

/**
 * 从 FIT record 提取 WGS-84 坐标。
 *
 * 兼容三种字段形态：fitsdk 展开的 position 对象、camelCase 半圆整数、
 * snake_case 扁平度数。绝对值 > 180 时视为半圆并换算为度数。
 * @param record FIT record 消息（字段名因解码选项可能不同）
 * @returns 度数坐标；缺少有效经纬度时为 null
 */
export function getFitRecordPosition(
  record: FitRecordLike,
): { lat: number; lon: number } | null {
  // 优先 expandSubFields 产出的嵌套 position
  const nestedLat = record.position?.lat;
  const nestedLon = record.position?.long;
  if (Number.isFinite(nestedLat) && Number.isFinite(nestedLon)) {
    return { lat: nestedLat!, lon: nestedLon! };
  }

  // 兼容 camelCase / snake_case 扁平字段
  const latRaw = toNum(record.positionLat ?? record.position_lat);
  const lonRaw = toNum(record.positionLong ?? record.position_long);
  if (latRaw === undefined || lonRaw === undefined) {
    return null;
  }

  // FIT 原生存储为 semicircle，fitsdk 未 applyScale 时仍为整数
  if (Math.abs(latRaw) > 180 || Math.abs(lonRaw) > 180) {
    return {
      lat: latRaw * SEMICIRCLE_SCALE,
      lon: lonRaw * SEMICIRCLE_SCALE,
    };
  }
  return { lat: latRaw, lon: lonRaw };
}

/**
 * 过滤无效时间戳并按时间升序排列 recordMesgs，就地写回 messages。
 *
 * 不因缺 GPS 丢点，以便 indoor / 稀疏采样仍保留心率等指标。
 * @param messages fitsdk 消息字典
 * @returns 清洗后仍保留的 record 数量
 */
function sanitizeFitRecordMesgs(messages: FitMessages): number {
  const records = messages.recordMesgs;
  if (!Array.isArray(records) || records.length === 0) {
    return 0;
  }
  const valid = records.filter((record) => {
    const timeMs = toTimeMs((record as { timestamp?: unknown }).timestamp);
    return timeMs !== undefined && isValidTrackTimestampMs(timeMs);
  });
  valid.sort((left, right) => {
    const leftMs = toTimeMs((left as { timestamp?: unknown }).timestamp) ?? 0;
    const rightMs = toTimeMs((right as { timestamp?: unknown }).timestamp) ?? 0;
    return leftMs - rightMs;
  });
  messages.recordMesgs = valid;
  return valid.length;
}

/**
 * 将 fitsdk 返回的 camelCase file type 规范化为 snake_case 以便查表。
 * @param type fileId.type 字符串，如 monitoringA / monitoring-a
 * @returns 小写 snake_case，如 monitoring_a
 */
function normalizeFitFileType(type: string): string {
  return type
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

/**
 * 构造「无轨迹点」错误文案。
 *
 * 区分三种场景：非活动类 FIT 文件、record 存在但均无效、完全无 record。
 * @param messages fitsdk 解码后的消息字典
 * @param originalRecordCount 清洗前的 record 数量
 * @param preparedRecordCount 清洗后仍保留的 record 数量
 * @returns 面向用户的错误说明
 */
function buildFitNoTrackPointsError(
  messages: FitMessages,
  originalRecordCount: number,
  preparedRecordCount: number,
): string {
  // fileId.type 可区分活动文件与监测/设置类文件
  const fileTypeRaw = (
    messages.fileIdMesgs?.[0] as { type?: string } | undefined
  )?.type;
  if (fileTypeRaw) {
    const fileType = normalizeFitFileType(fileTypeRaw);
    if (FIT_NON_ACTIVITY_FILE_TYPES.has(fileType)) {
      // FIT 文件类型为 monitoring 等，属于健康监测或配置类文件，不含 GPS 轨迹点
      return `FIT file type is ${fileType} (health monitoring or settings, no GPS track). Export an Activity file from the watch or app.`;
    }
  }

  if (originalRecordCount > 0 && preparedRecordCount === 0) {
    // FIT 文件中的 record 均缺少有效 GPS 坐标或时间戳，无法生成轨迹
    return 'FIT records have no valid GPS coordinates or timestamps';
  }

  // FIT 文件未包含有效轨迹点
  return 'FIT file does not contain valid track points';
}
