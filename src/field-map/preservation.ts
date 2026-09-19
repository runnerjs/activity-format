import { COORD_SYSTEM, FILE_FORMAT } from '../constants';
import type {
  Activity,
  ActivityPreservation,
  CoordSystem,
  FileFormat,
  FormatTransformMeta,
  WriteOptions,
} from '../types';
import { CURRENT_SCHEMA_VERSION, POINT_ARRAY_PATH, fileFormatToSourceFormat } from './constant';
import { CURRENT_CLEANUP_VERSION } from '../utils/track-point';
import { deepClone, resolvePathValues } from './path-util';
import { convertActivityCoordinates } from '../coordinates/convert-activity';

/**
 * 通过 JSON 序列化做深拷贝（仅适用于可 JSON 化的 plain object）。
 * @param value 任意可序列化值
 * @returns 与入参结构相同的新对象
 */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 组装解析阶段的 preservation，挂到 Activity 上供 round-trip 还原。
 *
 * remainder 只保留未映射、或无法从 core 按固定规则逆还原的原值。
 * 已映射字段（含坐标系 / 单位换算）不另存快照。
 * @param activity 坐标归一化后的 Activity
 * @param remainder deepStrip 后的未映射字段
 * @param meta split 产出的变换元信息
 * @param options 多 Activity 下标
 * @returns 完整 ActivityPreservation
 */
export function buildPreservation(
  activity: Activity,
  remainder: Record<string, unknown>,
  meta: FormatTransformMeta,
  options?: {
    sourceActivityIndex?: number;
  },
): ActivityPreservation {
  return {
    remainder,
    mappingVersion: CURRENT_SCHEMA_VERSION,
    cleanupVersion: meta.cleanupVersion,
    transformations: {
      cadenceScaled: meta.cadenceScaled,
      derivedFields: meta.derivedFields,
      sourceActivityIndex: options?.sourceActivityIndex,
      pathHits: meta.pathHits,
    },
    originalPointCount: activity.points.length,
  };
}

/**
 * 从 Activity.preservation 还原 merge 所需的 FormatTransformMeta。
 * @param activity 带或不带 preservation 的 Activity
 * @returns sourceFormat / derivedFields / cadenceScaled / cleanupVersion
 */
export function metaFromActivity(activity: Activity): FormatTransformMeta {
  const preservation = activity.preservation;
  return {
    sourceFormat: fileFormatToSourceFormat(activity.fileFormat),
    derivedFields: preservation?.transformations.derivedFields ?? [],
    cadenceScaled: preservation?.transformations.cadenceScaled ?? false,
    cleanupVersion:
      preservation?.cleanupVersion ?? CURRENT_CLEANUP_VERSION,
    pathHits: preservation?.transformations.pathHits,
  };
}

/**
 * 校验 preservation 与当前 core 是否仍可安全合并 remainder。
 *
 * 无 preservation 时直接通过；版本或点数不一致则抛错。
 * @param activity 待写出的 Activity
 * @returns 无返回值；不对齐时抛出 Error
 */
export function assertPreservationAlignment(activity: Activity): void {
  const preservation = activity.preservation;
  if (!preservation) {
    return;
  }
  if (preservation.cleanupVersion !== CURRENT_CLEANUP_VERSION) {
    // 清洗规则版本不匹配
    throw new Error(
      `Cleanup version mismatch: data v${preservation.cleanupVersion}, current v${CURRENT_CLEANUP_VERSION}`,
    );
  }
  if (preservation.mappingVersion !== CURRENT_SCHEMA_VERSION) {
    // schema 版本不匹配
    throw new Error(
      `Schema version mismatch: data v${preservation.mappingVersion}, current v${CURRENT_SCHEMA_VERSION}`,
    );
  }
  if (preservation.originalPointCount !== activity.points.length) {
    // point_count 与 core.points 不一致
    throw new Error(
      `point_count ${preservation.originalPointCount} does not match core.points length ${activity.points.length}`,
    );
  }

  const pointPath = POINT_ARRAY_PATH[fileFormatToSourceFormat(activity.fileFormat)];
  const extPoints = resolvePathValues(preservation.remainder, pointPath);
  if (extPoints.length > 0 && extPoints.length !== activity.points.length) {
    // remainder 点数组长度与 core.points 不一致
    throw new Error(
      `remainder point array length ${extPoints.length} does not match core.points length ${activity.points.length}`,
    );
  }
}

