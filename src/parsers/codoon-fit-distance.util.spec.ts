import type { Activity } from '../types';
import type { FitMessages } from './fit-decoder';
import {
  accumulateCodoonSegmentDistances,
  isCodoonAppFit,
} from './codoon-fit-distance.util';

describe('isCodoonAppFit', () => {
  it('距离回落时识别为咕咚', () => {
    expect(
      isCodoonAppFit(fitMessages({ recordMesgs: [{ distance: 6 }, { distance: 2 }, { distance: 1 }] })),
    ).toBe(true);
  });

  it('轨迹点带 speed 时识别为咕咚', () => {
    expect(
      isCodoonAppFit(
        fitMessages({ recordMesgs: [{ distance: 11, speed: 3 }, { distance: 23, speed: 3 }] }),
      ),
    ).toBe(true);
  });

  it('session 有 avgSpeed 和爬升下降时识别为咕咚', () => {
    expect(
      isCodoonAppFit(
        fitMessages({
          recordMesgs: [{ distance: 11 }, { distance: 23 }],
          sessionMesgs: [{ avgSpeed: 3.046, totalAscent: 76, totalDescent: 85 }],
        }),
      ),
    ).toBe(true);
  });

  it('只有 avgSpeed、没有爬升下降时不识别', () => {
    expect(
      isCodoonAppFit(
        fitMessages({
          recordMesgs: [{ distance: 11 }, { distance: 23 }],
          sessionMesgs: [{ avgSpeed: 3.046 }],
        }),
      ),
    ).toBe(false);
  });

  it('距离递增且没有速度、爬升时不识别', () => {
    expect(
      isCodoonAppFit(
        fitMessages({
          recordMesgs: [{ distance: 15, cadence: 80 }, { distance: 30, cadence: 82 }],
        }),
      ),
    ).toBe(false);
  });

  it('几米抖动不算距离回落', () => {
    expect(
      isCodoonAppFit(
        fitMessages({
          recordMesgs: [
            { distance: 5404 },
            { distance: 5402 },
            { distance: 5404 },
            { distance: 5402 },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('accumulateCodoonSegmentDistances', () => {
  it('分段距离累加为从起点起的累计值', () => {
    const points = pointsWithDist([6, 2, 5, 1]);
    accumulateCodoonSegmentDistances(points);
    expect(points.map((point) => point.dist)).toEqual([6, 8, 13, 14]);
  });

  it('累计递增的距离保持不变', () => {
    const points = pointsWithDist([10, 20, 30]);
    accumulateCodoonSegmentDistances(points);
    expect(points.map((point) => point.dist)).toEqual([10, 20, 30]);
  });

  it('只回落一次时不累加', () => {
    const points = pointsWithDist([10, 20, 15, 30]);
    accumulateCodoonSegmentDistances(points);
    expect(points.map((point) => point.dist)).toEqual([10, 20, 15, 30]);
  });

  it('速度对得上相邻差值时，几米回落也不累加', () => {
    const points = samplePoints([
      { sec: 0, dist: 12, spd: 3 },
      { sec: 4, dist: 24, spd: 3 },
      { sec: 8, dist: 36, spd: 3 },
      { sec: 12, dist: 48, spd: 3 },
      { sec: 16, dist: 47, spd: 3 },
      { sec: 20, dist: 60, spd: 3 },
      { sec: 24, dist: 59, spd: 3 },
    ]);
    accumulateCodoonSegmentDistances(points);
    expect(points.map((point) => point.dist)).toEqual([12, 24, 36, 48, 47, 60, 59]);
  });

  it('速度对得上本点距离时按分段累加', () => {
    const points = samplePoints([
      { sec: 0, dist: 12, spd: 3 },
      { sec: 4, dist: 12, spd: 3 },
      { sec: 8, dist: 8, spd: 2 },
      { sec: 12, dist: 14, spd: 3.5 },
    ]);
    accumulateCodoonSegmentDistances(points);
    expect(points.map((point) => point.dist)).toEqual([12, 24, 32, 46]);
  });

  it('末点与总距离相差 50 米以内时不累加', () => {
    const points = pointsWithDist([200, 40, 20, 4955]);
    accumulateCodoonSegmentDistances(points, 5000);
    expect(points.map((point) => point.dist)).toEqual([200, 40, 20, 4955]);
  });

  it('末点与总距离相差在 5% 以内时不累加', () => {
    const points = pointsWithDist([1000, 200, 400, 9600]);
    accumulateCodoonSegmentDistances(points, 10000);
    expect(points.map((point) => point.dist)).toEqual([1000, 200, 400, 9600]);
  });

  it('末点离总距离较远且明显回落时才累加', () => {
    const points = pointsWithDist([200, 40, 20, 140]);
    accumulateCodoonSegmentDistances(points, 200);
    expect(points.map((point) => point.dist)).toEqual([200, 240, 260, 400]);
  });

  it('只有几米回落、没有速度时不累加', () => {
    const points = pointsWithDist([5404, 5402, 5404, 5402]);
    accumulateCodoonSegmentDistances(points);
    expect(points.map((point) => point.dist)).toEqual([5404, 5402, 5404, 5402]);
  });

  it('缺距离的点不参与累加', () => {
    const points: Activity['points'] = [
      { t: '0' },
      { t: '1', dist: 6 },
      { t: '2', dist: 2 },
      { t: '3', dist: 5 },
      { t: '4', dist: 1 },
    ];
    accumulateCodoonSegmentDistances(points);
    expect(points.map((point) => point.dist)).toEqual([undefined, 6, 8, 13, 14]);
  });
});

function pointsWithDist(distances: number[]): Activity['points'] {
  return distances.map((dist, index) => ({ t: String(index), dist }));
}

function samplePoints(
  samples: Array<{ sec: number; dist: number; spd: number }>,
): Activity['points'] {
  return samples.map((sample) => ({
    t: new Date(sample.sec * 1000).toISOString(),
    dist: sample.dist,
    spd: sample.spd,
  }));
}

function fitMessages(messages: {
  recordMesgs?: Array<Record<string, unknown>>;
  sessionMesgs?: Array<Record<string, unknown>>;
}): FitMessages {
  return messages as FitMessages;
}
