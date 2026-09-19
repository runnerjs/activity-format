import { FILE_FORMAT } from '../constants';
import type { FileFormat, Activity } from '../types';
import { isPlainObject, unwrapXmlLeaf, xmlLocalName } from '../field-map/path-util';
import {
  durationSecFromWallClock,
  hasValidTrackCoordinate,
  isValidTrackTimestamp,
  toTcxTriggerMethod,
} from '../utils';
import { sportTypeToGpxType, sportTypeToTcxSport } from './sport-label.util';
import {
  GPX_NS,
  GPX_TRACK_POINT_EXTENSION_NS,
  xmlNsPrefixForUri,
} from '../field-map/gpx-xml';
import { formatXmlDecimal } from './xml.util';

const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
const TCX_XSD = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const TCX_ACTIVITY_EXTENSION_NS =
  'http://www.garmin.com/xmlschemas/ActivityExtension/v2';
const TCX_ACTIVITY_EXTENSION_XSD =
  'http://www.garmin.com/xmlschemas/ActivityExtensionv2.xsd';

/** ActivityExtension 在 TCX 树中的本地名（含 ns3:TPX / RunCadence 等）。 */
const TCX_ACTIVITY_EXTENSION_LOCAL_NAMES = new Set([
  'TPX',
  'LX',
  'Speed',
  'RunCadence',
  'AvgRunCadence',
  'MaxRunCadence',
  'AvgSpeed',
  'MaxSpeed',
]);

/**
 * 导出前补 XSD 必填项与根属性（§5.4）。
 *
 * FIT 原样返回；GPX/TCX 补 xmlns、Lap 必填字段、trkpt 坐标等，避免校验失败。
 * @param raw merge 产出的原始树
 * @param targetFormat 目标文件格式
 * @param model 已 prepare 的 Activity，用于填缺省值
 * @returns 补全后的原始树；非对象 raw 原样返回
 */
export function enrichExportRaw(
  raw: unknown,
  targetFormat: FileFormat,
  model: Activity,
): unknown {
  if (!isPlainObject(raw)) {
    return raw;
  }
  switch (targetFormat) {
    case FILE_FORMAT.tcx:
      return enrichTcxRaw(raw, model);
    case FILE_FORMAT.gpx:
      return enrichGpxRaw(raw, model);
    default:
      return raw;
  }
}

/**
 * 补全 TCX TrainingCenterDatabase 根、Activities 与各 Lap 必填子节点。
 * @param raw merge 后的 TCX xml2js 树
 * @param model 用于重建缺失 Activity/Lap 的 Activity
 * @returns 带 xmlns 与必填 Lap 字段的 TCX 树
 */
function enrichTcxRaw(
  raw: Record<string, unknown>,
  model: Activity,
): Record<string, unknown> {
  const tcd = raw.TrainingCenterDatabase;
  if (!isPlainObject(tcd)) {
    return {
      TrainingCenterDatabase: buildTcxRoot(model),
    };
  }

  const root = { ...tcd };
  const activities = asArray(root.Activities)[0];
  if (!isPlainObject(activities)) {
    root.Activities = [buildTcxActivities(model)];
    applyTcxRootNamespaces(root);
    return { TrainingCenterDatabase: root };
  }

  const activity = asArray(activities.Activity)[0];
  if (!isPlainObject(activity)) {
    root.Activities = [buildTcxActivities(model)];
    applyTcxRootNamespaces(root);
    return { TrainingCenterDatabase: root };
  }

  const laps = asArray(activity.Lap);
  root.Activities = [
    {
      ...activities,
      Activity: [
        {
          ...activity,
          Lap: laps.map((lap, index) =>
            enrichTcxLapNode(lap, model.laps[index]),
          ),
        },
      ],
    },
  ];
  applyTcxRootNamespaces(root);
  return { TrainingCenterDatabase: root };
}

/**
 * 补 TCX 根 xmlns / schemaLocation；树里已有 ActivityExtension 时声明 ns3。
 * 原文件 `$` 优先，避免覆盖 round-trip 带来的前缀与 schemaLocation。
 * @param root TrainingCenterDatabase 节点，就地改写 `$`
 * @returns 无返回值
 */
function applyTcxRootNamespaces(root: Record<string, unknown>): void {
  const original$ = isPlainObject(root.$) ? { ...root.$ } : {};
  const attrs: Record<string, unknown> = {
    xmlns: TCX_NS,
    'xmlns:xsi': XSI_NS,
    ...original$,
  };
  const usesExtension = tcxUsesActivityExtension(root);
  if (usesExtension && xmlNsPrefixForUri(attrs, TCX_ACTIVITY_EXTENSION_NS) === undefined) {
    attrs['xmlns:ns3'] = TCX_ACTIVITY_EXTENSION_NS;
  }
  if (attrs['xsi:schemaLocation'] === undefined) {
    attrs['xsi:schemaLocation'] = buildTcxSchemaLocation(
      xmlNsPrefixForUri(attrs, TCX_ACTIVITY_EXTENSION_NS) !== undefined,
    );
  }
  root.$ = attrs;
}

