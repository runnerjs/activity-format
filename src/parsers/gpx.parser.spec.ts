import { readFileSync } from 'fs';
import { TRACK_SOURCE } from '../constants';
import { parseGpx } from './gpx.parser';
import { fixturePath, repoDemoPath } from '../../test/fixtures/paths';

describe('parseGpx codoon invalid ampersand', () => {
  it('应容错 creator 属性中未转义的 &', async () => {
    const model = await parseGpx(readFileSync(fixturePath('codoon-invalid-amp.gpx')), {
      source: TRACK_SOURCE.codoon,
    });
    expect(model.points.length).toBe(2);
  });
});

describe('parseGpx codoon local gpx metadata', () => {
  it('应从 metadata/desc 解析开始时间并用 desc 作为活动名', async () => {
    const model = await parseGpx(
      readFileSync(
        repoDemoPath('codoon/local-run.gpx'),
      ),
      { source: TRACK_SOURCE.codoon },
    );

    expect(model.summary.startTime).toBe('2020-01-01T00:00:00.000Z');
    expect(model.summary.endTime).toBeUndefined();
    expect(model.points[0].t).toBe('');
    expect(model.summary.name).toBe('Codoon_Sport_2020-01-01 08:00:00');
    expect(model.summary.creator).toBe(
      'Chengdu Ledong Information & Technology Co., Ltd.',
    );
    expect(model.summary.deviceManufacturer).toBeUndefined();
    expect(model.summary.deviceModel).toBeUndefined();
    expect(model.sourceCoordSystem).toBe(2);
    expect(model.coordinateDetection.method).toBe('source');
    expect(model.preservation).not.toHaveProperty('originalCore');
    expect(model.preservation).not.toHaveProperty('originalCoordinates');
    const remainder = JSON.stringify(model.preservation?.remainder ?? {});
    expect(remainder).toContain('Codoon_Sport_Record');
    expect(remainder).toContain('Codoon_Sport_2020-01-01 08:00:00');
    expect(remainder).not.toContain('"lat"');
    expect(remainder).not.toContain('"lon"');
  });
});

describe('parseGpx garmin connect sample', () => {
  it('应解析 ns3 前缀的心率与步频', async () => {
    const model = await parseGpx(
      readFileSync(repoDemoPath('garmin/connect-run.gpx')),
      { source: TRACK_SOURCE.garmin },
    );
    const withHr = model.points.filter((point) => point.hr != null).length;
    const withCad = model.points.filter((point) => point.cad != null).length;

    expect(model.points.length).toBeGreaterThan(500);
    expect(withHr).toBe(model.points.length);
    expect(withCad).toBe(model.points.length);
    expect(model.points[0].hr).toBe(145);
    expect(model.points[0].cad).toBe(168);
    expect(model.summary.name).toBe('Running');
    expect(model.summary.creator).toBe('Garmin Connect');
    expect(model.summary.deviceManufacturer).toBeUndefined();
    expect(model.summary.deviceModel).toBeUndefined();
  });
});

describe('parseGpx codoon suunto local gpx metadata', () => {
  it('应从 metadata/desc 解析开始时间并用 desc 作为活动名', async () => {
    const model = await parseGpx(
      readFileSync(repoDemoPath('codoon-suunto/watch-run.gpx')),
      { source: TRACK_SOURCE.codoon },
    );

    expect(model.summary.startTime).toBe('2020-01-02T00:00:00.000Z');
    expect(model.summary.endTime).toBeUndefined();
    expect(model.points[0].t).toBe('');
    expect(model.summary.name).toBe('Codoon_Sport_2020-01-02 08:00:00');
    expect(model.summary.creator).toBe(
      'Chengdu Ledong Information & Technology Co., Ltd.',
    );
    expect(model.sourceCoordSystem).toBe(2);
    expect(model.coordinateDetection.method).toBe('source');
  });
});
