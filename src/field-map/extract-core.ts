import { FILE_FORMAT } from '../constants';
import type {
  ActivitySummary,
  FileFormat,
  LapSummary,
  RegistryPathHit,
  SportType,
  Activity,
  TrackPoint,
  TrackSource,
} from '../types';
import {
  isValidTrackTimestamp,
  normalizeCadenceToSpm,
  shouldScaleCadenceToSpm,
} from '../utils';
import {
  coordSystemBySource,
  defaultAltitudeRef,
  mapSportType,
  toNum,
} from '../parsers/types';
import { fileFormatToSourceFormat } from './constant';
import { entriesForFormat } from './registry';
import {
  asArray,
  isPlainObject,
  resolvePathHit,
  resolvePathHitFirst,
  resolvePathValues,
  unwrapXmlLeaf,
} from './path-util';
import type { SplitOptions } from './types';

/** FIT 坐标半圆（semicircle）转度数的比例因子。 */
const SEMICIRCLE_SCALE = 180 / 2 ** 31;

/** summary 中应按整数落库的字段（心率、卡路里等）。时长保留亚秒小数。 */
const SUMMARY_INTEGER_FIELDS = new Set([
  'avgHeartRate',
  'maxHeartRate',
  'avgCadence',
  'totalAscentM',
  'totalDescentM',
  'calories',
]);

/**
 * 按 FIELD_REGISTRY 从格式原生对象抽出统一 Activity core。
 *
 * 先读 summary（含运动类型），再据此决定步频是否换算为 spm，最后抽 points / laps。
 * @param raw 已 scope 到单场活动的原生对象
 * @param format 文件格式（fit / gpx / tcx）
 * @param options 来源与可选坐标系，写入 Activity 元数据
 * @returns core Activity，以及各字段命中的 registry 路径（供 preservation 写回）
 */
export function extractCore(
  raw: unknown,
  format: FileFormat,
  options: SplitOptions,
): { core: Activity; pathHits: Record<string, RegistryPathHit> } {
  // sportType 稍后由 summary 回填，先给步频换算一个跑步默认值
  const cadenceContext = {
    sportType: 1 as SportType,
    fileFormat: format,
    source: options.source,
  };
  const pathHits: Record<string, RegistryPathHit> = {};

  const summary = extractSummary(raw, format, options, cadenceContext, pathHits);
  cadenceContext.sportType = summary.sportType;

  const points = extractPoints(raw, format, cadenceContext, pathHits);
  const laps = extractLaps(raw, format, cadenceContext, pathHits);

  // 文件未声明起止时间时，用首末轨迹点回填；点上没有合法时间则保持空
  if (points.length > 0) {
    const firstTime = points[0].t;
    const lastTime = points[points.length - 1].t;
    if (isValidTrackTimestamp(firstTime)) {
      summary.startTime = summary.startTime ?? firstTime;
    }
    if (isValidTrackTimestamp(lastTime)) {
      summary.endTime = summary.endTime ?? lastTime;
    }
  }

  return {
    core: {
      summary,
      points,
      laps,
      fileFormat: format,
      sourceCoordSystem:
        options.sourceCoordSystem ?? coordSystemBySource(options.source),
      coordinateDetection: { method: 'source', confidence: 'low' },
      altitudeRef: defaultAltitudeRef(options.source),
    },
    pathHits,
  };
}

/**
 * 从 raw 抽取 ActivitySummary。
 *
 * durationSec / distance2dM 对多段值求和（TCX 多 Lap）；其余字段取首个命中值。
 * @param raw 已 scope 的原生对象
 * @param format 文件格式
 * @param options 写入 summary.source
 * @param cadenceContext 步频换算上下文（sportType 会在读到运动类型后更新）
 * @returns 已填默认值与映射字段的 summary
 */
