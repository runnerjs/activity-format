import { FILE_FORMAT } from '../constants';
import {
  isValidTrackTimestamp,
  toFitLapTrigger,
  toTcxTriggerMethod,
} from '../utils';
import { sportTypeToGpxType, sportTypeToTcxSport } from '../serializers/sport-label.util';
import { formatXmlDecimal } from '../serializers/xml.util';
import type {
  Activity,
  FileFormat,
  FormatTransformMeta,
} from '../types';
import { fileFormatToSourceFormat } from './constant';
import {
  resolveGpxTrackPointExtensionPrefix,
  xmlNsPrefixForUri,
} from './gpx-xml';
import {
  createEmptyRawRoot,
  isPlainObject,
  parsePath,
  setPathValue,
} from './path-util';
import { entriesForFormat } from './registry';
import type { PathSegment } from './types';

/** Garmin TCX ActivityExtension 命名空间，写出 `*:TPX` 时用来恢复 ns3 等前缀。 */
const TCX_ACTIVITY_EXTENSION_NS =
  'http://www.garmin.com/xmlschemas/ActivityExtension/v2';

/** WGS-84 度数转 FIT 半圆整数的比例因子。 */
const SEMICIRCLES_PER_DEGREE = 2 ** 31 / 180;

/**
 * 把 Activity core 按 FIELD_REGISTRY 反向写回目标格式骨架。
 *
 * 只写映射字段。mapped 原值已从 remainder 剔除，core（含 derivation 纠正后的值）是写回来源。
 * @param core 统一 Activity 模型
 * @param meta 变换元信息（derivedFields / cadenceScaled 影响回写）
 * @param targetFormat 目标文件格式
 * @returns 空骨架上填好映射字段的原生对象
 */
export function reverseMap(
  core: Activity,
  meta: FormatTransformMeta,
  targetFormat: FileFormat,
): Record<string, unknown> {
  const sourceFormat = fileFormatToSourceFormat(targetFormat);
  const root = createEmptyRawRoot(sourceFormat);
  // 按点数/圈数预分配数组槽位，供后续 setPathValue 按索引写入
  ensureRawCapacity(root, sourceFormat, core);
  // FIT 叶子是标量；GPX/TCX 走 xml2js 约定，叶子包成单元素数组
  const pathOptions = {
    leafAsXmlArray: targetFormat !== FILE_FORMAT.fit,
    wildcardPrefix: resolveWildcardPrefix(targetFormat, core),
  };

  for (const { entry, rawPaths } of entriesForFormat(targetFormat)) {
    if (!entry.core) continue;
    if (entry.core === 'laps[].pointRange') continue;
    const hit =
      meta.sourceFormat === sourceFormat
        ? meta.pathHits?.[entry.core]
        : undefined;
    const pathIndex = hit?.index ?? 0;
    const rawPath = rawPaths[pathIndex] ?? rawPaths[0];
    const fieldOptions = {
      ...pathOptions,
      wildcardKeys: hit?.wildcards,
    };

    if (entry.core.startsWith('summary.')) {
      const field = entry.core.slice('summary.'.length);
      const value = readSummaryValue(core, field, targetFormat, meta);
      if (value === undefined) continue;
      setPathValue(root, rawPath, value, leadingArrayZeros(rawPath), fieldOptions);
      continue;
    }

    if (entry.core.startsWith('points[].')) {
      const field = entry.core.slice('points[].'.length);
      core.points.forEach((point, index) => {
        const value = readPointValue(point, field, targetFormat, meta);
        if (value === undefined) return;
        setPathValue(
          root,
          rawPath,
          value,
          pointIndices(sourceFormat, core, index),
          fieldOptions,
        );
      });
      continue;
    }

    if (entry.core.startsWith('laps[].')) {
      const field = entry.core.slice('laps[].'.length);
      core.laps.forEach((lap, index) => {
        const value = readLapValue(lap, field, targetFormat, meta);
        if (value === undefined) return;
        setPathValue(
          root,
          rawPath,
          value,
          lapIndices(sourceFormat, rawPath, index),
          fieldOptions,
        );
      });
    }
  }

  return root;
}

/**
 * 读取 summary 字段并按目标格式改写运动类型标签 / 步频单位。
 * @param core Activity
 * @param field summary 字段名
 * @param format 目标格式（tcx / gpx 需映射 sport 字符串）
 * @param meta cadenceScaled 为 true 时把 spm 除以 2 还原为 rpm
 * @returns 可写入 raw 的值；字段缺失时为 undefined
 */
