import type {
  LapSummary,
  Activity,
  TrackPoint,
} from '../types';
import {
  durationSecFromWallClock,
  hasValidTrackCoordinate,
  toTcxTriggerMethod,
} from '../utils';
import { sportTypeToTcxSport } from './sport-label.util';
import { escapeXml, xmlOptional } from './xml.util';

/**
 * 手写 TCX（无 merge），作 merge 失败时的回退。
 *
 * 按 laps 切分轨迹点，写出 Activity / Lap / Trackpoint 核心字段。
 * @param track 待导出的 Activity
 * @returns TCX v2 XML 字符串
 */
export function writeTcxLegacy(track: Activity): string {
  const sport = escapeXml(sportTypeToTcxSport(track.summary.sportType));
  const activityId = escapeXml(track.summary.startTime);
  const lapSegments = splitPointsByLaps(track.points, track.laps);
  const cadenceScaled =
    track.preservation?.transformations.cadenceScaled ?? false;
  const lapsXml = lapSegments
    .map((segment, index) =>
      formatTcxLap(
        segment,
        track.laps[index] ?? inferLapSummary(segment, index),
        cadenceScaled,
      ),
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase',
    '  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">',
    '  <Activities>',
    `    <Activity Sport="${sport}">`,
    `      <Id>${activityId}</Id>`,
    lapsXml,
    '    </Activity>',
    '  </Activities>',
    '</TrainingCenterDatabase>',
  ].join('\n');
}

/**
 * 按圈开始时间把轨迹点分配到各 lap。
 *
 * 无圈时整段作为一圈；点时间早于所有圈则归入第一圈。
 * @param points 全部轨迹点
 * @param laps 圈摘要（按 index 排序后使用 startTime 切分）
 * @returns 每圈对应的点数组；全空则回退为整段一点组
 */
function splitPointsByLaps(
  points: TrackPoint[],
  laps: LapSummary[],
): TrackPoint[][] {
  if (points.length === 0) {
    return [];
  }
  if (laps.length === 0) {
    return [points];
  }

  const sortedLaps = [...laps].sort((a, b) => a.index - b.index);
  const segments: TrackPoint[][] = sortedLaps.map(() => []);

  for (const pt of points) {
    const t = new Date(pt.t).getTime();
    let lapIdx = 0;
    // 从后往前找「开始时间 ≤ 点时间」的最后一圈
    for (let i = sortedLaps.length - 1; i >= 0; i -= 1) {
      if (t >= new Date(sortedLaps[i].startTime).getTime()) {
        lapIdx = i;
        break;
      }
    }
    segments[lapIdx].push(pt);
  }

  const nonEmpty = segments.filter((segment) => segment.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : [points];
}

/**
 * 无对应 LapSummary 时，用该段点的起止时间与末点累计距离推断一圈。
 * @param points 该圈内的轨迹点
 * @param index 0-based 圈序号
 * @returns 推断出的 LapSummary
 */
function inferLapSummary(points: TrackPoint[], index: number): LapSummary {
  const startTime = points[0]?.t ?? new Date().toISOString();
  const endTime = points[points.length - 1]?.t ?? startTime;
  const durationSec = durationSecFromWallClock(startTime, endTime) ?? 0;
  const distanceM = points[points.length - 1]?.dist ?? 0;
  return {
    index,
    startTime,
    durationSec,
    distanceM,
  };
}

/**
 * 把一圈格式化为 TCX Lap 片段（时长、距离、卡路里、可选心率、Track）。
 * @param points 该圈轨迹点
 * @param lap 圈摘要
 * @param cadenceScaled core 步频是否已换算为 spm，写出时还原为 rpm
 * @returns 缩进后的 `<Lap>` XML
 */
function formatTcxLap(
  points: TrackPoint[],
  lap: LapSummary,
  cadenceScaled: boolean,
): string {
  const startTime = escapeXml(lap.startTime);
  const trackpoints = points.map((pt) => formatTcxTrackpoint(pt)).join('\n');
  const avgHr = xmlOptional(
    'Value',
    lap.avgHr !== undefined ? Math.round(lap.avgHr) : undefined,
  );
  const maxHr = xmlOptional(
    'Value',
    lap.maxHr !== undefined ? Math.round(lap.maxHr) : undefined,
  );
  const maxSpeed = xmlOptional('MaximumSpeed', lap.maxSpeed);
  const cadence = xmlOptional(
    'Cadence',
    lap.avgCadence !== undefined
      ? Math.round(cadenceScaled ? lap.avgCadence / 2 : lap.avgCadence)
      : undefined,
  );

  return [
    `      <Lap StartTime="${startTime}">`,
    `        <TotalTimeSeconds>${lap.durationSec}</TotalTimeSeconds>`,
    `        <DistanceMeters>${lap.distanceM}</DistanceMeters>`,
    maxSpeed ? `        ${maxSpeed}` : '',
    `        <Calories>${lap.calories ?? 0}</Calories>`,
    avgHr ? `        <AverageHeartRateBpm>${avgHr}</AverageHeartRateBpm>` : '',
    maxHr ? `        <MaximumHeartRateBpm>${maxHr}</MaximumHeartRateBpm>` : '',
    '        <Intensity>Active</Intensity>',
    cadence ? `        ${cadence}` : '',
    `        <TriggerMethod>${escapeXml(toTcxTriggerMethod(lap.trigger))}</TriggerMethod>`,
    '        <Track>',
    trackpoints,
    '        </Track>',
    '      </Lap>',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * 把单个轨迹点格式化为 TCX Trackpoint 片段。
 * @param pt 轨迹点（无有效坐标时省略 Position）
 * @returns 缩进后的 `<Trackpoint>` XML；速度写入 ActivityExtension TPX
 */
function formatTcxTrackpoint(pt: TrackPoint): string {
  const lines = [`          <Trackpoint>`, `            <Time>${pt.t}</Time>`];
  if (hasValidTrackCoordinate(pt)) {
    lines.push(
      '            <Position>',
      `              <LatitudeDegrees>${pt.lat}</LatitudeDegrees>`,
      `              <LongitudeDegrees>${pt.lon}</LongitudeDegrees>`,
      '            </Position>',
    );
  }
  if (pt.ele !== undefined) {
    lines.push(`            <AltitudeMeters>${pt.ele}</AltitudeMeters>`);
  }
  if (pt.hr !== undefined) {
    lines.push(
      '            <HeartRateBpm>',
      `              <Value>${Math.round(pt.hr)}</Value>`,
      '            </HeartRateBpm>',
    );
  }
  if (pt.cad !== undefined) {
    lines.push(`            <Cadence>${Math.round(pt.cad)}</Cadence>`);
  }
  if (pt.spd !== undefined) {
    lines.push(
      '            <Extensions>',
      '              <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">',
      `                <Speed>${pt.spd}</Speed>`,
      '              </TPX>',
      '            </Extensions>',
    );
  }
  lines.push('          </Trackpoint>');
  return lines.join('\n');
}
