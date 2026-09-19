import { sanitizeXmlAmpersands } from './xml-sanitize.util';

describe('sanitizeXmlAmpersands', () => {
  it('应转义属性值中的裸 &', () => {
    const input =
      '<gpx creator="Chengdu Ledong Information & Technology Co., Ltd. ">';
    expect(sanitizeXmlAmpersands(input)).toBe(
      '<gpx creator="Chengdu Ledong Information &amp; Technology Co., Ltd. ">',
    );
  });

  it('应保留已有合法实体引用', () => {
    const input = '<name>Tom &amp; Jerry &lt;3 &gt; &#169; &#x1F;</name>';
    expect(sanitizeXmlAmpersands(input)).toBe(input);
  });

  it('应转义文本节点中的裸 &', () => {
    const input = '<desc>Route A & B</desc>';
    expect(sanitizeXmlAmpersands(input)).toBe('<desc>Route A &amp; B</desc>');
  });
});
