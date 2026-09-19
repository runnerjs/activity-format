import { FILE_FORMAT } from '../constants';
import type { FileFormat } from '../types';

/** extensions 剔除/还原规则版本，结构变更时递增 */
export const CURRENT_SCHEMA_VERSION = 1;

export type SourceFormatKey = 'fit' | 'tcx' | 'gpx';

/**
 * 把 FileFormat 常量收成 sourceFormat 键（与 POINT_ARRAY_PATH 等表对齐）。
 * @param format 文件格式
 * @returns `'fit' | 'tcx' | 'gpx'`
 */
export function fileFormatToSourceFormat(
  format: FileFormat,
): SourceFormatKey {
  switch (format) {
    case FILE_FORMAT.fit:
      return 'fit';
    case FILE_FORMAT.tcx:
      return 'tcx';
    case FILE_FORMAT.gpx:
      return 'gpx';
    default:
      // 不支持的文件格式
      throw new Error(`Unsupported file format: ${format}`);
  }
}

/** merge 时点数组长度对齐校验用的 extensions 路径 */
export const POINT_ARRAY_PATH: Record<SourceFormatKey, string> = {
  fit: 'recordMesgs[]',
  tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[]',
  gpx: 'gpx.trk[].trkseg[].trkpt[]',
};

/** extractCore 时 flatten 点级节点的根路径 */
export const POINT_NODE_ROOT: Record<SourceFormatKey, string> = {
  fit: 'recordMesgs[]',
  tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[]',
  gpx: 'gpx.trk[].trkseg[].trkpt[]',
};

/** extractCore 时 lap 节点根路径 */
export const LAP_NODE_ROOT: Record<SourceFormatKey, string | null> = {
  fit: 'lapMesgs[]',
  tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[]',
  gpx: null,
};
