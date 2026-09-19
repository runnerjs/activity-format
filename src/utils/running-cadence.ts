import { FILE_FORMAT, SPORT_TYPE } from '../constants';
import type { FileFormat, SportType, TrackSource } from '../types';

/** 跑步类运动：点级 cadence 可能为「节奏 rpm」，需换算为 spm。 */
const RUNNING_LIKE_SPORTS = new Set<SportType>([
  SPORT_TYPE.run,
  SPORT_TYPE.trailRun,
]);

/**
 * FIT 跑步 cadence 异常告警阈值（spm）。
 * 仅用于日志/告警，不再驱动 rpm→spm 换算（§3.2.4）。
 */
export const RUNNING_CADENCE_RPM_MAX = 110;

/** 判定 cadence 是否换算为 spm 所需的导入上下文。 */
export interface CadenceNormalizeContext {
  sportType: SportType;
  fileFormat: FileFormat;
  source: TrackSource;
}

/**
 * 判断运动类型是否为跑步类（跑步 / 越野跑）。
 * 仅跑步类点级 cadence 可能以 rpm 存储，需要按格式换算为 spm。
 * @param sportType 统一模型中的运动类型
 * @returns 跑步或越野跑则为 true
 */
export function isRunningLikeSport(sportType: SportType): boolean {
  return RUNNING_LIKE_SPORTS.has(sportType);
}

/**
 * 判定导入时是否将 cadence 从 rpm 换算为 spm（×2）。
 * 跑步类按文件格式换算，不再按来源平台开例外（§3.2）。
 * @param context 运动类型、文件格式与设备来源
 * @returns 需要 ×2 换算则为 true
 */
export function shouldScaleCadenceToSpm(
  context: CadenceNormalizeContext,
): boolean {
  // 骑行等非跑步类 cadence 本身就是 rpm（踏频），保持原值
  if (!isRunningLikeSport(context.sportType)) {
    return false;
  }
  // FIT / TCX / GPX 跑步按 rpm 存储，导入时翻倍为双足步频
  return (
    context.fileFormat === FILE_FORMAT.fit ||
    context.fileFormat === FILE_FORMAT.tcx ||
    context.fileFormat === FILE_FORMAT.gpx
  );
}

/**
 * 将点级 cadence 规范为 spm（双足步频，steps per minute）。
 * @param cadence 文件中的原始 cadence（可能是 rpm 或已是 spm）
 * @param context 运动类型、文件格式与设备来源，决定是否 ×2
 * @returns 规范化后的步频；非正数原样返回
 */
export function normalizeCadenceToSpm(
  cadence: number,
  context: CadenceNormalizeContext,
): number {
  // 零或负值视为无效/暂停，不换算
  if (cadence <= 0) {
    return cadence;
  }
  if (shouldScaleCadenceToSpm(context)) {
    return cadence * 2;
  }
  return cadence;
}
