import type { Activity, BinaryInput, ParseOptions } from '../types';
import { FILE_FORMAT } from '../constants';
import { parseFit } from './fit.parser';
import { parseGpx } from './gpx.parser';
import { parseTcx, parseTcxActivities } from './tcx.parser';
import { detectFileFormat } from './detect-file-format';

export { parseFit } from './fit.parser';
export { parseTcx, parseTcxActivities } from './tcx.parser';
export { parseGpx } from './gpx.parser';
export { detectFileFormat } from './detect-file-format';
export {
  detectFileSource,
  isAutoTrackSource,
  resolveSourceCoordSystem,
} from './detect-file-source.util';
export { coordSystemBySource, mapSportType, toNum } from './types';

/**
 * 自动识别文件格式并解析为 Activity（取首条活动）。
 * @param input FIT / GPX / TCX 文件内容（Uint8Array / ArrayBuffer）
 * @param options 解析选项，可指定来源（source）与原始坐标系（sourceCoordSystem）
 * @returns 解析后的 Activity，内部坐标已统一为 WGS-84，并附带 preservation 元数据
 */
export async function parseFile(
  input: BinaryInput,
  options?: ParseOptions,
): Promise<Activity> {
  // TCX 可能含多条 Activity，统一入口只取第一条
  const activities = await parseFileActivities(input, options);
  return activities[0];
}

/**
 * 自动识别文件格式并解析全部 Activity。
 * @param input FIT / GPX / TCX 文件内容（Uint8Array / ArrayBuffer）
 * @param options 解析选项，可指定来源（source）与原始坐标系（sourceCoordSystem）
 * @returns Activity 数组；FIT/GPX 通常仅含一条，TCX 可含多条
 */
export async function parseFileActivities(
  input: BinaryInput,
  options?: ParseOptions,
): Promise<Activity[]> {
  // 先按魔数 / XML 头部识别格式，再分发到对应 parser
  const fileFormat = detectFileFormat(input);
  if (fileFormat === FILE_FORMAT.tcx) {
    return parseTcxActivities(input, options);
  }
  if (fileFormat === FILE_FORMAT.fit) {
    return [await parseFit(input, options)];
  }
  if (fileFormat === FILE_FORMAT.gpx) {
    return [await parseGpx(input, options)];
  }
  // 暂不支持的文件格式
  throw new Error(`Unsupported file format: ${fileFormat}`);
}
