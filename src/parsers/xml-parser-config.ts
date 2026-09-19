import { Parser } from 'xml2js';
import { sanitizeXmlAmpersands } from './xml-sanitize.util';
import type { BinaryInput } from '../types';
import { decodeUtf8 } from '../utils/bytes';

/** xml2js 配置 B：属性在 `$`，元素恒为数组（§3.4） */
export const XML_PARSER_CONFIG_B = {
  explicitArray: true,
  mergeAttrs: false,
  trim: true,
  attrkey: '$',
} as const;

/**
 * 创建配置 B 的 xml2js Parser 实例。
 * @returns 新的 Parser，属性在 `$`、元素恒为数组
 */
export function createXmlParserConfigB(): Parser {
  return new Parser(XML_PARSER_CONFIG_B);
}

/**
 * 将 GPX/TCX 二进制解码为 xml2js 对象树。
 * @param input XML 文件内容（Uint8Array / ArrayBuffer）
 * @returns 根对象（如 `{ gpx: ... }` 或 `{ TrainingCenterDatabase: ... }`）
 */
export async function parseXmlConfigB(
  input: BinaryInput,
): Promise<Record<string, unknown>> {
  const parser = createXmlParserConfigB();
  // 先按 UTF-8 解码，再修第三方导出里未转义的裸 &
  const xml = sanitizeXmlAmpersands(decodeUtf8(input));
  return (await parser.parseStringPromise(xml)) as Record<string, unknown>;
}
