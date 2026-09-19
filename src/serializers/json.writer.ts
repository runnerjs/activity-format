import type { Activity, WriteJsonOptions } from '../types';

/**
 * 将 Activity 序列化为 JSON 字符串。
 * @param activity 待导出的 Activity
 * @param options JSON 写入选项，可控制缩进、是否包含 preservation、是否保留 undefined
 * @returns JSON 字符串
 */
export function writeJson(
  activity: Activity,
  options?: WriteJsonOptions,
): string {
  const indent = options?.indent ?? 2;
  // 默认去掉 preservation，避免把原格式残余一并导出给业务消费
  const payload = options?.includePreservation
    ? activity
    : {
        summary: activity.summary,
        points: activity.points,
        laps: activity.laps,
        fileFormat: activity.fileFormat,
        sourceCoordSystem: activity.sourceCoordSystem,
        coordinateDetection: activity.coordinateDetection,
        altitudeRef: activity.altitudeRef,
      };
  return JSON.stringify(payload, jsonReplacer(options?.keepUndefined), indent);
}

/**
 * 将 Activity 序列化为 JSON 字符串（异步 API，行为同 writeJson）。
 * @param activity 待导出的 Activity
 * @param options JSON 写入选项，可控制缩进、是否包含 preservation 等
 * @returns JSON 字符串
 */
export async function writeJsonAsync(
  activity: Activity,
  options?: WriteJsonOptions,
): Promise<string> {
  return writeJson(activity, options);
}

/**
 * 生成 JSON.stringify 的 replacer：keepUndefined 时把 undefined 写成 null。
 * @param keepUndefined 为 true 时保留原本会被丢掉的 undefined 字段
 * @returns stringify replacer；不保留时返回 undefined（走默认行为）
 */
function jsonReplacer(
  keepUndefined?: boolean,
): ((key: string, value: unknown) => unknown) | undefined {
  if (!keepUndefined) {
    return undefined;
  }
  return (_key, value) => (value === undefined ? null : value);
}
