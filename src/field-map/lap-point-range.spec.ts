import type { LapSummary, TrackPoint } from '../types';
import {
  assignFitLapPointRangesFromMessages,
  assignLapPointRangesByTime,
  toTimeMs,
} from './lap-point-range';

function makeLap(index: number, startTime: string): LapSummary {
  return {
    index,
    startTime,
    durationSec: 0,
    distanceM: 0,
  };
}

function makePoints(isoTimes: string[]): TrackPoint[] {
  return isoTimes.map((t) => ({ t }));
}

describe('toTimeMs', () => {
  it('解析 Date、毫秒和 ISO 字符串', () => {
    expect(toTimeMs(new Date('2026-08-14T10:37:58.000Z'))).toBe(
      Date.parse('2026-08-14T10:37:58.000Z'),
    );
    expect(toTimeMs(Date.parse('2026-08-14T10:37:58.000Z'))).toBe(
      Date.parse('2026-08-14T10:37:58.000Z'),
    );
    expect(toTimeMs('2026-08-14T10:37:58.000Z')).toBe(
      Date.parse('2026-08-14T10:37:58.000Z'),
    );
    expect(toTimeMs(undefined)).toBeUndefined();
  });
});

describe('assignLapPointRangesByTime', () => {
  it('Suunto 两圈：边界点归上一圈，第二圈只有停表后的点', () => {
    const times = [
      '2026-08-14T10:37:58.000Z',
      '2026-08-14T11:00:00.000Z',
      '2026-08-14T11:47:16.000Z',
      '2026-08-14T11:47:17.000Z',
      '2026-08-14T11:47:18.000Z',
    ];
    const laps = [
      makeLap(1, times[0]),
      makeLap(2, '2026-08-14T11:47:16.000Z'),
    ];
    assignLapPointRangesByTime(laps, makePoints(times), [
      {
        startMs: Date.parse(times[0]),
        endMs: Date.parse('2026-08-14T11:47:16.000Z'),
      },
      {
        startMs: Date.parse('2026-08-14T11:47:16.000Z'),
        endMs: Date.parse('2026-08-14T11:47:18.000Z'),
      },
    ]);

    expect(laps[0].pointRange).toEqual([0, 2]);
    expect(laps[1].pointRange).toEqual([3, 4]);
  });

  it('缺 timestamp 时用下一圈 startTime 半开区间', () => {
    const times = [
      '2026-08-14T10:00:00.000Z',
      '2026-08-14T10:00:30.000Z',
      '2026-08-14T10:01:00.000Z',
      '2026-08-14T10:01:30.000Z',
    ];
    const laps = [makeLap(1, times[0]), makeLap(2, times[2])];
    assignLapPointRangesByTime(laps, makePoints(times), [
      { startMs: Date.parse(times[0]) },
      { startMs: Date.parse(times[2]), endMs: Date.parse(times[3]) },
    ]);

    expect(laps[0].pointRange).toEqual([0, 1]);
    expect(laps[1].pointRange).toEqual([2, 3]);
  });

  it('最后一圈缺 timestamp 时用 session 结束时间闭区间', () => {
    const times = [
      '2026-08-14T10:00:00.000Z',
      '2026-08-14T10:00:30.000Z',
      '2026-08-14T10:01:00.000Z',
    ];
    const laps = [makeLap(1, times[0])];
    assignLapPointRangesByTime(
      laps,
      makePoints(times),
      [{ startMs: Date.parse(times[0]) }],
      { sessionEndMs: Date.parse(times[2]) },
    );

    expect(laps[0].pointRange).toEqual([0, 2]);
  });

  it('窗口内无点时省略 pointRange', () => {
    const laps = [
      makeLap(1, '2026-08-14T10:00:00.000Z'),
      makeLap(2, '2026-08-14T12:00:00.000Z'),
    ];
    assignLapPointRangesByTime(
      laps,
      makePoints(['2026-08-14T10:00:00.000Z', '2026-08-14T10:00:01.000Z']),
      [
        {
          startMs: Date.parse('2026-08-14T10:00:00.000Z'),
          endMs: Date.parse('2026-08-14T10:00:01.000Z'),
        },
        {
          startMs: Date.parse('2026-08-14T12:00:00.000Z'),
          endMs: Date.parse('2026-08-14T12:00:02.000Z'),
        },
      ],
    );

    expect(laps[0].pointRange).toEqual([0, 1]);
    expect(laps[1].pointRange).toBeUndefined();
  });
});

describe('assignFitLapPointRangesFromMessages', () => {
  it('从 lap 消息的 startTime / timestamp 切圈', () => {
    const times = [
      '2026-08-14T10:37:58.000Z',
      '2026-08-14T11:47:16.000Z',
      '2026-08-14T11:47:17.000Z',
      '2026-08-14T11:47:18.000Z',
    ];
    const laps = [
      makeLap(1, times[0]),
      makeLap(2, '2026-08-14T11:47:16.000Z'),
    ];
    assignFitLapPointRangesFromMessages(
      laps,
      makePoints(times),
      [
        {
          startTime: new Date(times[0]),
          timestamp: new Date('2026-08-14T11:47:16.000Z'),
        },
        {
          startTime: new Date('2026-08-14T11:47:16.000Z'),
          timestamp: new Date('2026-08-14T11:47:18.000Z'),
        },
      ],
      [{ timestamp: new Date('2026-08-14T11:47:18.000Z') }],
    );

    expect(laps[0].pointRange).toEqual([0, 1]);
    expect(laps[1].pointRange).toEqual([2, 3]);
  });
});
