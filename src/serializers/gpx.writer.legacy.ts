import type { Activity, TrackPoint } from '../types';
import { hasValidTrackCoordinate, isValidTrackTimestamp } from '../utils/track-point';
import { sportTypeToGpxType } from './sport-label.util';
import { escapeXml, formatXmlDecimal } from './xml.util';

/**
 * 手写 GPX（无 merge），作 merge 失败时的回退。
 *
 * 只输出核心字段：name、type、带坐标的 trkpt（ele / time / hr / cad）。
 * @param track 待导出的 Activity
 * @returns GPX 1.1 XML 字符串
 */
export function writeGpxLegacy(track: Activity): string {
  const name = escapeXml(track.summary.name ?? 'Activity');
  const type = escapeXml(sportTypeToGpxType(track.summary.sportType));
  const pointsXml = track.points
    .filter(hasValidTrackCoordinate)
    .map((pt) => formatGpxTrackpoint(pt))
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(track.summary.creator ?? 'run-project')}"`,
    '  xmlns="http://www.topografix.com/GPX/1/1"',
    '  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">',
    '  <trk>',
    `    <name>${name}</name>`,
    `    <type>${type}</type>`,
    '    <trkseg>',
    pointsXml,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
  ].join('\n');
}

/**
 * 把单个轨迹点格式化为 GPX trkpt 片段。
 * @param pt 已确认有有效坐标的 TrackPoint
 * @returns 缩进后的 `<trkpt>` XML；心率/踏频写入 gpxtpx 扩展
 */
function formatGpxTrackpoint(pt: TrackPoint): string {
  const lines = [`      <trkpt lat="${pt.lat}" lon="${pt.lon}">`];
  if (pt.ele !== undefined) {
    lines.push(`        <ele>${formatXmlDecimal(pt.ele)}</ele>`);
  }
  if (isValidTrackTimestamp(pt.t)) {
    lines.push(`        <time>${pt.t}</time>`);
  }
  if (pt.hr !== undefined || pt.cad !== undefined) {
    lines.push('        <extensions>');
    lines.push(
      '          <gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">',
    );
    if (pt.hr !== undefined) {
      lines.push(`            <gpxtpx:hr>${Math.round(pt.hr)}</gpxtpx:hr>`);
    }
    if (pt.cad !== undefined) {
      lines.push(`            <gpxtpx:cad>${Math.round(pt.cad)}</gpxtpx:cad>`);
    }
    lines.push('          </gpxtpx:TrackPointExtension>');
    lines.push('        </extensions>');
  }
  lines.push('      </trkpt>');
  return lines.join('\n');
}