function readSummaryValue(
  core: Activity,
  field: string,
  format: FileFormat,
  meta: FormatTransformMeta,
): unknown {
  const summary = core.summary as unknown as Record<string, unknown>;
  const value = summary[field];
  if (value === undefined) return undefined;
  if (field === 'sportType') {
    if (format === FILE_FORMAT.tcx) {
      return sportTypeToTcxSport(core.summary.sportType);
    }
    if (format === FILE_FORMAT.gpx) {
      return sportTypeToGpxType(core.summary.sportType);
    }
    // FIT session.sport 默认 running；其余数值字段原样回写
    return 'running';
  }
  if (field === 'avgCadence') {
    return meta.cadenceScaled ? Number(value) / 2 : value;
  }
  return value;
}

/**
 * 读取轨迹点字段，并做 FIT 半圆 / 步频还原。
 * @param point 单个轨迹点
 * @param field TrackPoint 字段名
 * @param format 目标格式
 * @param meta cadenceScaled 为 true 时把 spm 除以 2 还原为 rpm
 * @returns 可写入 raw 的值；字段缺失时为 undefined
 */
function readPointValue(
  point: Activity['points'][number],
  field: string,
  format: FileFormat,
  meta: FormatTransformMeta,
): unknown {
  const value = (point as unknown as Record<string, unknown>)[field];
  if (value === undefined) return undefined;
  if (field === 't' && (typeof value !== 'string' || !isValidTrackTimestamp(value))) {
    return undefined;
  }
  switch (field) {
    case 'lat':
    case 'lon':
      if (format === FILE_FORMAT.fit) {
        return Math.round(Number(value) * SEMICIRCLES_PER_DEGREE);
      }
      return value;
    case 'cad':
      return meta.cadenceScaled ? Number(value) / 2 : value;
    case 'ele':
      return format === FILE_FORMAT.fit
        ? value
        : formatXmlDecimal(Number(value));
    default:
      return value;
  }
}

/**
 * 读取圈摘要字段，并做切圈触发枚举 / 步频还原。
 * @param lap 单个圈摘要
 * @param field LapSummary 字段名
 * @param format 目标格式（tcx / fit 需映射 trigger）
 * @param meta cadenceScaled 为 true 时把 spm 除以 2 还原为 rpm
 * @returns 可写入 raw 的值；字段缺失时为 undefined
 */
function readLapValue(
  lap: Activity['laps'][number],
  field: string,
  format: FileFormat,
  meta: FormatTransformMeta,
): unknown {
  const value = (lap as unknown as Record<string, unknown>)[field];
  if (value === undefined) return undefined;
  switch (field) {
    case 'trigger':
      if (format === FILE_FORMAT.tcx) return toTcxTriggerMethod(value);
      if (format === FILE_FORMAT.fit) return toFitLapTrigger(value);
      return value;
    case 'avgCadence':
    case 'maxCadence':
      return meta.cadenceScaled ? Number(value) / 2 : value;
    default:
      return value;
  }
}

/**
 * 按 core 点数/圈数预分配目标格式的数组槽位。
 * @param root createEmptyRawRoot 产出的空骨架，就地改写
 * @param sourceFormat 目标格式键
 * @param core 用于读取 points / laps 长度
 * @returns 无返回值
 */
function ensureRawCapacity(
  root: Record<string, unknown>,
  sourceFormat: 'fit' | 'tcx' | 'gpx',
  core: Activity,
): void {
  switch (sourceFormat) {
    case 'fit':
      root.recordMesgs = Array.from({ length: core.points.length }, () => ({}));
      root.lapMesgs = Array.from({ length: core.laps.length }, () => ({}));
      root.sessionMesgs = [{}];
      return;
    case 'gpx':
      root.gpx = {
        trk: [
          {
            trkseg: [
              {
                trkpt: Array.from({ length: core.points.length }, () => ({})),
              },
            ],
          },
        ],
      };
      return;
    case 'tcx':
      root.TrainingCenterDatabase = {
        Activities: [
          {
            Activity: [
              {
                // 有 laps 时按 pointRange 为每圈预留 Trackpoint；否则整段点放进单 Lap
                Lap: core.laps.length
                  ? core.laps.map((lap) => ({
                      $: { StartTime: lap.startTime },
                      Track: [
                        {
                          Trackpoint: Array.from(
                            {
                              length:
                                lap.pointRange !== undefined
                                  ? lap.pointRange[1] - lap.pointRange[0] + 1
                                  : 0,
                            },
                            () => ({}),
                          ),
                        },
                      ],
                    }))
                  : [
                      {
                        Track: [
                          {
                            Trackpoint: Array.from(
                              { length: core.points.length },
                              () => ({}),
                            ),
                          },
                        ],
                      },
                    ],
              },
            ],
          },
        ],
      };
      return;
    default:
      return;
  }
}

