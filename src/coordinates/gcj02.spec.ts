import {
  gcj02ToWgs84,
  gcj02ToWgs84Batch,
} from './gcj02-to-wgs84';
import {
  wgs84ToGcj02,
  wgs84ToGcj02Batch,
} from './wgs84-to-gcj02';
import { isOutOfChina } from './gcj02-core';

// 北京天安门附近（典型国内点），用于验证偏移与往返
const WGS_LON = 116.39745;
const WGS_LAT = 39.90878;

describe('gcj02 / wgs84 conversion', () => {
  describe('isOutOfChina', () => {
    it('识别国内坐标为 false', () => {
      expect(isOutOfChina(WGS_LON, WGS_LAT)).toBe(false);
    });

    it('识别境外坐标为 true', () => {
      expect(isOutOfChina(-122.41, 37.77)).toBe(true); // 旧金山
      expect(isOutOfChina(139.69, 35.68)).toBe(true); // 东京（经度超界）
    });
  });

  describe('wgs84ToGcj02', () => {
    it('对国内坐标产生偏移', () => {
      const gcj = wgs84ToGcj02(WGS_LON, WGS_LAT);
      expect(Math.abs(gcj.lon - WGS_LON)).toBeGreaterThan(0.001);
      expect(Math.abs(gcj.lat - WGS_LAT)).toBeGreaterThan(0.001);
      // 偏移量在合理范围（一般 < 0.01 度，约几百米）
      expect(Math.abs(gcj.lon - WGS_LON)).toBeLessThan(0.02);
      expect(Math.abs(gcj.lat - WGS_LAT)).toBeLessThan(0.02);
    });

    it('境外坐标原样返回', () => {
      const gcj = wgs84ToGcj02(-122.41, 37.77);
      expect(gcj.lon).toBe(-122.41);
      expect(gcj.lat).toBe(37.77);
    });
  });

  describe('gcj02ToWgs84', () => {
    it('与 wgs84ToGcj02 近似互逆（误差 < 2m ≈ 0.00002 度）', () => {
      const gcj = wgs84ToGcj02(WGS_LON, WGS_LAT);
      const back = gcj02ToWgs84(gcj.lon, gcj.lat);
      expect(Math.abs(back.lon - WGS_LON)).toBeLessThan(0.00002);
      expect(Math.abs(back.lat - WGS_LAT)).toBeLessThan(0.00002);
    });

    it('境外坐标原样返回', () => {
      const wgs = gcj02ToWgs84(-122.41, 37.77);
      expect(wgs.lon).toBe(-122.41);
      expect(wgs.lat).toBe(37.77);
    });
  });

  describe('batch conversion', () => {
    it('批量转换保留额外字段并返回新数组', () => {
      const points = [
        { lon: WGS_LON, lat: WGS_LAT, ele: 50, hr: 140 },
        { lon: -122.41, lat: 37.77, ele: 10, hr: 120 },
      ];
      const out = wgs84ToGcj02Batch(points);
      expect(out).not.toBe(points);
      expect(out[0].hr).toBe(140);
      expect(out[0].ele).toBe(50);
      // 国内点被偏移
      expect(out[0].lon).not.toBe(points[0].lon);
      // 境外点不变
      expect(out[1].lon).toBe(-122.41);
    });

    it('gcj02 批量转回 wgs84 近似还原', () => {
      const points = [{ lon: WGS_LON, lat: WGS_LAT }];
      const gcj = wgs84ToGcj02Batch(points);
      const back = gcj02ToWgs84Batch(gcj);
      expect(Math.abs(back[0].lon - WGS_LON)).toBeLessThan(0.00002);
      expect(Math.abs(back[0].lat - WGS_LAT)).toBeLessThan(0.00002);
    });

    it('不修改入参数组', () => {
      const points = [{ lon: WGS_LON, lat: WGS_LAT }];
      const snapshot = { ...points[0] };
      wgs84ToGcj02Batch(points);
      expect(points[0].lon).toBe(snapshot.lon);
      expect(points[0].lat).toBe(snapshot.lat);
    });
  });
});