function extractSummary(
  raw: unknown,
  format: FileFormat,
  options: SplitOptions,
  cadenceContext: {
    sportType: SportType;
    fileFormat: FileFormat;
    source: TrackSource;
  },
  pathHits: Record<string, RegistryPathHit>,
): ActivitySummary {
  const summary: ActivitySummary = {
    sportType: 1,
    source: options.source,
    startTime: new Date().toISOString(),
  };

  for (const { entry, rawPaths } of entriesForFormat(format)) {
    if (!entry.core?.startsWith('summary.')) continue;
    const field = entry.core.slice('summary.'.length);
    const picked = firstPathWithValues(raw, rawPaths);
    if (!picked) continue;
    rememberPathHit(pathHits, entry.core, rawPaths, picked.path, picked.wildcards);
    const values = picked.values;
    // 时长/距离在 TCX 中按 Lap 拆分，需累加；海拔跨 session 取极值
    if (field === 'durationSec' || field === 'distance2dM' || field === 'activeDurationSec') {
      const total = values.reduce<number>(
        (sum, value) => sum + (toNum(unwrapXmlLeaf(value)) ?? 0),
        0,
      );
      assignSummaryField(summary, field, total, cadenceContext);
      continue;
    }
    if (field === 'maxAltitudeM' || field === 'minAltitudeM') {
      const nums = values
        .map((value) => toNum(unwrapXmlLeaf(value)))
        .filter((value): value is number => value !== undefined);
      if (nums.length === 0) continue;
      const extreme =
        field === 'maxAltitudeM' ? Math.max(...nums) : Math.min(...nums);
      assignSummaryField(summary, field, extreme, cadenceContext);
      continue;
    }
    assignSummaryField(summary, field, values[0], cadenceContext);
  }

  return summary;
}

/**
 * 从 raw 抽取全部轨迹点。
 *
 * 先收集点级节点，再按 registry 的 `points[].*` 相对路径取值；
 * GPX 心率/步频额外尝试无 TrackPointExtension 包裹的 fallback。
 * @param raw 已 scope 的原生对象
 * @param format 文件格式
 * @param cadenceContext 步频换算上下文
 * @returns TrackPoint 数组，顺序与源文件点顺序一致
 */
function extractPoints(
  raw: unknown,
  format: FileFormat,
  cadenceContext: {
    sportType: SportType;
    fileFormat: FileFormat;
    source: TrackSource;
  },
  pathHits: Record<string, RegistryPathHit>,
): TrackPoint[] {
  const sourceFormat = fileFormatToSourceFormat(format);
  const pointNodes = collectPointNodes(raw, sourceFormat);
  const pointEntries = entriesForFormat(format).filter(({ entry }) =>
    entry.core?.startsWith('points[].'),
  );

  return pointNodes.map((pointNode) => {
    const point: TrackPoint = { t: '' };
    for (const { entry, rawPaths } of pointEntries) {
      const relatives = rawPaths.map((rawPath) =>
        toRelativePointPath(sourceFormat, rawPath),
      );
      const fallbackPaths = GPX_POINT_PATH_FALLBACKS[entry.semantic];
      const candidates =
        sourceFormat === 'gpx' && fallbackPaths
          ? [...relatives, ...fallbackPaths]
          : relatives;
      const hit = resolvePathHitFirst(pointNode, candidates);
      if (hit === undefined) continue;
      assignPointField(
        point,
        entry.core!.slice('points[].'.length),
        hit.value,
        format,
        cadenceContext,
      );
      const fullPath = rawPaths.find(
        (rawPath) => toRelativePointPath(sourceFormat, rawPath) === hit.path,
      );
      if (fullPath && entry.core) {
        rememberPathHit(pathHits, entry.core, rawPaths, fullPath, hit.wildcards);
      }
    }
    return point;
  });
}

/**
 * 从 raw 抽取圈信息，并尽量填上 `pointRange`。
 *
 * TCX 按 Lap 内 Trackpoint 计数累进索引；FIT 的 pointRange 在解析后按时间窗赋值。
 * @param raw 已 scope 的原生对象
 * @param format 文件格式
 * @param cadenceContext 步频换算上下文
 * @returns LapSummary 数组；无圈节点时为空数组
 */