/**
 * Garmin 常用 schemaLocation：命名空间 URI 与 XSD 成对。
 * @param includeActivityExtension 根上已声明 ActivityExtension 时追加第二对
 * @returns schemaLocation 属性值
 */
function buildTcxSchemaLocation(includeActivityExtension: boolean): string {
  const pairs = [`${TCX_NS} ${TCX_XSD}`];
  if (includeActivityExtension) {
    pairs.push(`${TCX_ACTIVITY_EXTENSION_NS} ${TCX_ACTIVITY_EXTENSION_XSD}`);
  }
  return pairs.join(' ');
}

/**
 * 树中是否出现 ActivityExtension 元素（任意 xmlns 前缀）。
 * @param node TCX 子树
 * @returns 含 TPX / RunCadence 等则为 true
 */
function tcxUsesActivityExtension(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((item) => tcxUsesActivityExtension(item));
  }
  if (!isPlainObject(node)) return false;
  for (const [key, value] of Object.entries(node)) {
    if (key === '$') continue;
    if (TCX_ACTIVITY_EXTENSION_LOCAL_NAMES.has(xmlLocalName(key))) {
      return true;
    }
    if (tcxUsesActivityExtension(value)) return true;
  }
  return false;
}

/**
 * 从 Activity 重建一份最小合法 TCX 根节点。
 * @param model 待导出的 Activity
 * @returns TrainingCenterDatabase 内容（含 xmlns 与 Activities）
 */
function buildTcxRoot(model: Activity): Record<string, unknown> {
  const root: Record<string, unknown> = {
    Activities: [buildTcxActivities(model)],
  };
  applyTcxRootNamespaces(root);
  return root;
}

/**
 * 用 Activity 的 sport / startTime / laps 拼 TCX Activities 节点。
 * @param model 待导出的 Activity
 * @returns Activities 对象（配置 B：子节点均为数组）
 */
function buildTcxActivities(model: Activity): Record<string, unknown> {
  const laps =
    model.laps.length > 0
      ? model.laps.map((lap) => enrichTcxLapNode({}, lap))
      : [enrichTcxLapNode({}, inferSingleLap(model))];
  return {
    Activity: [
      {
        $: { Sport: sportTypeToTcxSport(model.summary.sportType) },
        Id: [model.summary.startTime],
        Lap: laps,
      },
    ],
  };
}

/**
 * 为单个 TCX Lap 补 XSD 必填：StartTime、时长、距离、卡路里、Intensity、TriggerMethod。
 * @param lapNode merge 残留的 Lap 节点（可能缺字段）
 * @param lapSummary 对应的统一模型圈摘要，优先于 XML 原值
 * @returns 补全后的 Lap 对象
 */
function enrichTcxLapNode(
  lapNode: unknown,
  lapSummary?: Activity['laps'][number],
): Record<string, unknown> {
  const lap = isPlainObject(lapNode) ? { ...lapNode } : {};
  const duration =
    lapSummary?.durationSec ??
    toNumber(unwrapXmlLeaf(lap.TotalTimeSeconds)) ??
    0;
  const distance =
    lapSummary?.distanceM ?? toNumber(unwrapXmlLeaf(lap.DistanceMeters)) ?? 0;
  const calories =
    lapSummary?.calories ?? toNumber(unwrapXmlLeaf(lap.Calories)) ?? 0;

  if (lap.$ === undefined && lapSummary?.startTime) {
    lap.$ = { StartTime: lapSummary.startTime };
  }
  // 只补缺，不覆盖 reverseMap，避免把 384.33 / 1000.1 取整
  if (unwrapXmlLeaf(lap.TotalTimeSeconds) === undefined) {
    lap.TotalTimeSeconds = [String(duration)];
  }
  if (unwrapXmlLeaf(lap.DistanceMeters) === undefined) {
    lap.DistanceMeters = [String(distance)];
  }
  if (unwrapXmlLeaf(lap.Calories) === undefined) {
    lap.Calories = [String(calories)];
  }
  if (unwrapXmlLeaf(lap.Intensity) === undefined) {
    lap.Intensity = ['Active'];
  }
  if (unwrapXmlLeaf(lap.TriggerMethod) === undefined) {
    lap.TriggerMethod = [toTcxTriggerMethod(lapSummary?.trigger)];
  }
  return lap;
}

/**
 * 补全 GPX 根属性，并保证至少有一条带坐标的 trk。
 * @param raw merge 后的 GPX xml2js 树
 * @param model 无有效 trkpt 时用来重建轨迹
 * @returns 带 version/xmlns 与 trk 的 GPX 树
 */