/**
 * 决定写出时轨迹点应使用的坐标系。
 *
 * 用户显式指定优先；同格式回写沿用 sourceCoordSystem，跨格式默认 WGS-84。
 * @param activity 当前 Activity
 * @param targetFormat 目标文件格式
 * @param options 写出选项，可带 targetCoordSystem
 * @returns 目标坐标系
 */
export function resolveTargetCoordSystem(
  activity: Activity,
  targetFormat: FileFormat,
  options?: WriteOptions,
): CoordSystem {
  if (options?.targetCoordSystem !== undefined) {
    return options.targetCoordSystem;
  }
  const sameFormat = targetFormat === activity.fileFormat;
  return sameFormat ? activity.sourceCoordSystem : COORD_SYSTEM.wgs84;
}

/**
 * 写出前准备 Activity：对齐校验、按固定规则转换坐标系、剥离 remainder 坐标。
 *
 * 已映射经纬度以当前 Activity 为准，需要 GCJ-02 时用 WGS-84 → GCJ-02 逆还原，
 * 不另存解析前坐标。remainder 里残留的点级坐标会覆盖 reverseMap，必须剥掉。
 * `none`：不做对齐校验，也不带 preservation。
 * @param activity 待写出的 Activity（不修改入参）
 * @param targetFormat 目标文件格式
 * @param options 写出选项（preservation 模式、目标坐标系）
 * @returns 深拷贝后的工作副本
 */
export function prepareActivityForWrite(
  activity: Activity,
  targetFormat: FileFormat,
  options?: WriteOptions,
): Activity {
  const mode = options?.preservation ?? 'auto';
  if (mode !== 'none') {
    assertPreservationAlignment(activity);
  }

  const targetCoord = resolveTargetCoordSystem(activity, targetFormat, options);
  let working: Activity = {
    ...activity,
    summary: cloneJson(activity.summary),
    points: cloneJson(activity.points),
    laps: cloneJson(activity.laps),
    preservation:
      mode === 'none' ? undefined : deepClone(activity.preservation),
  };

  if (targetCoord === COORD_SYSTEM.gcj02) {
    working = convertActivityCoordinates(working, COORD_SYSTEM.gcj02);
  }

  if (mode !== 'none' && working.preservation) {
    working = {
      ...working,
      preservation: stripCoordinateRemainder(
        working.preservation,
        working.fileFormat,
      ),
    };
  }

  return working;
}

/**
 * 从 remainder 中删除点级坐标字段，避免覆盖 reverseMap 写出的 lon/lat。
 * @param preservation 当前 preservation
 * @param fileFormat 源文件格式（目前仅 FIT record 需剥坐标）
 * @returns 带新 remainder 的 preservation 副本
 */
function stripCoordinateRemainder(
  preservation: ActivityPreservation,
  fileFormat: FileFormat,
): ActivityPreservation {
  const remainder = deepClone(preservation.remainder);
  if (fileFormat === FILE_FORMAT.fit && Array.isArray(remainder.recordMesgs)) {
    remainder.recordMesgs = remainder.recordMesgs.map((record) => {
      if (!record || typeof record !== 'object') return record;
      const next = { ...(record as Record<string, unknown>) };
      delete next.positionLat;
      delete next.positionLong;
      delete next.position_lat;
      delete next.position_long;
      delete next.position;
      return next;
    });
  }
  return { ...preservation, remainder };
}

/**
 * 按 preservation 模式决定写出时是否带 remainder。
 *
 * 跨格式写出时 remainder 结构不兼容，一律丢弃。
 * @param activity 当前 Activity
 * @param targetFormat 目标文件格式
 * @param mode preservation 模式，默认 `auto`
 * @returns 可 merge 的 remainder；不应使用时为 null
 */
export function remainderForTarget(
  activity: Activity,
  targetFormat: FileFormat,
  mode: WriteOptions['preservation'] = 'auto',
): Record<string, unknown> | null {
  if (mode === 'none' || !activity.preservation) {
    return null;
  }
  if (fileFormatToSourceFormat(targetFormat) !== fileFormatToSourceFormat(activity.fileFormat)) {
    return null;
  }
  const remainder = activity.preservation.remainder;
  if (!remainder || Object.keys(remainder).length === 0) {
    return null;
  }
  return remainder;
}
