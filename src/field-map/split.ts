import type { FileFormat, FormatTransformMeta } from '../types';
import { CURRENT_CLEANUP_VERSION } from '../utils/track-point';
import { shouldScaleCadenceToSpm } from '../utils/running-cadence';
import { fileFormatToSourceFormat } from './constant';
import { deepStrip } from './deep-strip';
import { extractCore } from './extract-core';
import { mappedPathsForStrip } from './registry';
import { scopeRawForCore } from './scope-raw';
import type { SplitOptions, SplitResult } from './types';

/**
 * 将原始解析对象拆分为 Activity core 与 extensions（remainder）。
 *
 * core 由 field-map 注册表映射到统一 Activity 模型；
 * extensions 为剔除已映射路径后的原始字段，供 preservation 写回。
 * @param raw 格式原生对象（FIT fitsdk messages / GPX·TCX xml2js 树）
 * @param format 文件格式（fit / gpx / tcx）
 * @param options 来源、坐标系及可选的 meta 片段
 * @returns core、extensions 与变换元信息 meta
 */
export function split(
  raw: unknown,
  format: FileFormat,
  options: SplitOptions,
): SplitResult {
  // 提取 Activity core；TCX/GPX 仅 scope 首场活动/首条 trk，FIT 用完整 raw
  const { core, pathHits } = extractCore(
    scopeRawForCore(raw, format),
    format,
    options,
  );
  // 只剔除实际命中的映射路径；多候选里未用到的别名留在 remainder
  const mappedPaths = mappedPathsForStrip(format, pathHits);
  const stripped = deepStrip(raw, mappedPaths);
  // 记录解析阶段的变换元信息，写入 preservation 供 round-trip 还原
  const meta: FormatTransformMeta = {
    sourceFormat: fileFormatToSourceFormat(format), // fit / gpx / tcx 源格式键
    derivedFields: [...(options.meta?.derivedFields ?? [])], // parser 阶段 derivation 会追加
    cadenceScaled:
      options.meta?.cadenceScaled ??
      shouldScaleCadenceToSpm({
        sportType: core.summary.sportType,
        fileFormat: format,
        source: options.source,
      }), // 是否已将步频换算为 spm（步/分）
    cleanupVersion: options.meta?.cleanupVersion ?? CURRENT_CLEANUP_VERSION, // 轨迹清洗算法版本
    pathHits: Object.keys(pathHits).length > 0 ? pathHits : undefined,
  };

  return {
    core, // 统一 Activity 模型（summary / points / laps）
    extensions: (stripped ?? {}) as Record<string, unknown>, // 未映射原始字段，deepStrip 为空时兜底 {}
    meta, // 步频缩放、derivedFields、cleanupVersion 等变换记录
  };
}
