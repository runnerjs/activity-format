import {
  buildExportFileName,
  contentDispositionAttachment,
  formatActivityTimestamp,
  formatExportZipName,
  sanitizeFileBaseName,
} from './filename.util';

describe('filename.util', () => {
  it('sanitizeFileBaseName 替换非法字符', () => {
    expect(sanitizeFileBaseName('晨跑/测试*')).toBe('晨跑_测试_');
  });

  it('sanitizeFileBaseName 空名称回退', () => {
    expect(sanitizeFileBaseName('   ')).toBe('活动');
  });

  it('formatActivityTimestamp 格式正确', () => {
    expect(formatActivityTimestamp('2026-07-21T10:30:45.000Z')).toBe(
      '20260721_103045',
    );
  });

  it('formatExportZipName 格式正确', () => {
    expect(
      formatExportZipName(new Date('2026-07-21T12:00:00.000Z')),
    ).toBe('20260721.zip');
  });

  it('buildExportFileName 重名追加序号', () => {
    const used = new Set<string>();
    const a = buildExportFileName('晨跑', '2026-07-21T10:00:00.000Z', 'gpx', used);
    const b = buildExportFileName('晨跑', '2026-07-21T10:00:00.000Z', 'gpx', used);
    expect(a).toBe('晨跑_20260721_100000.gpx');
    expect(b).toBe('晨跑_20260721_100000_2.gpx');
  });

  it('contentDispositionAttachment 中文文件名使用 ASCII 回退', () => {
    expect(contentDispositionAttachment('跑步_20260721_100000.gpx')).toBe(
      'attachment; filename="___20260721_100000.gpx"; filename*=UTF-8\'\'%E8%B7%91%E6%AD%A5_20260721_100000.gpx',
    );
  });
});
