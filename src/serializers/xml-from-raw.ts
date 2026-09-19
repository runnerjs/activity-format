import { Builder } from 'xml2js';
import { XML_PARSER_CONFIG_B } from '../parsers/xml-parser-config';

/**
 * 将 xml2js 配置 B 的 JSON 树序列化为 XML 字符串。
 *
 * 配置 B 与解析侧一致（属性在 `$`、文本在 `_`），保证 round-trip 字段形态对齐。
 * @param raw merge/enrich 后的 GPX 或 TCX 对象树
 * @param options.pretty 为 true 时按两空格缩进换行，默认紧凑单行
 * @returns 带 XML 声明的 XML 字符串
 */
export function serializeConfigBToXml(
  raw: Record<string, unknown>,
  options?: { pretty?: boolean },
): string {
  const pretty = options?.pretty ?? false;
  const builder = new Builder({
    ...XML_PARSER_CONFIG_B,
    headless: false,
    renderOpts: pretty
      ? { pretty: true, indent: '  ', newline: '\n' }
      : { pretty: false },
    xmldec: { version: '1.0', encoding: 'UTF-8' },
  });
  return builder.buildObject(raw);
}
