import {
  deriveDurationSecFromPoints,
  durationSecFromWallClock,
} from './track-point';

describe('durationSecFromWallClock', () => {
  it('保留 2 位小数，不再取整到秒', () => {
    expect(
      durationSecFromWallClock(
        '2018-05-24T22:43:51.330Z',
        '2018-05-24T22:50:15.800Z',
      ),
    ).toBe(384.47);
  });

  it('第三位小数四舍五入', () => {
    expect(
      durationSecFromWallClock(
        '2018-05-24T22:43:51.000Z',
        '2018-05-24T22:43:51.334Z',
      ),
    ).toBe(0.33);
  });

  it('结束不晚于开始时返回 null', () => {
    expect(
      durationSecFromWallClock(
        '2018-05-24T22:43:51.000Z',
        '2018-05-24T22:43:51.000Z',
      ),
    ).toBeNull();
  });
});

describe('deriveDurationSecFromPoints', () => {
  it('用首末点墙钟差保留 2 位小数', () => {
    expect(
      deriveDurationSecFromPoints([
        { t: '2018-05-24T22:43:51.330Z' },
        { t: '2018-05-24T22:44:00.000Z' },
        { t: '2018-05-24T22:50:15.800Z' },
      ]),
    ).toBe(384.47);
  });
});