function enrichGpxRaw(
  raw: Record<string, unknown>,
  model: Activity,
): Record<string, unknown> {
  const gpx = isPlainObject(raw.gpx) ? { ...raw.gpx } : {};
  const original$ = isPlainObject(gpx.$) ? gpx.$ : {};
  const tpxPrefix = xmlNsPrefixForUri(
    original$,
    GPX_TRACK_POINT_EXTENSION_NS,
  );
  const needsTpxXmlns =
    !tpxPrefix && gpxHasTrackPointExtension(gpx);
  gpx.$ = {
    version: '1.1',
    creator: model.summary.creator ?? 'run-project',
    xmlns: GPX_NS,
    ...(needsTpxXmlns
      ? { 'xmlns:gpxtpx': GPX_TRACK_POINT_EXTENSION_NS }
      : {}),
    ...original$,
  };

  const tracks = asArray(gpx.trk);
  if (tracks.length === 0) {
    gpx.trk = [buildGpxTrack(model)];
    return { gpx };
  }

  gpx.trk = tracks.map((trk, trackIndex) => {
    if (!isPlainObject(trk)) {
      return buildGpxTrack(model);
    }
    const segs = asArray(trk.trkseg);
    const trkpts = segs.flatMap((seg) =>
      isPlainObject(seg) ? asArray(seg.trkpt) : [],
    );
    // 丢掉无 lat/lon 的点；第一条轨迹若全无效则整段用 model 重建
    const filtered = trkpts.filter((pt) => hasGpxTrkptCoordinate(pt));
    if (filtered.length === 0 && trackIndex === 0) {
      return buildGpxTrack(model);
    }
    return {
      ...trk,
      trkseg: [{ trkpt: filtered.length > 0 ? filtered : trkpts }],
    };
  });
  return { gpx };
}

/**
 * 从 Activity 重建一条 GPX trk（name / type / 有效坐标点）。
 * @param model 待导出的 Activity
 * @returns 配置 B 形态的 trk 节点
 */
function buildGpxTrack(model: Activity): Record<string, unknown> {
  return {
    name: [model.summary.name ?? 'Activity'],
    type: [sportTypeToGpxType(model.summary.sportType)],
    trkseg: [
      {
        trkpt: model.points.filter(hasValidTrackCoordinate).map((point) => ({
          $: { lat: String(point.lat), lon: String(point.lon) },
          ...(isValidTrackTimestamp(point.t) ? { time: [point.t] } : {}),
          ...(point.ele !== undefined ? { ele: [formatXmlDecimal(point.ele)] } : {}),
        })),
      },
    ],
  };
}

/**
 * 判断 GPX trkpt 是否带有限 lat/lon 属性。
 * @param node xml2js 轨迹点节点
 * @returns 有有效坐标则为 true
 */
function hasGpxTrkptCoordinate(node: unknown): boolean {
  if (!isPlainObject(node)) return false;
  const bucket = node.$;
  if (!isPlainObject(bucket)) return false;
  const lat = Number(bucket.lat);
  const lon = Number(bucket.lon);
  return Number.isFinite(lat) && Number.isFinite(lon);
}

/**
 * 判断 GPX 树里是否已有 TrackPointExtension（任意 xmlns 前缀）。
 * @param gpx GPX 根对象
 * @returns 存在扩展节点则为 true
 */
function gpxHasTrackPointExtension(gpx: Record<string, unknown>): boolean {
  for (const trk of asArray(gpx.trk)) {
    if (!isPlainObject(trk)) continue;
    for (const seg of asArray(trk.trkseg)) {
      if (!isPlainObject(seg)) continue;
      for (const pt of asArray(seg.trkpt)) {
        if (!isPlainObject(pt)) continue;
        for (const ext of asArray(pt.extensions)) {
          if (!isPlainObject(ext)) continue;
          if (
            Object.keys(ext).some(
              (key) => xmlLocalName(key) === 'TrackPointExtension',
            )
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * 无 laps 时用整场轨迹起止时间与总距离合成一圈，供 TCX Lap 必填。
 * @param model 待导出的 Activity
 * @returns 单圈 LapSummary
 */
function inferSingleLap(model: Activity): Activity['laps'][number] {
  const startTime = model.points[0]?.t ?? model.summary.startTime;
  const endTime = model.points[model.points.length - 1]?.t ?? startTime;
  return {
    index: 0,
    startTime,
    durationSec:
      model.summary.durationSec ??
      durationSecFromWallClock(startTime, endTime) ??
      0,
    distanceM: model.summary.distance2dM ?? 0,
  };
}

/**
 * 把 xml2js 可能的单值/数组统一成数组。
 * @param value 单元素、数组或空
 * @returns 空数组或元素数组
 */
function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * 把未知值转成有限数字。
 * @param value 任意值
 * @returns 有限 number，否则 undefined
 */
function toNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
