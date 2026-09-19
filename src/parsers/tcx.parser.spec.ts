import { readFileSync } from 'fs';
import { TRACK_SOURCE } from '../constants';
import { estimateTotalDistance } from '../utils/geometry';
import { fixturePath, repoDemoPath } from '../../test/fixtures/paths';
import { parseTcx, parseTcxActivities } from './tcx.parser';

describe('parseTcx sample fixture', () => {
  it('解析裁剪样本并产出合理距离', async () => {
    const model = await parseTcx(readFileSync(fixturePath('sample.tcx')), {
      source: TRACK_SOURCE.garmin,
    });

    expect(model.points.length).toBeGreaterThan(30);
    expect(model.points.length).toBeLessThanOrEqual(40);
    expect(model.summary.startTime).toMatch(/^2020-02-01/);
    expect(model.laps.length).toBeGreaterThanOrEqual(1);

    const estimated = estimateTotalDistance(model.points);
    expect(estimated).toBeGreaterThan(0);
  });
});

describe('parseTcx cadence threshold regression sample', () => {
  it('demo 大样本 cadence 点级值应存在', async () => {
    const model = await parseTcx(
      readFileSync(repoDemoPath('joyrun/phone-run.tcx')),
      { source: TRACK_SOURCE.garmin },
    );

    const cadenceValues = model.points
      .map((p) => p.cad)
      .filter((v): v is number => v !== undefined);
    expect(cadenceValues.length).toBeGreaterThan(1000);
    expect(model.summary.distance2dM ?? 0).toBeGreaterThan(20000);
  });
});

describe('parseTcx garmin connect sample', () => {
  it('应从 HeartRateBpm 与 ns3:TPX 解析心率、速度、步频', async () => {
    const model = await parseTcx(
      readFileSync(repoDemoPath('garmin/connect-run.tcx')),
      { source: TRACK_SOURCE.garmin },
    );
    const withHr = model.points.filter((point) => point.hr != null).length;
    const withCad = model.points.filter((point) => point.cad != null).length;
    const withSpd = model.points.filter((point) => point.spd != null).length;

    expect(model.points.length).toBe(571);
    expect(withHr).toBe(model.points.length);
    expect(withCad).toBe(model.points.length);
    expect(withSpd).toBe(model.points.length);
    expect(model.points[0].hr).toBe(145);
    expect(model.points[0].cad).toBe(168);
    expect(model.points[0].spd).toBeCloseTo(3, 3);
    expect(model.laps[0].avgHr).toBe(150);
    expect(model.laps[0].maxHr).toBe(153);
    expect(model.laps[0].avgCadence).toBe(170);
    expect(model.laps[0].maxCadence).toBe(174);
    expect(model.laps[0].avgSpeed).toBeCloseTo(3, 3);
    expect(model.summary.durationSec).toBeGreaterThan(0);
    expect(model.summary.distance2dM).toBeGreaterThan(0);
    expect(model.summary.avgPaceSecPerKm).toBeCloseTo(
      ((model.summary.durationSec as number) * 1000) /
        (model.summary.distance2dM as number),
      5,
    );
    expect(model.summary.avgHeartRate).toBe(150);
    expect(model.summary.maxHeartRate).toBe(153);

    const remainder = JSON.stringify(model.preservation?.remainder ?? {});
    expect(remainder).not.toContain('HeartRateBpm');
    expect(remainder).not.toContain('AverageHeartRateBpm');
    expect(remainder).not.toContain('ns3:Speed');
    expect(remainder).not.toContain('RunCadence');
    expect(remainder).not.toContain('AvgSpeed');
    expect(remainder).toContain('Intensity');

    expect(model.preservation?.transformations.pathHits).toEqual({
      'points[].cad': {
        index: 1,
        wildcards: ['ns3:TPX', 'ns3:RunCadence'],
      },
      'laps[].avgCadence': {
        index: 2,
        wildcards: ['ns3:LX', 'ns3:AvgRunCadence'],
      },
      'laps[].maxCadence': {
        index: 1,
        wildcards: ['ns3:LX', 'ns3:MaxRunCadence'],
      },
      'laps[].avgSpeed': {
        index: 1,
        wildcards: ['ns3:LX', 'ns3:AvgSpeed'],
      },
    });
  });
});

describe('parseTcx joyrun lap cadence extension', () => {
  it('无 Lap/Cadence 时应从 ns3:AvgRunCadence 落入 laps.avgCadence', async () => {
    const model = await parseTcx(
      readFileSync(repoDemoPath('joyrun/phone-run.tcx')),
      { source: TRACK_SOURCE.joyrun },
    );
    expect(model.laps[0].avgCadence).toBe(168);
    expect(model.laps[0].maxCadence).toBe(174);
    const remainder = JSON.stringify(model.preservation?.remainder ?? {});
    expect(remainder).not.toContain('AvgRunCadence');
    expect(remainder).not.toContain('MaxRunCadence');
    expect(remainder).toContain('ns3:RunCadence');
    expect(model.preservation?.transformations.pathHits?.['laps[].avgCadence']).toEqual({
      index: 1,
      wildcards: ['ns3:TPX', 'ns3:AvgRunCadence'],
    });
    expect(model.preservation?.transformations.pathHits?.['points[].cad']).toEqual({
      index: 0,
    });
  });
});

describe('parseTcx multi-activity fixture', () => {
  it('parseTcxActivities 拆出 2 个独立 Activity', async () => {
    const models = await parseTcxActivities(
      readFileSync(fixturePath('multi-activity.tcx')),
      { source: TRACK_SOURCE.garmin },
    );
    expect(models).toHaveLength(2);
    expect(models[0].points.length).toBe(2);
    expect(models[1].points.length).toBe(1);
    expect(models[0].summary.startTime).toMatch(/^2020-02-01T00:00:00/);
    expect(models[1].summary.startTime).toMatch(/^2020-02-01T00:01:00/);
    expect(models[0].preservation?.transformations.sourceActivityIndex).toBe(0);
    expect(models[1].preservation?.transformations.sourceActivityIndex).toBe(1);
    expect(JSON.stringify(models[0].preservation?.remainder ?? {})).not.toContain(
      'activity-two',
    );
  });
});

describe('parseTcx multi-lap fixture', () => {
  it('多 Lap 文件可解析出多个分段汇总', async () => {
    const model = await parseTcx(readFileSync(fixturePath('multi-lap.tcx')), {
      source: TRACK_SOURCE.garmin,
    });
    expect(model.laps.length).toBe(2);
    expect(model.points.length).toBe(3);
  });
});
