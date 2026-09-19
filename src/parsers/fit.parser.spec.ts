import { readFileSync } from 'fs';
import { TRACK_SOURCE } from '../constants';
import { getFitRecordPosition, parseFit } from './fit.parser';
import { fixturePath, repoDemoPath } from '../../test/fixtures/paths';

describe('getFitRecordPosition', () => {
  it('reads fitsdk camelCase positionLat/positionLong (semicircles)', () => {
    const pos = getFitRecordPosition({
      timestamp: Date.now(),
      positionLat: 270355108,
      positionLong: 1357832971,
    });
    expect(pos?.lat).toBeCloseTo(22.66, 1);
    expect(pos?.lon).toBeCloseTo(113.81, 1);
  });

  it('reads legacy degree flat fields when present', () => {
    expect(
      getFitRecordPosition({
        timestamp: Date.now(),
        position_lat: 22.66,
        position_long: 113.81,
      }),
    ).toEqual({ lat: 22.66, lon: 113.81 });
  });

  it('reads nested position object when present', () => {
    expect(
      getFitRecordPosition({
        timestamp: Date.now(),
        position: { lat: 22.66, long: 113.81 },
      }),
    ).toEqual({ lat: 22.66, lon: 113.81 });
  });

  it('returns null when coordinates are missing or invalid', () => {
    expect(getFitRecordPosition({ timestamp: Date.now() })).toBeNull();
  });
});

describe('parseFit monitoring file', () => {
  it('对 monitoring_b 文件给出明确错误提示', async () => {
    await expect(
      parseFit(readFileSync(fixturePath('monitoring.fit')), {
        source: TRACK_SOURCE.garmin,
      }),
    ).rejects.toThrow(
      'FIT file type is monitoring_b (health monitoring or settings, no GPS track). Export an Activity file from the watch or app.',
    );
  });
});

describe('parseFit garmin forerunner sample', () => {
  it('以 creator 的 garminProduct 作为 deviceModel', async () => {
    const model = await parseFit(
      readFileSync(repoDemoPath('garmin/forerunner-run.fit')),
      { source: TRACK_SOURCE.garmin },
    );
    expect(model.summary.deviceManufacturer).toBe('garmin');
    expect(model.summary.deviceModel).toBe('Forerunner 235 (Asia)');
    expect(model.summary.durationSec).toBeCloseTo(2630, 3);
    expect(model.summary.activeDurationSec).toBeCloseTo(2630, 3);
    expect(model.summary.avgSpeedMps).toBeGreaterThan(0);
    expect(model.summary.avgPaceSecPerKm).toBeCloseTo(
      1000 / (model.summary.avgSpeedMps as number),
      5,
    );
    expect(new Date(model.summary.endTime ?? 0).getTime()).toBeGreaterThan(
      new Date(model.summary.startTime).getTime(),
    );
    expect(model.summary.minAltitudeM).toBeCloseTo(38, 5);
    expect(model.summary.maxAltitudeM).toBeCloseTo(42, 1);

    const leftoverDevices = (
      model.preservation?.remainder as {
        deviceInfoMesgs?: Array<Record<string, unknown> | null>;
      }
    ).deviceInfoMesgs;
    expect(leftoverDevices?.[0]).toMatchObject({
      deviceIndex: 'creator',
      manufacturer: 'garmin',
    });
    expect(leftoverDevices?.[0]).not.toHaveProperty('productName');
    expect(leftoverDevices?.[1]).toMatchObject({
      manufacturer: 'garmin',
      product: 1619,
    });
    expect(leftoverDevices?.[2]).toMatchObject({
      manufacturer: 47881,
      product: 12,
    });
  });
});

