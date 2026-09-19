import { readFileSync } from 'fs';
import { FILE_FORMAT, TRACK_SOURCE } from '../constants';
import { fixturePath, repoDemoPath } from '../../test/fixtures/paths';
import { decodeFitBuffer } from '../parsers/fit-decoder';
import { parseFit } from '../parsers/fit.parser';
import { parseGpx } from '../parsers/gpx.parser';
import { parseTcx } from '../parsers/tcx.parser';
import { mergeExportRaw } from './activity-export';
import { encodeFitMessages, writeFit } from './fit.writer';

const DEMO_FIT_FILES = [
  'garmin/forerunner-run.fit',
  'joyrun/phone-run.fit',
  'joyrun-suunto/watch-run.fit',
  'suunto/watch-run.fit',
] as const;

describe('writeFit', () => {
  it('从 GPX 轨迹生成可解码的 activity FIT', async () => {
    const model = await parseGpx(readFileSync(fixturePath('sample.gpx')), {
      source: TRACK_SOURCE.garmin,
    });

    const buffer = await writeFit({ ...model, fileFormat: FILE_FORMAT.fit });
    const decoded = await decodeFitBuffer(buffer);

    expect(decoded.errors).toHaveLength(0);
    expect(decoded.messages.fileIdMesgs).toHaveLength(1);
    expect(decoded.messages.recordMesgs?.length).toBe(model.points.length);
    expect(decoded.messages.lapMesgs?.length).toBeGreaterThan(0);
    expect(decoded.messages.sessionMesgs).toHaveLength(1);
    expect(decoded.messages.activityMesgs).toHaveLength(1);
  });

  it('从 TCX 轨迹生成可解码的 activity FIT', async () => {
    const model = await parseTcx(readFileSync(fixturePath('sample.tcx')), {
      source: TRACK_SOURCE.garmin,
    });

    const buffer = await writeFit({ ...model, fileFormat: FILE_FORMAT.fit });
    const decoded = await decodeFitBuffer(buffer);

    expect(decoded.errors).toHaveLength(0);
    expect(decoded.messages.fileIdMesgs).toHaveLength(1);
    expect(decoded.messages.recordMesgs?.length).toBe(model.points.length);
    expect(decoded.messages.lapMesgs?.length).toBeGreaterThan(0);
    expect(decoded.messages.sessionMesgs).toHaveLength(1);
    expect(decoded.messages.activityMesgs).toHaveLength(1);
  });

  it('补齐已有 Lap 中为空的关键字段', async () => {
    const startTime = new Date('2026-07-21T10:00:00.000Z');
    const endTime = new Date('2026-07-21T10:02:00.000Z');
    const buffer = await encodeFitMessages({
      recordMesgs: [
        {
          timestamp: startTime,
          positionLat: 270353159,
          positionLong: 1357829811,
          distance: 0,
        },
        {
          timestamp: endTime,
          positionLat: 270351465,
          positionLong: 1357820565,
          distance: 1000,
        },
      ],
      lapMesgs: [
        {
          timestamp: endTime,
          startTime,
          event: 'lap',
          eventType: undefined,
          totalElapsedTime: 120,
          totalTimerTime: undefined,
          totalDistance: 1000,
        },
      ],
    });
    const decoded = await decodeFitBuffer(buffer);
    const lap = decoded.messages.lapMesgs?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(decoded.errors).toHaveLength(0);
    expect(lap?.eventType).toBe('stop');
    expect(lap?.totalTimerTime).toBe(120);
  });

  it('FIT 跑步 session avgCadence 按 cadenceScaled 还原为 rpm', async () => {
    const activity = await parseFit(
      readFileSync(repoDemoPath('garmin/forerunner-run.fit')),
      { source: TRACK_SOURCE.garmin },
    );
    expect(activity.preservation?.transformations.cadenceScaled).toBe(true);
    expect(activity.summary.avgCadence).toBe(168);

    const raw = mergeExportRaw(activity, FILE_FORMAT.fit);
    const session = (raw.sessionMesgs as Array<Record<string, unknown>> | undefined)?.[0];
    expect(session?.avgCadence).toBe(84);
  });

  it('FIT 同格式写回保留各条 deviceInfo 的 manufacturer / productName', async () => {
    const activity = await parseFit(
      readFileSync(repoDemoPath('garmin/forerunner-run.fit')),
      { source: TRACK_SOURCE.garmin },
    );
    const raw = mergeExportRaw(activity, FILE_FORMAT.fit);
    const devices = raw.deviceInfoMesgs as Array<Record<string, unknown>>;
    expect(devices[0]).toMatchObject({
      deviceIndex: 'creator',
      manufacturer: 'garmin',
    });
    expect(devices[0]).not.toHaveProperty('productName');
    expect(devices[1]).toMatchObject({ manufacturer: 'garmin', product: 1619 });
    expect(devices[2]).toMatchObject({ manufacturer: 47881, product: 12 });
    expect(devices[4]).toMatchObject({
      deviceIndex: 'creator',
      manufacturer: 'garmin',
    });
  });

  it('remainder 的 localTimestamp uint32 原样写回', async () => {
    const buffer = await encodeFitMessages(
      {
        recordMesgs: [
          {
            timestamp: new Date('2017-06-05T12:00:00.000Z'),
            distance: 0,
          },
        ],
      },
      {
        activityMesgs: [
          {
            timestamp: new Date('2017-06-05T12:00:00.000Z'),
            localTimestamp: 865627315,
          },
        ],
      },
    );
    const decoded = await decodeFitBuffer(buffer);
    const activity = decoded.messages.activityMesgs?.[0] as
      | { localTimestamp?: number }
      | undefined;

    expect(decoded.errors).toHaveLength(0);
    expect(activity?.localTimestamp).toBe(865627315);
  });

  it.each(DEMO_FIT_FILES)('round-trip %s 可再解码', async (file) => {
    const activity = await parseFit(readFileSync(repoDemoPath(file)));
    const raw = mergeExportRaw(activity, FILE_FORMAT.fit);
    const buffer = await writeFit(activity);
    const decoded = await decodeFitBuffer(buffer);

    expect(Array.isArray(raw.recordMesgs)).toBe(true);
    expect(raw.recordMesgs).toHaveLength(activity.points.length);
    expect(Array.isArray(raw.fileIdMesgs)).toBe(true);
    expect(Array.isArray(raw.lapMesgs)).toBe(true);
    expect(Array.isArray(raw.sessionMesgs)).toBe(true);
    expect((raw.lapMesgs as unknown[]).length).toBeGreaterThan(0);
    expect((raw.sessionMesgs as unknown[]).length).toBeGreaterThan(0);
    expect(decoded.errors).toHaveLength(0);
    expect(decoded.messages.fileIdMesgs).toHaveLength(1);
    expect(decoded.messages.recordMesgs?.length).toBe(activity.points.length);
    expect(decoded.messages.lapMesgs?.length).toBeGreaterThan(0);
    expect(decoded.messages.sessionMesgs?.length).toBeGreaterThan(0);
    expect(decoded.messages.activityMesgs).toHaveLength(1);
  });
});

