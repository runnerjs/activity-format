/**
 * XML 文本转义，防止活动名等用户字符串破坏标签结构。
 * @param value 原始文本
 * @returns 转义 `& < > " '` 后的安全文本
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 生成可选 XML 元素；空值时不输出，避免写出空标签。
 * @param tag 元素名
 * @param value 文本或数字；undefined / null / 空串则省略
 * @returns `<tag>转义后的值</tag>`，或空字符串
 */
export function xmlOptional(tag: string, value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}

/**
 * 把数字写成 XML 文本，避免 `21.1` 一类小数被 `String(21)` 收成整数。
 *
 * 整数补 `.0`（`21` → `21.0`），与常见 GPX `ele` 小数形态对齐。
 * @param value 有限数字
 * @returns 十进制字符串
 */
export function formatXmlDecimal(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return `${value}.0`;
  }
  return String(value);
}
