import { FILE_FORMAT } from '../constants';
import type { Activity, BinaryInput, ParseOptions } from '../types';
import { applyDerivers } from '../field-map/derive';
import { split } from '../field-map/split';
import { CURRENT_CLEANUP_VERSION } from '../utils/track-point';
import { finalizeParsedActivity, resolveParseContext } from './finalize-activity';
import { sanitizeGpxRawTrackpoints } from './sanitize-xml-trackpoints';
import { parseXmlConfigB } from './xml-parser-config';

/**
 * 解析 GPX 文件为统一 Activity 模型。
 * @param input GPX 文件内容（Uint8Array / ArrayBuffer）
 * @param options 解析选项，可指定来源（source）与原始坐标系（sourceCoordSystem）
 * @returns 解析后的 Activity，内部坐标已统一为 WGS-84，并附带 preservation 元数据
 */
export async function parseGpx(
  input: BinaryInput,
  options?: ParseOptions,
): Promise<Activity> {
  // 探测设备来源与坐标系（用户显式指定时跳过探测）
  const parseContext = await resolveParseContext(input, FILE_FORMAT.gpx, options);
  // 按 xml2js 配置 B 解析 GPX XML，属性在 `$`、元素恒为数组
  const raw = await parseXmlConfigB(input);
  // GPX 必须至少有一条 <trk>，否则无法映射轨迹
  const trk = (raw.gpx as Record<string, unknown> | undefined)?.trk as
    | unknown[]
    | undefined;
  if (!trk?.[0]) {
    // GPX 文件未包含 trk
    throw new Error('GPX file does not contain a trk');
  }

  // 先清洗 trkpt，再 split，保证 core.points 与 remainder 点数组从同一投影对齐
  sanitizeGpxRawTrackpoints(raw);

  // 将 GPX 树映射为 Activity core，未映射字段保留在 extensions（remainder）
  const { core, extensions, meta } = split(raw, FILE_FORMAT.gpx, {
    source: parseContext.source,
    sourceCoordSystem: parseContext.activityCoords.sourceCoordSystem,
    meta: { derivedFields: [], cleanupVersion: CURRENT_CLEANUP_VERSION },
  });

  if (core.points.length === 0) {
    // GPX 文件未包含有效轨迹点
    throw new Error('GPX file does not contain valid track points');
  }

  // 注册表取值之后：时长 / 距离 / 活动名 / 咕咚 desc 开始时间
  applyDerivers(core, raw, FILE_FORMAT.gpx, meta);

  // 坐标系转换（GCJ-02 → WGS-84）并写入 preservation
  return finalizeParsedActivity(core, extensions, meta, parseContext);
}
