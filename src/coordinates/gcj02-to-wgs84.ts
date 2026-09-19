/**
 * GCJ-02（火星坐标系）转 WGS-84。
 *
 * 用于入库前统一坐标系：微信小程序、Joyrun 等国内来源的轨迹需转为 WGS-84 后存入 PostGIS。
 * 境外坐标无偏移，原样返回。
 */

import { gcj02Offset, isOutOfChina } from './gcj02-core';
import type { LngLat, LngLatLike } from '../types';

/**
 * 将单个 GCJ-02（火星坐标系）坐标转为 WGS-84。
 *
 * 采用一次迭代近似：用 GCJ-02 坐标当作 WGS-84 去算偏移再相减，误差约 1–2m。
 * @param lon 经度（GCJ-02）
 * @param lat 纬度（GCJ-02）
 * @returns WGS-84 经纬度；境外坐标原样返回
 */
export function gcj02ToWgs84(lon: number, lat: number): LngLat {
  // 境外无加密，原样返回
  if (isOutOfChina(lon, lat)) {
    return { lon, lat };
  }
  // 一次迭代：以当前点近似 WGS-84 计算偏移，从 GCJ-02 中减去
  const offset = gcj02Offset(lon, lat);
  return { lon: lon - offset.lon, lat: lat - offset.lat };
}

/**
 * 批量将 GCJ-02 坐标序列转为 WGS-84，保留点的其余字段。
 * @param points 含 lon/lat 的点对象数组
 * @returns 转换后的新数组（不修改入参）
 */
export function gcj02ToWgs84Batch<T extends LngLatLike>(points: readonly T[]): T[] {
  return points.map((p) => {
    // 缺经纬度的点（室内/无 GPS）原样保留
    if (p.lon === undefined || p.lat === undefined) {
      return p;
    }
    if (isOutOfChina(p.lon, p.lat)) {
      return p;
    }
    const offset = gcj02Offset(p.lon, p.lat);
    return { ...p, lon: p.lon - offset.lon, lat: p.lat - offset.lat };
  });
}
