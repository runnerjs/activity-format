import { SPORT_TYPE } from '../constants';
import type { SportType } from '../types';

/**
 * 把统一 SportType 映射为 TCX Activity `@Sport` 枚举。
 *
 * TCX 仅有 Running / Biking / Other / Walking 等有限值；游泳、飞行类归 Other。
 * @param sportType Activity.summary.sportType
 * @returns TCX Sport 属性字符串
 */
export function sportTypeToTcxSport(sportType: SportType): string {
  switch (sportType) {
    case SPORT_TYPE.bike:
      return 'Biking';
    case SPORT_TYPE.swim:
      return 'Other';
    case SPORT_TYPE.hike:
      return 'Walking';
    case SPORT_TYPE.trailRun:
      return 'Running';
    case SPORT_TYPE.droneFlight:
    case SPORT_TYPE.paragliding:
    case SPORT_TYPE.skiing:
      return 'Other';
    default:
      return 'Running';
  }
}

/**
 * 把统一 SportType 映射为 GPX `<type>` 文本。
 * @param sportType Activity.summary.sportType
 * @returns GPX 运动类型字符串（如 cycling、trail_running）
 */
export function sportTypeToGpxType(sportType: SportType): string {
  switch (sportType) {
    case SPORT_TYPE.bike:
      return 'cycling';
    case SPORT_TYPE.swim:
      return 'swimming';
    case SPORT_TYPE.hike:
      return 'hiking';
    case SPORT_TYPE.trailRun:
      return 'trail_running';
    default:
      return 'running';
  }
}
