import { FILE_FORMAT } from '../constants';
import type { Activity, WriteOptions } from '../types';
import { mergeExportXml } from './activity-export';
import { writeTcxLegacy } from './tcx.writer.legacy';

/**
 * 将 Activity 序列化为 TCX XML 字符串。
 *
 * 优先 merge+Builder 保真还原；失败时回退手写 TCX。
 * @param activity 待导出的 Activity
 * @param options 写入选项，可指定目标坐标系与 preservation 合并策略
 * @returns TCX XML 字符串
 */
export function writeTcx(
  activity: Activity,
  options?: WriteOptions,
): string {
  try {
    return mergeExportXml(activity, FILE_FORMAT.tcx, options);
  } catch {
    return writeTcxLegacy(activity);
  }
}

/**
 * 将 Activity 序列化为 TCX XML 字符串（异步 API，行为同 writeTcx）。
 * @param activity 待导出的 Activity
 * @param options 写入选项，可指定目标坐标系与 preservation 合并策略
 * @returns TCX XML 字符串
 */
export async function writeTcxAsync(
  activity: Activity,
  options?: WriteOptions,
): Promise<string> {
  return writeTcx(activity, options);
}