/**
 * 为路径中每个数组段生成起始下标 0（summary 等单值写入用）。
 * @param path registry 路径 DSL
 * @returns 与数组段等长的 0 数组
 */
function leadingArrayZeros(path: string): number[] {
  return arrayPropSegments(path).map(() => 0);
}

/**
 * 写入第 lapIndex 圈时，路径各层数组应使用的下标。
 *
 * Lap[] / lapMesgs[] 使用圈索引；其后的包装数组（如 AverageHeartRateBpm[]）保持 0。
 * @param sourceFormat 目标格式键
 * @param rawPath registry 路径 DSL
 * @param lapIndex 圈下标
 * @returns 与路径数组段对应的下标列表
 */
function lapIndices(
  sourceFormat: 'fit' | 'tcx' | 'gpx',
  rawPath: string,
  lapIndex: number,
): number[] {
  const segments = arrayPropSegments(rawPath);
  const indices = segments.map(() => 0);
  const lapName = sourceFormat === 'fit' ? 'lapMesgs' : 'Lap';
  const lapPos = segments.findIndex((segment) => segment.name === lapName);
  if (lapPos >= 0) {
    indices[lapPos] = lapIndex;
  } else if (indices.length > 0) {
    indices[indices.length - 1] = lapIndex;
  }
  return indices;
}

function arrayPropSegments(
  path: string,
): Array<Extract<PathSegment, { kind: 'prop' }>> {
  return parsePath(path).filter(
    (segment): segment is Extract<PathSegment, { kind: 'prop' }> =>
      segment.kind === 'prop' && segment.array,
  );
}

function resolveWildcardPrefix(
  targetFormat: FileFormat,
  core: Activity,
): string | undefined {
  if (targetFormat === FILE_FORMAT.gpx) {
    return (
      resolveGpxTrackPointExtensionPrefix(core.preservation?.remainder) ??
      'gpxtpx'
    );
  }
  if (targetFormat === FILE_FORMAT.tcx) {
    return (
      resolveTcxActivityExtensionPrefix(core.preservation?.remainder) ?? 'ns3'
    );
  }
  return undefined;
}

/**
 * 从 TCX remainder 根属性恢复 ActivityExtension 所用前缀。
 * @param remainder split 留下的 TCX 树
 * @returns 原文件前缀；未声明时为 undefined（写出侧回退 `ns3`）
 */
function resolveTcxActivityExtensionPrefix(
  remainder: unknown,
): string | undefined {
  const tcd = isPlainObject(remainder)
    ? remainder.TrainingCenterDatabase
    : undefined;
  const attrs =
    isPlainObject(tcd) && isPlainObject(tcd.$) ? tcd.$ : undefined;
  return xmlNsPrefixForUri(attrs, TCX_ACTIVITY_EXTENSION_NS);
}

/**
 * 计算写入第 pointIndex 个点时，路径各层数组应使用的下标。
 *
 * FIT：`[recordIndex]`；GPX：`[trk, trkseg, trkpt]`；
 * TCX：`[Activities, Activity, Lap, Track, Trackpoint]`，Lap 由 pointRange 定位。
 * @param sourceFormat 目标格式键
 * @param core 用于读取 laps[].pointRange
 * @param pointIndex 全局点下标
 * @returns 与路径数组段对应的下标列表
 */
function pointIndices(
  sourceFormat: 'fit' | 'tcx' | 'gpx',
  core: Activity,
  pointIndex: number,
): number[] {
  if (sourceFormat === 'fit') {
    return [pointIndex];
  }
  if (sourceFormat === 'gpx') {
    return [0, 0, pointIndex];
  }
  for (let lapIndex = 0; lapIndex < core.laps.length; lapIndex += 1) {
    const range = core.laps[lapIndex].pointRange;
    if (!range) continue;
    if (pointIndex >= range[0] && pointIndex <= range[1]) {
      return [0, 0, lapIndex, 0, pointIndex - range[0]];
    }
  }
  // 找不到所属圈时退化为第一圈、按全局下标写入
  return [0, 0, 0, 0, pointIndex];
}
