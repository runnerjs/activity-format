import { FILE_FORMAT } from '../constants';
import type { Activity, BinaryInput, ParseOptions } from '../types';
import { applyDerivers } from '../field-map/derive';
import { countTcxActivities, scopeTcxActivityAtIndex } from '../field-map/scope-raw';
import { split } from '../field-map/split';
import { CURRENT_CLEANUP_VERSION } from '../utils/track-point';
import { finalizeParsedActivity, resolveParseContext } from './finalize-activity';
import { sanitizeTcxRawTrackpoints } from './sanitize-xml-trackpoints';
import { parseXmlConfigB } from './xml-parser-config';

const SPLIT_META = { derivedFields: [], cleanupVersion: CURRENT_CLEANUP_VERSION };

/**
 * 解析 TCX 文件中的第一条 Activity。
 * @param input TCX 文件内容（Uint8Array / ArrayBuffer）
 * @param options 解析选项，可指定来源（source）与原始坐标系（sourceCoordSystem）
 * @returns 解析后的 Activity，内部坐标已统一为 WGS-84，并附带 preservation 元数据
 */
export async function parseTcx(
  input: BinaryInput,
  options?: ParseOptions,
): Promise<Activity> {
  // TCX 可能含多条 Activity，统一入口只取第一条
  const models = await parseTcxActivities(input, options);
  return models[0];
}

/**
 * 解析 TCX 文件中的全部 Activity（多活动文件逐条拆分）。
 * @param input TCX 文件内容（Uint8Array / ArrayBuffer）
 * @param options 解析选项，可指定来源（source）与原始坐标系（sourceCoordSystem）
 * @returns Activity 数组，每条对应文件内一个 Activity
 */
export async function parseTcxActivities(
  input: BinaryInput,
  options?: ParseOptions,
): Promise<Activity[]> {
  // 探测设备来源与坐标系（用户显式指定时跳过探测）
  const parseContext = await resolveParseContext(input, FILE_FORMAT.tcx, options);
  // 按 xml2js 配置 B 解析 TCX XML，属性在 `$`、元素恒为数组
  const raw = await parseXmlConfigB(input);
  // 统计 TrainingCenterDatabase 下的 Activity 条数
  const activityCount = countTcxActivities(raw);
  if (activityCount === 0) {
    // TCX 文件未包含 Activity
    throw new Error('TCX file does not contain an Activity');
  }

  // 先清洗 Trackpoint，再按 Activity split，保证 core.points 与 remainder 点数组对齐
  sanitizeTcxRawTrackpoints(raw);

  const models: Activity[] = [];
  for (let index = 0; index < activityCount; index += 1) {
    // 每次只保留当前 Activity，避免 split 把多活动字段混进同一 remainder
    const scopedRaw = scopeTcxActivityAtIndex(raw, index);
    // 将当前 Activity 的 TCX 树映射为 core，未映射字段保留在 extensions
    const { core, extensions, meta } = split(scopedRaw, FILE_FORMAT.tcx, {
      source: parseContext.source,
      sourceCoordSystem: parseContext.activityCoords.sourceCoordSystem,
      meta: SPLIT_META,
    });
    if (core.points.length === 0) {
      // TCX 第 n 个 Activity 未包含有效轨迹点
      throw new Error(
        `TCX Activity ${index + 1} does not contain valid track points`,
      );
    }
    // 注册表取值之后：按时长 / 距离公式补全或纠正
    applyDerivers(core, scopedRaw, FILE_FORMAT.tcx, meta);
    // 坐标系转换并写入 preservation；index 供多活动写回时定位原始节点
    models.push(
      finalizeParsedActivity(core, extensions, meta, parseContext, index),
    );
  }
  return models;
}
