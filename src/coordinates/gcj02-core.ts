/**
 * GCJ-02（火星坐标系）与 WGS-84 互转核心算法。
 *
 * 国测局 GCJ-02 在 WGS-84 基础上加了非线性偏移（"加密"），国内地图（高德/腾讯/百度瓦片）
 * 使用 GCJ-02，国际 GPS 设备与 PostGIS 存储使用 WGS-84。本模块用于入库前/出库后转换。
 *
 * 参考：Krasovsky 1941 椭球参数，业内通用实现（误差约 1-2m，满足轨迹展示需求）。
 * 纯函数，无副作用，可被前后端共用。
 */

import type { LngLat } from '../types';

const PI = Math.PI;
/** Krasovsky 1941 椭球长半轴（米）。 */
const A = 6378245.0;
/** Krasovsky 1941 椭球第一偏心率平方。 */
const EE = 0.00669342162296594323;

/**
 * 计算纬度方向的非线性偏移多项式（相对中国几何中心的局部坐标）。
 * @param x 经度相对 105°E 的差值（度）
 * @param y 纬度相对 35°N 的差值（度）
 * @returns 纬度方向原始偏移量（尚未换算为度数）
 */
function transformLat(x: number, y: number): number {
  // 二次多项式基底：常量 + 线性项 + y² / xy 交叉项 + |x| 开方
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  // 叠加经度方向低频正弦项
  ret +=
    ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) /
    3.0;
  // 叠加纬度方向中频正弦项
  ret +=
    ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  // 叠加纬度方向高频正弦项
  ret +=
    ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

/**
 * 计算经度方向的非线性偏移多项式（相对中国几何中心的局部坐标）。
 * @param x 经度相对 105°E 的差值（度）
 * @param y 纬度相对 35°N 的差值（度）
 * @returns 经度方向原始偏移量（尚未换算为度数）
 */
function transformLng(x: number, y: number): number {
  // 二次多项式基底：常量 + 线性项 + x² / xy 交叉项 + |x| 开方
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  // 叠加经度方向低频正弦项
  ret +=
    ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) /
    3.0;
  // 叠加经度方向中频正弦项
  ret +=
    ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  // 叠加经度方向高频正弦项
  ret +=
    ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) *
      2.0) /
    3.0;
  return ret;
}

/**
 * 计算 GCJ-02 相对 WGS-84 的偏移量（基于 WGS-84 坐标计算）。
 *
 * 先用多项式得到原始偏移，再按椭球曲率换算为经纬度度数。
 * @param wgsLon WGS-84 经度（度）
 * @param wgsLat WGS-84 纬度（度）
 * @returns `{ lon, lat }` 偏移量（度）；加到 WGS-84 即得 GCJ-02
 */
export function gcj02Offset(wgsLon: number, wgsLat: number): LngLat {
  // 以 (105°E, 35°N) 为原点，把经纬度差送入偏移多项式
  let dLat = transformLat(wgsLon - 105.0, wgsLat - 35.0);
  let dLng = transformLng(wgsLon - 105.0, wgsLat - 35.0);
  // 纬度弧度，用于椭球子午圈 / 卯酉圈曲率换算
  const radLat = (wgsLat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  // 将多项式输出从米级偏移换算为纬度度数
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  // 将多项式输出从米级偏移换算为经度度数（需除以 cos(lat)）
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return { lon: dLng, lat: dLat };
}

/**
 * 判断坐标是否在中国境外（境外无 GCJ-02 偏移，无需转换）。
 * @param lon 经度（度）
 * @param lat 纬度（度）
 * @returns 在矩形外包盒外则为 true；盒内按国内处理
 */
export function isOutOfChina(lon: number, lat: number): boolean {
  // 粗略矩形：经度 72.004–137.8347、纬度 0.8293–55.8271
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
