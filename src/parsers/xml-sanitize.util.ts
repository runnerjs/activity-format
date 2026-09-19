/**
 * 将 XML 中未转义的 & 替换为 &amp;，保留已有合法实体引用。
 * 咕咚等第三方导出的 GPX/TCX 常在属性值中写入裸 &（如 "A & B"）。
 * @param xml 原始 XML 文本
 * @returns 裸 & 已转义、合法实体（&amp; / &#123; / &#x1A;）保持不变的文本
 */
export function sanitizeXmlAmpersands(xml: string): string {
  // 负向预查：已是命名实体或十/十六进制字符引用的 & 不替换
  return xml.replace(
    /&(?!([a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/g,
    '&amp;',
  );
}
