import { FILE_FORMAT } from '../constants';
import type { Activity, FileFormat, WriteOptions } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../field-map/constant';
import { merge } from '../field-map/merge';
import {
  metaFromActivity,
  prepareActivityForWrite,
  remainderForTarget,
} from '../field-map/preservation';
import { encodeFitMessages } from './fit.writer';
import { writeGpxLegacy } from './gpx.writer.legacy';
import { writeTcxLegacy } from './tcx.writer.legacy';
import { enrichExportRaw } from './enrich-export-raw';
import { serializeConfigBToXml } from './xml-from-raw';

/** 导出选项：在 WriteOptions 上增加对齐用的点数覆盖。 */
export interface ActivityExportOptions extends WriteOptions {
  pointCount?: number;
}

/**
 * 将 Activity merge 为指定格式的原始结构（FIT messages / GPX·TCX xml2js 树）。
 * @param activity 待导出的 Activity
 * @param targetFormat 目标文件格式（fit / gpx / tcx）
 * @param options 写入选项；pointCount 可覆盖对齐点数
 * @returns 可供 Encoder / xml2js Builder 消费的原始对象
 */
export function mergeExportRaw(
  activity: Activity,
  targetFormat: FileFormat,
  options?: ActivityExportOptions,
): Record<string, unknown> {
  // 坐标系转换、按目标格式裁剪 preservation
  const prepared = prepareActivityForWrite(activity, targetFormat, options);
  const meta = metaFromActivity(prepared);
  // 按 auto/always/never 决定是否回填原格式残余字段
  const remainder = remainderForTarget(
    prepared,
    targetFormat,
    options?.preservation ?? 'auto',
  );
  // core + remainder → 目标格式原始树，点数与 mapping 版本用于对齐
  const raw = merge(prepared, remainder, meta, {
    targetFormat,
    alignment: {
      schemaVersion:
        prepared.preservation?.mappingVersion ?? CURRENT_SCHEMA_VERSION,
      pointCount: options?.pointCount ?? prepared.points.length,
    },
  });
  // 补 XSD / FIT 骨架必填项后再交给 writer
  return enrichExportRaw(raw, targetFormat, prepared) as Record<string, unknown>;
}

/**
 * 准备 FIT 编码的两段输入：先转换 core 骨架，remainder 保持 Decoder 原类型。
 * @param activity 待导出的 Activity
 * @param options 写入选项
 * @returns reverseMap 骨架与同格式 remainder
 */
export function prepareFitEncodeParts(
  activity: Activity,
  options?: ActivityExportOptions,
): {
  skeleton: Record<string, unknown>;
  remainder: Record<string, unknown> | null;
} {
  const prepared = prepareActivityForWrite(activity, FILE_FORMAT.fit, options);
  const meta = metaFromActivity(prepared);
  const remainder = remainderForTarget(
    prepared,
    FILE_FORMAT.fit,
    options?.preservation ?? 'auto',
  );
  const skeleton = enrichExportRaw(
    merge(prepared, null, meta, {
      targetFormat: FILE_FORMAT.fit,
      alignment: {
        schemaVersion:
          prepared.preservation?.mappingVersion ?? CURRENT_SCHEMA_VERSION,
        pointCount: options?.pointCount ?? prepared.points.length,
      },
    }),
    FILE_FORMAT.fit,
    prepared,
  ) as Record<string, unknown>;
  return { skeleton, remainder };
}

/**
 * 将 Activity 导出为 GPX / TCX XML。
 *
 * 一律先 merge+Builder（无 remainder 时只有 reverseMap 骨架）；失败再手写 legacy。
 * @param activity 待导出的 Activity
 * @param targetFormat `gpx` 或 `tcx`
 * @param options 写入选项
 * @returns XML 字符串
 */
export function mergeExportXml(
  activity: Activity,
  targetFormat: typeof FILE_FORMAT.gpx | typeof FILE_FORMAT.tcx,
  options?: ActivityExportOptions,
): string {
  try {
    return serializeConfigBToXml(
      mergeExportRaw(activity, targetFormat, options),
    );
  } catch {
    const prepared = prepareActivityForWrite(activity, targetFormat, options);
    return targetFormat === FILE_FORMAT.gpx
      ? writeGpxLegacy(prepared)
      : writeTcxLegacy(prepared);
  }
}

/**
 * 将 Activity 导出为指定格式的 Buffer。
 * @param activity 待导出的 Activity
 * @param targetFormat 目标格式（fit / gpx / tcx）
 * @param options 写入选项
 * @returns FIT 为二进制 Buffer；GPX/TCX 为 UTF-8 Buffer
 */
export async function exportActivityBuffer(
  activity: Activity,
  targetFormat: FileFormat,
  options?: ActivityExportOptions,
): Promise<Buffer> {
  try {
    switch (targetFormat) {
      case FILE_FORMAT.fit: {
        const { skeleton, remainder } = prepareFitEncodeParts(activity, options);
        return encodeFitMessages(skeleton, remainder);
      }
      case FILE_FORMAT.tcx:
        return Buffer.from(mergeExportXml(activity, FILE_FORMAT.tcx, options), 'utf8');
      case FILE_FORMAT.gpx:
        return Buffer.from(mergeExportXml(activity, FILE_FORMAT.gpx, options), 'utf8');
      default:
        // 不支持的导出格式
        throw new Error(`Unsupported export format: ${targetFormat}`);
    }
  } catch (error) {
    // merge/encode 失败时 GPX/TCX 可手写回退；FIT 无 legacy，原错误上抛
    return exportActivityBufferLegacy(activity, targetFormat, error);
  }
}

/**
 * merge 路径失败后的导出回退。
 * @param activity 待导出的 Activity
 * @param targetFormat 目标格式
 * @param cause 主路径抛出的错误（FIT 无回退时原样抛出）
 * @returns GPX/TCX 手写 XML 的 UTF-8 Buffer
 */
async function exportActivityBufferLegacy(
  activity: Activity,
  targetFormat: FileFormat,
  cause: unknown,
): Promise<Buffer> {
  switch (targetFormat) {
    case FILE_FORMAT.gpx:
      return Buffer.from(writeGpxLegacy(activity), 'utf8');
    case FILE_FORMAT.tcx:
      return Buffer.from(writeTcxLegacy(activity), 'utf8');
    case FILE_FORMAT.fit:
      // FIT 导出失败且无可用回退
      throw cause instanceof Error
        ? cause
        : new Error('FIT export failed with no fallback');
    default:
      // 不支持的导出格式
      throw new Error(`Unsupported export format: ${targetFormat}`);
  }
}

/**
 * 将 Activity 导出为指定格式的字符串。
 * @param activity 待导出的 Activity
 * @param targetFormat 目标格式（fit / gpx / tcx）
 * @param options 写入选项
 * @returns GPX/TCX 为 UTF-8 文本；FIT 为 binary 字符串（与 Buffer 字节一一对应）
 */
export async function exportActivityString(
  activity: Activity,
  targetFormat: FileFormat,
  options?: ActivityExportOptions,
): Promise<string> {
  const buffer = await exportActivityBuffer(activity, targetFormat, options);
  return targetFormat === FILE_FORMAT.fit
    ? buffer.toString('binary')
    : buffer.toString('utf8');
}
