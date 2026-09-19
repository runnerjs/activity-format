import { FILE_FORMAT } from '../constants';
import type { BinaryInput, FileFormat } from '../types';
import { decodeUtf8, toUint8Array } from '../utils/bytes';

/**
 * 根据文件魔数与头部内容识别 FIT / GPX / TCX 格式。
 * @param input 待检测的文件内容（Uint8Array / ArrayBuffer）
 * @returns 识别到的文件格式枚举值（fit / gpx / tcx）；无法识别时抛错
 */
export function detectFileFormat(input: BinaryInput): FileFormat {
  const bytes = toUint8Array(input);
  // FIT 头 14 字节：偏移 8–11 为 ASCII 签名 ".FIT"
  if (bytes.length >= 12) {
    const signature = String.fromCharCode(
      bytes[8],
      bytes[9],
      bytes[10],
      bytes[11],
    );
    if (signature === '.FIT' || signature === '.fit') {
      return FILE_FORMAT.fit;
    }
  }

  // XML 格式读前 4KB，去掉 BOM/空白后再取 2KB 做关键字匹配
  const head = decodeUtf8(bytes.subarray(0, Math.min(bytes.length, 4096)))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .slice(0, 2048)
    .toLowerCase();

  if (head.includes('<gpx') || head.includes('http://www.topografix.com/gpx')) {
    return FILE_FORMAT.gpx;
  }
  if (
    head.includes('trainingcenterdatabase') ||
    head.includes('<tcx')
  ) {
    return FILE_FORMAT.tcx;
  }

  // 无法识别文件格式，仅支持 FIT / GPX / TCX
  throw new Error('Unrecognized file format; only FIT, GPX, and TCX are supported');
}
