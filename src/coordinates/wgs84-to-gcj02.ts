/**
 * WGS-84 转 GCJ-02（火星坐标系）。
 *
 * 用于出库后展示：国内地图瓦片（高德/腾讯/百度）需 WGS-84 转 GCJ-02 后才能正确叠加。
 * 境外坐标无偏移，原样返回。
 */

import { gcj02Offset, isOutOfChina } from './gcj02-core';
import type { LngLat, LngLatLike } from '../types';

/**
 * 将单个 WGS-84 坐标转为 GCJ-02（火星坐标系）。
 * @param lon 经度（WGS-84）
 * @param lat 纬度（WGS-84）
 * @returns GCJ-02 经纬度；境外坐标原样返回
 */
export function wgs84ToGcj02(lon: number, lat: number): LngLat {
  // 境外无 GCJ-02 加密，直接返回避免误偏
  if (isOutOfChina(lon, lat)) {
    return { lon, lat };
  }
  // 偏移量基于 WGS-84 计算，相加即得 GCJ-02
  const offset = gcj02Offset(lon, lat);
  return { lon: lon + offset.lon, lat: lat + offset.lat };
}

/**
 * 批量将 WGS-84 坐标序列转为 GCJ-02，保留点的其余字段。
 * @param points 含 lon/lat 的点对象数组
 * @returns 转换后的新数组（不修改入参）
 */
export function wgs84ToGcj02Batch<T extends LngLatLike>(points: readonly T[]): T[] {
  return points.map((p) => {
    // 缺经纬度的点（室内/无 GPS）原样保留
    if (p.lon === undefined || p.lat === undefined) {
      return p;
    }
    if (isOutOfChina(p.lon, p.lat)) {
      return p;
    }
    const offset = gcj02Offset(p.lon, p.lat);
    return { ...p, lon: p.lon + offset.lon, lat: p.lat + offset.lat };
  });
}
