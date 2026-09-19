import { COORD_SYSTEM } from '../constants';
import type {
  Activity,
  BinaryInput,
  FileFormat,
  FormatTransformMeta,
  ParseOptions,
  TrackSource,
} from '../types';
import { convertActivityCoordinates } from '../coordinates/convert-activity';
import { resolveCoordinateDetection } from '../coordinates/detect';
import { buildPreservation } from '../field-map/preservation';
import { detectFileSource, isAutoTrackSource } from './detect-file-source.util';
import { toNodeBuffer } from '../utils/bytes';

/**
 * 解析前确定设备来源与坐标系上下文。
 *
 * 来源与坐标系可分别由用户显式指定或从文件内容探测，二者独立决策。
 * @param input 文件内容（Uint8Array / ArrayBuffer）
 * @param fileFormat 文件格式（fit / gpx / tcx）
 * @param options 解析选项，可指定来源（source）与原始坐标系（sourceCoordSystem）
 * @returns source 设备/平台来源；activityCoords 含 sourceCoordSystem 与 coordinateDetection
 */
export async function resolveParseContext(
  input: BinaryInput,
  fileFormat: FileFormat,
  options?: ParseOptions,
): Promise<{
  source: TrackSource;
  activityCoords: ReturnType<typeof resolveCoordinateDetection>;
}> {
  // detectFileSource 需要 Node Buffer；统一把 BinaryInput 转成 Buffer
  const buffer = toNodeBuffer(input);
  // 未指定来源或 source=auto 时需轻量解析文件以推断平台与坐标元数据
  const needsProbe =
    options?.source === undefined || isAutoTrackSource(options.source);
  const probe = needsProbe
    ? await detectFileSource(buffer, fileFormat)
    : {
        source: options.source!,
        sourceCoordSystem: undefined,
        hasRecordingDevice: false,
      };

  // 用户显式指定非 auto 来源时优先采用，否则使用探测结果
  const source =
    options?.source && !isAutoTrackSource(options.source)
      ? options.source
      : probe.source;

  // 坐标系优先级：options.sourceCoordSystem > 探测到的 metadata > 按 source 推断
  const activityCoords = resolveCoordinateDetection({
    explicit: options?.sourceCoordSystem,
    source,
    fileFormat,
    hasRecordingDevice: probe.hasRecordingDevice,
    metadataCoordSystem:
      options?.sourceCoordSystem === undefined && needsProbe
        ? probe.sourceCoordSystem
        : undefined,
  });

  return { source, activityCoords };
}

/**
 * 解析收尾：合并上下文、坐标归一化并写入 preservation。
 *
 * 各 parser 在 split 及格式特有后处理后调用，产出最终 Activity。
 * @param core split 提取的统一 Activity 模型（尚未写入来源/坐标探测结果）
 * @param remainder split 产出的 extensions，未映射原始字段
 * @param meta split 记录的变换元信息（cadenceScaled、derivedFields 等）
 * @param parseContext resolveParseContext 的返回值
 * @param sourceActivityIndex 多 Activity TCX 文件中的活动序号（0-based），单活动可省略
 * @returns 完整的 Activity，坐标已统一为 WGS-84，并附带 preservation
 */
export function finalizeParsedActivity(
  core: Activity,
  remainder: Record<string, unknown>,
  meta: FormatTransformMeta,
  parseContext: {
    source: TrackSource;
    activityCoords: ReturnType<typeof resolveCoordinateDetection>;
  },
  sourceActivityIndex?: number,
): Activity {
  // 合并 split core 与解析上下文（来源、坐标系、探测元信息）
  let activity: Activity = {
    ...core,
    summary: {
      ...core.summary,
      source: parseContext.source,
    },
    fileFormat: core.fileFormat,
    sourceCoordSystem: parseContext.activityCoords.sourceCoordSystem,
    coordinateDetection: parseContext.activityCoords.coordinateDetection,
  };

  // 入库统一 WGS-84；写回时按 sourceCoordSystem 用固定转换逆还原，不另存原始坐标
  if (activity.sourceCoordSystem === COORD_SYSTEM.gcj02) {
    activity = convertActivityCoordinates(activity, COORD_SYSTEM.wgs84);
  }

  // remainder 只保留未映射或不可逆残余，已映射字段从 Activity 逆还原
  activity.preservation = buildPreservation(activity, remainder, meta, {
    sourceActivityIndex,
  });
  return activity;
}
