import { FILE_FORMAT } from '../constants';
import type { FileFormat } from '../types';
import { asArray, deepClone, isPlainObject } from './path-util';

/**
 * 将 raw 收窄到 extractCore 应消费的那一场活动。
 *
 * TCX 多 Activity、GPX 多 trk 时只取第一场；FIT 无此结构，原样返回。
 * extensions 仍基于完整 raw 做 deepStrip，不受本函数影响。
 * @param raw 格式原生对象（FIT messages / GPX·TCX xml2js 树）
 * @param format 文件格式
 * @returns 仅含首场活动/首条 trk 的 raw 副本；FIT 为原引用
 */
export function scopeRawForCore(
  raw: unknown,
  format: FileFormat,
): unknown {
  switch (format) {
    case FILE_FORMAT.tcx:
      return scopeTcxActivityAtIndex(raw, 0);
    case FILE_FORMAT.gpx:
      return scopeGpxFirstTrack(raw);
    default:
      return raw;
  }
}

/**
 * 统计 TCX 文件中 Activity 节点数量。
 * @param raw xml2js 解析后的 TCX 树
 * @returns Activity 个数；结构不合规则为 0
 */
export function countTcxActivities(raw: unknown): number {
  if (!isPlainObject(raw)) return 0;
  const tcd = raw.TrainingCenterDatabase;
  if (!isPlainObject(tcd)) return 0;
  // xml2js 下 Activities 可能是单元素数组
  const activitiesWrapper = asArray(tcd.Activities)[0];
  if (!isPlainObject(activitiesWrapper)) return 0;
  return asArray(activitiesWrapper.Activity).filter(isPlainObject).length;
}

/**
 * 仅保留 TCX 中第 index 个 Activity（0-based），供多 Activity 分别入库。
 * @param raw 完整 TCX 树
 * @param index 要保留的 Activity 下标
 * @returns 深拷贝后只含该 Activity 的新树；越界或结构不合规则返回原 raw
 */
export function scopeTcxActivityAtIndex(raw: unknown, index: number): unknown {
  if (!isPlainObject(raw)) return raw;
  const tcd = raw.TrainingCenterDatabase;
  if (!isPlainObject(tcd)) return raw;

  const activitiesWrapper = asArray(tcd.Activities)[0];
  if (!isPlainObject(activitiesWrapper)) return raw;
  const activities = asArray(activitiesWrapper.Activity).filter(isPlainObject);
  const activity = activities[index];
  if (!isPlainObject(activity)) return raw;

  // 深拷贝后替换 Activities，避免改写调用方持有的原树
  const scopedTcd = {
    ...deepClone(tcd),
    Activities: [{ Activity: [deepClone(activity)] }],
  };
  return { ...deepClone(raw), TrainingCenterDatabase: scopedTcd };
}

/**
 * 仅保留 TCX 第一场 Activity（`scopeTcxActivityAtIndex(raw, 0)` 的别名）。
 * @param raw 完整 TCX 树
 * @returns 只含首场 Activity 的新树
 */
function scopeTcxFirstActivity(raw: unknown): unknown {
  return scopeTcxActivityAtIndex(raw, 0);
}

/**
 * 仅保留 GPX 第一条 trk，其余轨道留给 extensions。
 * @param raw 完整 GPX 树
 * @returns 只含首条 trk 的新树；结构不合规则返回原 raw
 */
function scopeGpxFirstTrack(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw;
  const gpx = raw.gpx;
  if (!isPlainObject(gpx)) return raw;

  const trk = asArray(gpx.trk)[0];
  if (!isPlainObject(trk)) return raw;

  const scopedGpx = {
    ...deepClone(gpx),
    trk: [deepClone(trk)],
  };
  return { ...deepClone(raw), gpx: scopedGpx };
}