describe('parseFit suunto multi-lap activity', () => {
  it('按时间窗切圈，且已映射字段不进入 remainder', async () => {
    const model = await parseFit(
      readFileSync(repoDemoPath('suunto/watch-run.fit')),
      { source: TRACK_SOURCE.suunto },
    );

    expect(model.summary.durationSec).toBeCloseTo(17520, 2);
    expect(model.summary.activeDurationSec).toBeCloseTo(17520, 2);
    expect(model.summary.maxAltitudeM).toBe(42);
    expect(model.summary.minAltitudeM).toBe(38);
    expect(model.laps).toHaveLength(11);
    expect(model.laps[0].startTime).toBe('2020-01-08T00:00:00.000Z');
    expect(model.laps[1].startTime).toBe('2020-01-08T00:27:25.000Z');
    expect(model.laps[10].startTime).toBe('2020-01-08T04:34:40.000Z');
    expect(model.summary.startTime).toBe('2020-01-08T00:00:00.000Z');
    expect(model.summary.endTime).not.toBe(model.summary.startTime);

    const boundaryIndex = model.points.findIndex((point) =>
      point.t.startsWith('2020-01-08T00:27:25'),
    );
    expect(boundaryIndex).toBeGreaterThan(0);
    expect(model.laps[0].pointRange).toEqual([0, boundaryIndex]);
    expect(model.laps[1].pointRange?.[0]).toBe(boundaryIndex + 1);
    expect(model.laps[10].pointRange?.[1]).toBe(model.points.length - 1);

    const lastLapSize =
      (model.laps[10].pointRange?.[1] ?? 0) -
      (model.laps[10].pointRange?.[0] ?? 0);
    expect(lastLapSize).toBeGreaterThan(0);
    expect(model.laps[10].distanceM).toBeCloseTo(3120, 0);

    const remainder = model.preservation?.remainder as {
      recordMesgs?: Array<Record<string, unknown> | null>;
      lapMesgs?: Array<Record<string, unknown> | null>;
      sessionMesgs?: Array<Record<string, unknown> | null>;
    };
    const leftoverRecord = remainder.recordMesgs?.find(
      (record) => record !== null && record !== undefined,
    );
    expect(leftoverRecord).toBeDefined();
    expect(leftoverRecord).not.toHaveProperty('heartRate');
    expect(leftoverRecord).not.toHaveProperty('positionLat');
    expect(leftoverRecord).not.toHaveProperty('timestamp');

    const leftoverLap = remainder.lapMesgs?.[0];
    expect(leftoverLap).toBeDefined();
    expect(leftoverLap).not.toHaveProperty('startTime');
    expect(leftoverLap).not.toHaveProperty('avgSpeed');
    expect(leftoverLap).not.toHaveProperty('totalCalories');
    expect(leftoverLap).toHaveProperty('timestamp');

    const leftoverSession = remainder.sessionMesgs?.[0];
    expect(leftoverSession).toBeDefined();
    expect(leftoverSession).not.toHaveProperty('startTime');
    expect(leftoverSession).not.toHaveProperty('timestamp');
    expect(leftoverSession).not.toHaveProperty('totalElapsedTime');
    expect(leftoverSession).not.toHaveProperty('maxAltitude');
    expect(leftoverSession).not.toHaveProperty('minAltitude');
  });
});

describe('parseFit suunto sample', () => {
  it('解析合成运动记录并保留设备、开发者字段和步频', async () => {
    const model = await parseFit(
      readFileSync(repoDemoPath('suunto/watch-run.fit')),
      { source: TRACK_SOURCE.suunto },
    );

    expect(model.summary.deviceModel).toBe('Suunto Spartan Sport Wrist HR');
    expect(model.summary.deviceManufacturer).toBe('suunto');
    expect(model.preservation?.remainder.fieldDescriptionMesgs).toBeDefined();
    expect(model.points.length).toBeGreaterThan(3000);
    expect(model.summary.distance2dM).toBe(52560);
    expect(model.summary.durationSec).toBe(17520);
    expect(model.summary.endTime?.startsWith('2020-01-08')).toBe(true);
    expect(model.preservation).toBeDefined();

    const cadenceValues = model.points
      .map((point) => point.cad)
      .filter((value): value is number => value !== undefined);
    const avgCadence = Math.round(
      cadenceValues.reduce((sum, value) => sum + value, 0) / cadenceValues.length,
    );
    expect(avgCadence).toBeGreaterThanOrEqual(160);
    expect(avgCadence).toBeLessThanOrEqual(170);
  });
});

describe('parseFit no-gps-records fixture', () => {
  it('保留无 GPS 但带心率的 record', async () => {
    const model = await parseFit(
      readFileSync(fixturePath('no-gps-records.fit')),
      { source: TRACK_SOURCE.suunto },
    );
    const noCoordPoints = model.points.filter(
      (point) => point.lon === undefined || point.lat === undefined,
    );
    const noCoordWithHr = noCoordPoints.filter((point) => point.hr !== undefined);
    expect(model.points.length).toBeGreaterThan(10);
    expect(noCoordPoints.length).toBeGreaterThan(0);
    expect(noCoordWithHr.length).toBeGreaterThan(0);
  });
});
