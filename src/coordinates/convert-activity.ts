import { COORD_SYSTEM } from '../constants';
import type { Activity, CoordSystem } from '../types';
import { gcj02ToWgs84Batch } from './gcj02-to-wgs84';
import { wgs84ToGcj02Batch } from './wgs84-to-gcj02';

/**
 * 将 Activity 全部轨迹点转换到目标坐标系。
 *
 * 只改 `points` 的 lon/lat，summary / laps / preservation 原样浅拷贝到新对象。
 * 调用方需保证入参点当前坐标系与目标相反（或相同但境外无偏移）。
 * @param activity 待转换的 Activity（不修改入参）
 * @param target 目标坐标系（wgs84 或 gcj02）
 * @returns 带新 points 数组的 Activity
 */
export function convertActivityCoordinates(
  activity: Activity,
  target: CoordSystem,
): Activity {
  // 入库统一 WGS-84：把 GCJ-02 点批量还原
  if (target === COORD_SYSTEM.wgs84) {
    return {
      ...activity,
      points: gcj02ToWgs84Batch(activity.points),
    };
  }
  // 出库给国内地图：把 WGS-84 点批量加密为 GCJ-02
  return {
    ...activity,
    points: wgs84ToGcj02Batch(activity.points),
  };
}