function extractLaps(
  raw: unknown,
  format: FileFormat,
  cadenceContext: {
    sportType: SportType;
    fileFormat: FileFormat;
    source: TrackSource;
  },
  pathHits: Record<string, RegistryPathHit>,
): LapSummary[] {
  const sourceFormat = fileFormatToSourceFormat(format);
  const lapNodes = collectLapNodes(raw, sourceFormat);
  if (lapNodes.length === 0) return [];

  const lapEntries = entriesForFormat(format).filter(({ entry }) =>
    entry.core?.startsWith('laps[].'),
  );

  let pointCursor = 0;
  return lapNodes.map((lapNode, index) => {
    const lap: LapSummary = {
      index,
      startTime: new Date().toISOString(),
      durationSec: 0,
      distanceM: 0,
    };

    for (const { entry, rawPaths } of lapEntries) {
      const suffix = entry.core!.slice('laps[].'.length);
      // pointRange 由下方按点数推算，不从 raw 映射
      if (suffix === 'pointRange') continue;
      const relatives = rawPaths.map((rawPath) =>
        toRelativeLapPath(sourceFormat, rawPath),
      );
      const hit =
        relatives[0]?.length > 0
          ? resolvePathHitFirst(lapNode, relatives)
          : undefined;
      const rawValue =
        hit?.value ??
        (relatives[0]?.length === 0
          ? resolvePathValues(raw, rawPaths[0])[index]
          : undefined);
      if (rawValue === undefined) continue;
      assignLapField(lap, suffix, rawValue, cadenceContext);
      if (hit && entry.core) {
        const fullPath = rawPaths.find(
          (rawPath) => toRelativeLapPath(sourceFormat, rawPath) === hit.path,
        );
        if (fullPath) {
          rememberPathHit(pathHits, entry.core, rawPaths, fullPath, hit.wildcards);
        }
      }
    }

    // TCX Lap 内嵌 Trackpoint，按计数切分全局点索引
    const tpCount = countTrackpointsInLap(lapNode, sourceFormat);
    if (tpCount > 0) {
      lap.pointRange = [pointCursor, pointCursor + tpCount - 1];
      pointCursor += tpCount;
    }

    return lap;
  });
}

const POINT_PATH_PREFIX: Record<'fit' | 'tcx' | 'gpx', string> = {
  fit: 'recordMesgs[].',
  tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].',
  gpx: 'gpx.trk[].trkseg[].trkpt[].',
};

/** GPX extensions 常见形态：有/无 TrackPointExtension 包裹、有/无命名空间前缀 */
const GPX_POINT_PATH_FALLBACKS: Partial<
  Record<string, readonly string[]>
> = {
  pointHr: ['extensions[].*:hr'],
  pointCadence: ['extensions[].*:cad'],
};

const LAP_PATH_PREFIX: Record<'fit' | 'tcx' | 'gpx', string> = {
  fit: 'lapMesgs[].',
  tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].',
  gpx: '',
};

function rememberPathHit(
  hits: Record<string, RegistryPathHit>,
  corePath: string,
  rawPaths: readonly string[],
  usedPath: string,
  wildcards: string[],
): void {
  // 单路径没有候选歧义，不必写入 preservation
  if (rawPaths.length < 2 || hits[corePath]) return;
  const index = rawPaths.indexOf(usedPath);
  if (index < 0) return;
  hits[corePath] =
    wildcards.length > 0 ? { index, wildcards } : { index };
}

function firstPathWithValues(
  raw: unknown,
  rawPaths: readonly string[],
): { path: string; values: unknown[]; wildcards: string[] } | undefined {
  for (const path of rawPaths) {
    const values = resolvePathValues(raw, path);
    if (values.length === 0) continue;
    return {
      path,
      values,
      wildcards: resolvePathHit(raw, path)?.wildcards ?? [],
    };
  }
  return undefined;
}

/**
 * 收集点级节点列表，供逐点映射。
 * @param raw 已 scope 的原生对象
 * @param sourceFormat 源格式键
 * @returns 点节点数组；无法识别时为空数组
 */
function collectPointNodes(
  raw: unknown,
  sourceFormat: 'fit' | 'tcx' | 'gpx',
): unknown[] {
  switch (sourceFormat) {
    case 'fit':
      return asArray((raw as Record<string, unknown>).recordMesgs);
    case 'tcx':
      return resolvePathValues(
        raw,
        'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[]',
      );
    case 'gpx':
      return resolvePathValues(raw, 'gpx.trk[].trkseg[].trkpt[]');
    default:
      return [];
  }
}

