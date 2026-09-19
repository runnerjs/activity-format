import type { BinaryInput } from '../types';
import { toNodeBuffer } from '../utils/bytes';
import { loadFitSdk, type FitMessages } from '../utils/fit-sdk';

export type { FitMessages };

/** @garmin/fitsdk Decoder.read 固化选项（§3.3.4）。 */
export const FIT_DECODER_READ_OPTIONS = {
  /** 应用 FIT 字段的 scale/offset，坐标等数值转为物理单位 */
  applyScaleAndOffset: true,
  /** 枚举等类型转为可读字符串（如 sport、file type） */
  convertTypesToStrings: true,
  /** FIT timestamp 转为 Date 对象 */
  convertDateTimesToDates: true,
  /** 展开复合字段的子字段（如 positionLat/positionLong） */
  expandSubFields: true,
  /** 保留 profile 未定义的未知字段，便于 preservation 写回 */
  includeUnknownData: true,
  /** 合并 record 与 hr 消息的心率数据 */
  mergeHeartRates: true,
} as const;

/** FIT 二进制解码结果。 */
export interface FitDecodeResult {
  /** 按 FIT 消息类型分组的原生数据，类型同 @garmin/fitsdk 的 FitMessages */
  messages: FitMessages;
  /** Decoder 报告的非致命/致命错误列表 */
  errors: unknown[];
}

/**
 * 将 FIT 二进制解码为 fitsdk 消息对象。
 *
 * 封装 @garmin/fitsdk 的 Stream + Decoder，统一读入选项；
 * 输出供 field-map split 消费，不做 Activity 映射。
 * @param input FIT 文件内容（Uint8Array / ArrayBuffer）
 * @returns 消息字典与解码错误列表
 * @example
 * // messages 为内存中的 JS 对象（非 JSON 字符串），结构示意：
 * {
 *   fileIdMesgs: [{ type: 'activity', manufacturer: 'garmin', productName: 'Forerunner 955' }],
 *   recordMesgs: [
 *     { timestamp: new Date('2026-07-21T14:30:00Z'), positionLat: 22.66, positionLong: 113.81, heartRate: 145 },
 *     { timestamp: new Date('2026-07-21T14:30:01Z'), positionLat: 22.661, positionLong: 113.811, heartRate: 146 },
 *   ],
 *   sessionMesgs: [{ sport: 'running', totalDistance: 8012.5, totalTimerTime: 3720 }],
 *   lapMesgs: [{ startTime: new Date('2026-07-21T14:30:00Z'), totalDistance: 1000, avgHeartRate: 142 }],
 * }
 */
export async function decodeFitBuffer(
  input: BinaryInput,
): Promise<FitDecodeResult> {
  const { Decoder, Stream } = await loadFitSdk();
  // fitsdk 要求 Node Buffer；统一把 BinaryInput 转成 Buffer 再建 Stream
  const stream = Stream.fromBuffer(toNodeBuffer(input));
  const decoder = new Decoder(stream);
  // 按固化选项解码：scale/offset、枚举转字符串、未知字段保留等
  const { messages, errors } = decoder.read(FIT_DECODER_READ_OPTIONS);
  return {
    messages,
    errors,
  };
}
