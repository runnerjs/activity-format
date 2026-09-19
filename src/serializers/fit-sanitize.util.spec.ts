import { sanitizeFitMessage } from './fit-sanitize.util';

describe('sanitizeFitMessage', () => {
  it('未知 manufacturer 回退为 development', () => {
    expect(sanitizeFitMessage({ manufacturer: 'Chengdu', product: 0 })).toEqual(
      { manufacturer: 'development', product: 0 },
    );
  });

  it('字符串 product 会被剔除', () => {
    expect(
      sanitizeFitMessage({
        manufacturer: 'garmin',
        productName: 'Ledong Information & Technology Co., Ltd.',
      }),
    ).toEqual({
      manufacturer: 'garmin',
      productName: 'Ledong Information &',
    });
  });

  it('非法数值会被剔除', () => {
    expect(sanitizeFitMessage({ heartRate: Number.NaN, speed: 3.2 })).toEqual({
      speed: 3.2,
    });
  });

  it('FIT 时长字段保持数值，不按日期字段清洗', () => {
    expect(
      sanitizeFitMessage({
        timestamp: '2026-07-21T10:00:00.000Z',
        totalElapsedTime: 120,
        totalTimerTime: 118,
      }),
    ).toEqual({
      timestamp: new Date('2026-07-21T10:00:00.000Z'),
      totalElapsedTime: 120,
      totalTimerTime: 118,
    });
  });

  it('localTimestamp 保持 uint32，不转成 Date', () => {
    expect(sanitizeFitMessage({ localTimestamp: 865627315 })).toEqual({
      localTimestamp: 865627315,
    });
  });
});