/**
 * 收集圈级节点列表。
 * @param raw 已 scope 的原生对象
 * @param sourceFormat 源格式键
 * @returns 圈节点数组；GPX 无 lap 概念时为空
 */
function collectLapNodes(
  raw: unknown,
  sourceFormat: 'fit' | 'tcx' | 'gpx',
): unknown[] {
  switch (sourceFormat) {
    case 'fit':
      return asArray((raw as Record<string, unknown>).lapMesgs);
    case 'tcx':
      return resolvePathValues(
        raw,
        'TrainingCenterDatabase.Activities[].Activity[].Lap[]',
      );
    default:
      return [];
  }
}

/**
 * 统计 TCX Lap 内嵌 Trackpoint 数量，用于切分 pointRange。
 * @param lapNode 单个 Lap 节点
 * @param sourceFormat 源格式键
 * @returns Trackpoint 个数；非 TCX 为 0
 */
function countTrackpointsInLap(
  lapNode: unknown,
  sourceFormat: 'fit' | 'tcx' | 'gpx',
): number {
  if (sourceFormat === 'tcx' && isPlainObject(lapNode)) {
    const tracks = asArray(lapNode.Track);
    return tracks.reduce<number>(
      (sum, track) =>
        sum + asArray((track as Record<string, unknown>).Trackpoint).length,
      0,
    );
  }
  return 0;
}

/**
 * 把 registry 全路径收成相对单个点节点的路径。
 * @param sourceFormat 源格式键
 * @param rawPath registry 中的完整 raw 路径
 * @returns 去掉点数组前缀后的相对路径
 */
function toRelativePointPath(
  sourceFormat: 'fit' | 'tcx' | 'gpx',
  rawPath: string,
): string {
  const prefix = POINT_PATH_PREFIX[sourceFormat];
  return rawPath.startsWith(prefix) ? rawPath.slice(prefix.length) : rawPath;
}

/**
 * 把 registry 全路径收成相对单个圈节点的路径。
 * @param sourceFormat 源格式键
 * @param rawPath registry 中的完整 raw 路径
 * @returns 去掉圈数组前缀后的相对路径；GPX 无前缀时原样返回
 */
function toRelativeLapPath(
  sourceFormat: 'fit' | 'tcx' | 'gpx',
  rawPath: string,
): string {
  const prefix = LAP_PATH_PREFIX[sourceFormat];
  if (!prefix) return rawPath;
  return rawPath.startsWith(prefix) ? rawPath.slice(prefix.length) : rawPath;
}

/**
 * 将单个 raw 值写入 summary 对应字段（含类型规范化）。
 * @param summary 待改写的摘要
 * @param field summary 字段名（不含 `summary.` 前缀）
 * @param rawValue 路径解析得到的原始值
 * @param cadenceContext 读到 sportType / avgCadence 时用于换算
 * @returns 无返回值
 */
function assignSummaryField(
  summary: ActivitySummary,
  field: string,
  rawValue: unknown,
  cadenceContext: {
    sportType: SportType;
    fileFormat: FileFormat;
    source: TrackSource;
  },
): void {
  switch (field) {
    case 'sportType':
      summary.sportType = mapSportType(String(unwrapXmlLeaf(rawValue)));
      cadenceContext.sportType = summary.sportType;
      return;
    case 'startTime':
      summary.startTime = toIsoString(rawValue);
      return;
    case 'endTime':
      summary.endTime = toIsoString(rawValue);
      return;
    case 'name':
    case 'creator':
    case 'deviceManufacturer':
    case 'deviceModel': {
      const text = String(unwrapXmlLeaf(rawValue)).trim();
      if (!text) return;
      (summary as unknown as Record<string, unknown>)[field] = text;
      return;
    }
    case 'avgCadence': {
      const cadence = toNum(unwrapXmlLeaf(rawValue));
      if (cadence !== undefined) {
        summary.avgCadence = normalizeCadenceToSpm(cadence, cadenceContext);
      }
      return;
    }
    default: {
      const num = toNum(unwrapXmlLeaf(rawValue));
      if (num !== undefined) {
        (summary as unknown as Record<string, unknown>)[field] =
          SUMMARY_INTEGER_FIELDS.has(field) ? Math.round(num) : num;
      }
    }
  }
}

