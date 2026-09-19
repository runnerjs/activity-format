import type { BinaryInput } from '../types';

/**
 * 将二进制输入统一为 Uint8Array，便于后续按字节读取。
 * @param input Uint8Array / ArrayBuffer（含 Node Buffer）
 * @returns 同一段字节的 Uint8Array 视图（ArrayBuffer 会新建包装，其余原样返回）
 */
export function toUint8Array(input: BinaryInput): Uint8Array {
  // ArrayBuffer 本身不是 TypedArray，需包一层视图才能按字节访问
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  // Buffer 与 Uint8Array 已可按字节读取，直接返回避免拷贝
  return input;
}

/**
 * 将二进制输入转为 Node.js Buffer（FIT 解码、文件写出等需要 Buffer API）。
 * @param input Uint8Array / ArrayBuffer（含 Node Buffer）
 * @returns Node.js Buffer；已是 Buffer 则原样返回，避免多余拷贝
 */
export function toNodeBuffer(input: BinaryInput): Buffer {
  // 已是 Buffer 时跳过拷贝
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    return input;
  }
  // 先统一为 Uint8Array，再拷贝为 Buffer
  return Buffer.from(toUint8Array(input));
}

/**
 * 将二进制内容按 UTF-8 解码为字符串（GPX/TCX 等 XML 文本）。
 * @param input Uint8Array / ArrayBuffer（含 Node Buffer）
 * @returns UTF-8 文本
 */
export function decodeUtf8(input: BinaryInput): string {
  const bytes = toUint8Array(input);
  // Node 环境优先用 Buffer.toString，避免再走 TextDecoder
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes)) {
    return bytes.toString('utf8');
  }
  // 浏览器 / 无 Buffer 环境走标准 TextDecoder
  return new TextDecoder('utf-8').decode(bytes);
}
