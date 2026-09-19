import type { TrackPoint } from '../types';

/**
 * 由轨迹点序列估算二维累计距离（米）。
 * @param points 轨迹点；无坐标或坐标非法的点会被跳过，相邻有效点直接相连
 * @returns 累计距离（米），保留两位小数
 */
export function estimateTotalDistance(points: readonly TrackPoint[]): number {
  let dist = 0;
  let prev: TrackPoint | null = null;
  for (const point of points) {
    // 无坐标或越界的点不作为折线顶点，但不中断后续累计
    if (
      point.lat === undefined ||
      point.lon === undefined ||
      !isFiniteCoordinate(point.lon, point.lat)
    ) {
      continue;
    }
    // 与上一有效点做大圆距离累加
    if (prev !== null) {
      dist += haversineMeters(prev.lat!, prev.lon!, point.lat, point.lon);
    }
    prev = point;
  }
  // 保留两位小数，与 summary.distance2dM 精度对齐
  return Math.round(dist * 100) / 100;
}

/**
 * 用 Haversine 公式计算两点间大圆距离。
 * @param lat1 起点纬度（度）
 * @param lon1 起点经度（度）
 * @param lat2 终点纬度（度）
 * @param lon2 终点经度（度）
 * @returns 球面距离（米）
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  // 地球平均半径（米）
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  // a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  // 弧长 = 2R · asin(√a)
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 判断经纬度是否为有限且落在合法地理范围内。
 * @param lon 经度（度）
 * @param lat 纬度（度）
 * @returns 合法则为 true
 */
function isFiniteCoordinate(lon: number, lat: number): boolean {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}
