import type { FormatTransformMeta } from '../types';
import { CURRENT_CLEANUP_VERSION } from '../utils/track-point';
import {
  CURRENT_SCHEMA_VERSION,
  POINT_ARRAY_PATH,
} from './constant';
import { deepMerge } from './deep-merge';
import { reverseMap } from './reverse-map';
import { resolvePathValues } from './path-util';
import type { MergeAlignment, MergeOptions, SplitResult } from './types';

/**
 * 校验 merge 前 core / extensions / alignment 是否仍对齐。
 *
 * 清洗版本、schema 版本、点数组长度任一不一致都会抛错，避免把错位 remainder 写回文件。
 * @param core split 产出的 Activity
 * @param extensions 未映射原始字段（remainder）；无 remainder 时传 null
 * @param meta 解析阶段记录的变换元信息（sourceFormat / cleanupVersion 等）
 * @param alignment 可选的外部对齐快照（schemaVersion + pointCount）
 * @returns 无返回值；不对齐时抛出 Error
 */
export function assertAlignment(
  core: SplitResult['core'],
  extensions: Record<string, unknown> | null,
  meta: FormatTransformMeta,
  alignment?: MergeAlignment,
): void {
  // 轨迹清洗算法版本必须与当前库一致，否则点过滤规则可能已变
  if (meta.cleanupVersion !== CURRENT_CLEANUP_VERSION) {
    // 清洗规则版本不匹配
    throw new Error(
      `Cleanup version mismatch: data v${meta.cleanupVersion}, current v${CURRENT_CLEANUP_VERSION}`,
    );
  }
  // 外部传入的 mapping schema 版本也需匹配
  if (
    alignment !== undefined &&
    alignment.schemaVersion !== CURRENT_SCHEMA_VERSION
  ) {
    // schema 版本不匹配
    throw new Error(
      `Schema version mismatch: data v${alignment.schemaVersion}, current v${CURRENT_SCHEMA_VERSION}`,
    );
  }

  // 按源格式取点数组路径（recordMesgs[] / Trackpoint[] / trkpt[]）
  const pointPath = POINT_ARRAY_PATH[meta.sourceFormat];
  const extPoints = extensions
    ? resolvePathValues(extensions, pointPath)
    : [];
  // remainder 仍带点数组时，长度必须与 core.points 一一对应
  if (extPoints.length > 0 && extPoints.length !== core.points.length) {
    // extensions 点数组长度与 core.points 不一致
    throw new Error(
      `extensions point array length ${extPoints.length} does not match core.points length ${core.points.length}`,
    );
  }

  // alignment.pointCount 是解析时记下的点数，防止事后增删点后仍合并 remainder
  if (
    alignment !== undefined &&
    alignment.pointCount !== core.points.length
  ) {
    // point_count 与 core.points 不一致
    throw new Error(
      `point_count ${alignment.pointCount} does not match core.points length ${core.points.length}`,
    );
  }
}

/**
 * 将 Activity core 与 extensions 合并回格式原生对象，供 writer 序列化。
 *
 * 先 reverseMap 把 core 写回目标格式骨架，再 deepMerge 叠上 remainder（extensions 优先）。
 * @param core 统一 Activity 模型
 * @param extensions 未映射原始字段；空对象或 null 时只返回 reverseMap 结果
 * @param meta 变换元信息（derivedFields / cadenceScaled 等影响回写）
 * @param options 目标格式与可选 alignment
 * @returns 目标格式原生对象（FIT messages / GPX·TCX xml2xjs 树）
 */
export function merge(
  core: SplitResult['core'],
  extensions: Record<string, unknown> | null,
  meta: FormatTransformMeta,
  options: MergeOptions,
): unknown {
  // 先校验版本与点数，避免错位写回
  assertAlignment(core, extensions, meta, options.alignment);
  // 按 FIELD_REGISTRY 把 core 字段写回目标格式空骨架
  const raw = reverseMap(core, meta, options.targetFormat);
  // 无 remainder 时无需合并，直接返回骨架
  if (!extensions || Object.keys(extensions).length === 0) {
    return raw;
  }
  // extensions 覆盖同路径叶子，保留未映射的厂商扩展字段
  return deepMerge(raw, extensions);
}

export { CURRENT_SCHEMA_VERSION };
