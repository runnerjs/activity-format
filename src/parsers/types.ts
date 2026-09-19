import {
  ALTITUDE_REF,
  COORD_SYSTEM,
  TRACK_SOURCE,
} from '../constants';
import type {
  Activity,
  AltitudeRef,
  BinaryInput,
  CoordSystem,
  ParseOptions,
  SportType,
  TrackSource,
} from '../types';

/** 解析器纯函数签名：二进制入参 + 可选 ParseOptions，异步返回 Activity。 */
export type ParseFn = (
  input: BinaryInput,
  options?: ParseOptions,
) => Promise<Activity>;

/**
 * 根据数据来源推断原始坐标系：
 * 微信小程序、Joyrun、咕咚为 GCJ-02；佳明、颂拓、手工录入为 WGS-84。
 * @param source 设备/平台来源
 * @returns 该来源默认使用的原始坐标系
 */
export function coordSystemBySource(source: TrackSource): CoordSystem {
  return source === TRACK_SOURCE.wechat ||
    source === TRACK_SOURCE.joyrun ||
    source === TRACK_SOURCE.codoon
    ? COORD_SYSTEM.gcj02
    : COORD_SYSTEM.wgs84;
}

/**
 * 文本运动类型映射为枚举值，未识别时默认 run。
 * @param raw 文件或设备给出的运动类型字符串（如 running、cycling）
 * @returns SportType 数字枚举；空值或无法识别时为 1（run）
 */
export function mapSportType(raw: string | undefined): SportType {
  if (!raw) {
    return 1; // SPORT_TYPE.run
  }
  const s = raw.toLowerCase();
  if (s.includes('run')) return 1;
  if (s.includes('bik') || s.includes('cycl')) return 2;
  if (s.includes('swim')) return 3;
  if (s.includes('hike') || s.includes('walk')) return 4;
  if (s.includes('trail')) return 5;
  if (s.includes('drone')) return 6;
  if (s.includes('paraglid') || s.includes('para')) return 7;
  if (s.includes('ski')) return 8;
  return 1;
}

/**
 * 默认高程基准：气压计/GPS 多为 MSL 正高，无人机场景由调用方覆盖。
 * @param source 设备/平台来源（当前各来源均默认 MSL）
 * @returns 高程基准枚举值
 */
export function defaultAltitudeRef(source: TrackSource): AltitudeRef {
  return source === TRACK_SOURCE.manual ? ALTITUDE_REF.msl : ALTITUDE_REF.msl;
}

/**
 * 安全转数字，无效时返回 undefined。
 * @param v 任意输入（字符串、数字、空值等）
 * @returns 有限数字；null / 空串 / NaN / Infinity 为 undefined
 */
export function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 安全转整数（四舍五入），无效时返回 undefined。FIT 等设备时长等字段常为浮点秒。
 * @param v 任意输入
 * @returns 四舍五入后的整数；无法转数字时为 undefined
 */
export function toInt(v: unknown): number | undefined {
  const n = toNum(v);
  return n !== undefined ? Math.round(n) : undefined;
}