/**
 * 将单个 raw 值写入轨迹点字段。
 * @param point 待改写的轨迹点
 * @param field TrackPoint 字段名（t / lat / lon / cad 等）
 * @param rawValue 路径解析得到的原始值
 * @param format 用于 FIT 半圆坐标换算
 * @param cadenceContext 步频换算上下文
 * @returns 无返回值
 */
function assignPointField(
  point: TrackPoint,
  field: string,
  rawValue: unknown,
  format: FileFormat,
  cadenceContext: {
    sportType: SportType;
    fileFormat: FileFormat;
    source: TrackSource;
  },
): void {
  const value = unwrapXmlLeaf(rawValue);
  switch (field) {
    case 't':
      point.t = toIsoString(value);
      return;
    case 'lat':
      point.lat = readCoordinate(value, format);
      return;
    case 'lon':
      point.lon = readCoordinate(value, format);
      return;
    case 'cad': {
      const cadence = toNum(value);
      if (cadence !== undefined) {
        point.cad = normalizeCadenceToSpm(cadence, cadenceContext);
      }
      return;
    }
    default: {
      const num = toNum(value);
      if (num !== undefined) {
        (point as unknown as Record<string, unknown>)[field] = num;
      }
    }
  }
}

/**
 * 将单个 raw 值写入圈摘要字段。
 * @param lap 待改写的圈摘要
 * @param field LapSummary 字段名
 * @param rawValue 路径解析得到的原始值
 * @param cadenceContext 步频换算上下文
 * @returns 无返回值
 */
function assignLapField(
  lap: LapSummary,
  field: string,
  rawValue: unknown,
  cadenceContext: {
    sportType: SportType;
    fileFormat: FileFormat;
    source: TrackSource;
  },
): void {
  const value = unwrapXmlLeaf(rawValue);
  switch (field) {
    case 'startTime':
      lap.startTime = toIsoString(value);
      return;
    case 'trigger':
      lap.trigger = String(value);
      return;
    case 'avgCadence':
    case 'maxCadence': {
      const cadence = toNum(value);
      if (cadence !== undefined) {
        (lap as unknown as Record<string, unknown>)[field] = normalizeCadenceToSpm(
          cadence,
          cadenceContext,
        );
      }
      return;
    }
    default: {
      const num = toNum(value);
      if (num !== undefined) {
        (lap as unknown as Record<string, unknown>)[field] = num;
      }
    }
  }
}

/**
 * 把源格式坐标规范为 WGS-84 度数。
 * @param value 原始经纬度（FIT 半圆整数或 XML 度数）
 * @param format 文件格式
 * @returns 度数；无法解析时为 undefined
 */
function readCoordinate(value: unknown, format: FileFormat): number | undefined {
  const num = toNum(unwrapXmlLeaf(value));
  if (num === undefined) return undefined;
  // FIT 原生存储为 semicircle，需乘比例因子
  if (format === FILE_FORMAT.fit) {
    return num * SEMICIRCLE_SCALE;
  }
  return num;
}

/** 已是 UTC ISO-8601 的文本（可带或不带小数秒），写回时原样保留。 */
const ISO_UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * 把 Date / 时间戳 / 日期字符串规范为 ISO-8601。
 *
 * 源文件已是 `...Z` / `....sssZ` 时保留原文，避免把 `23:32:02Z` 改写成 `23:32:02.000Z`。
 * @param value Date、毫秒时间戳或可 parse 的字符串
 * @returns ISO 字符串；无法解析时回退原文或当前时间
 */
function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const text = String(unwrapXmlLeaf(value) ?? '').trim();
  if (ISO_UTC_TIMESTAMP.test(text) && Number.isFinite(Date.parse(text))) {
    return text;
  }
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return text || new Date().toISOString();
}
