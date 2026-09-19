import { COORD_SYSTEM, FILE_FORMAT, TRACK_SOURCE } from '../constants';
import type {
  CoordSystem,
  CoordinateDetection,
  FileFormat,
  TrackSource,
} from '../types';
import { resolveSourceCoordSystem } from '../parsers/detect-file-source.util';

/** 坐标系探测输入：显式指定、来源、格式与文件元数据。 */
export interface CoordinateResolveInput {
  /** 用户显式指定的原始坐标系，优先级最高 */
  explicit?: CoordSystem;
  source: TrackSource;
  fileFormat: FileFormat;
  hasRecordingDevice: boolean;
  /** 从文件内容探测到的坐标系（如 GPX creator） */
  metadataCoordSystem?: CoordSystem;
}

/** 坐标系探测结果：原始坐标系 + 探测依据。 */
export interface ResolvedCoordinates {
  sourceCoordSystem: CoordSystem;
  coordinateDetection: CoordinateDetection;
}

/**
 * 确定 Activity 的原始坐标系及探测方式。
 *
 * 优先级：用户显式指定 > 文件元数据探测 > 按来源推断 > 默认值。
 * @param input 坐标系解析输入（来源、格式、设备信息及可选的显式/元数据坐标系）
 * @returns 原始坐标系与探测元信息（method / confidence）
 */
export function resolveCoordinateDetection(
  input: CoordinateResolveInput,
): ResolvedCoordinates {
  // 1. 用户显式指定 sourceCoordSystem，置信度最高
  if (input.explicit !== undefined) {
    return {
      sourceCoordSystem: input.explicit,
      coordinateDetection: { method: 'explicit', confidence: 'certain' },
    };
  }

  // 2. 文件内容探测到的坐标系（如 GPX creator、TCX notes 等特征）
  if (input.metadataCoordSystem !== undefined) {
    return {
      sourceCoordSystem: input.metadataCoordSystem,
      coordinateDetection: { method: 'metadata', confidence: 'high' },
    };
  }

  // 3. manual/auto 来源且无元数据时，GPX/TCX 默认 WGS-84 置信度低
  if (
    input.source === TRACK_SOURCE.auto ||
    input.source === TRACK_SOURCE.manual
  ) {
    const inferred = resolveSourceCoordSystem(
      input.source,
      input.fileFormat,
      input.hasRecordingDevice,
    );
    if (
      inferred === COORD_SYSTEM.wgs84 &&
      input.source === TRACK_SOURCE.manual &&
      input.fileFormat !== FILE_FORMAT.fit
    ) {
      return {
        sourceCoordSystem: COORD_SYSTEM.wgs84,
        coordinateDetection: { method: 'default', confidence: 'low' },
      };
    }
  }

  // 4. 按来源 + 格式 + 设备信息推断；manual/auto 置信度低，已知平台置信度高
  const sourceCoordSystem = resolveSourceCoordSystem(
    input.source,
    input.fileFormat,
    input.hasRecordingDevice,
  );
  const confidence: CoordinateDetection['confidence'] =
    input.source === TRACK_SOURCE.manual || input.source === TRACK_SOURCE.auto
      ? 'low'
      : 'high';

  return {
    sourceCoordSystem,
    coordinateDetection: { method: 'source', confidence },
  };
}
