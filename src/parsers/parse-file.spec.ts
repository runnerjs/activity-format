import { readFileSync } from 'fs';
import { COORD_SYSTEM, FILE_FORMAT } from '../constants';
import { parseFile } from './index';
import { fixturePath } from '../../test/fixtures/paths';
import { gcj02ToWgs84 } from '../coordinates';

describe('parseFile', () => {
  it('自动识别 GPX', async () => {
    const activity = await parseFile(readFileSync(fixturePath('sample.gpx')));
    expect(activity.fileFormat).toBe(FILE_FORMAT.gpx);
    expect(activity.points.length).toBeGreaterThan(0);
    expect(activity.coordinateDetection).toBeDefined();
  });

  it('显式坐标系优先', async () => {
    const activity = await parseFile(readFileSync(fixturePath('sample.gpx')), {
      sourceCoordSystem: COORD_SYSTEM.gcj02,
    });
    expect(activity.coordinateDetection).toEqual({
      method: 'explicit',
      confidence: 'certain',
    });
    expect(activity.sourceCoordSystem).toBe(COORD_SYSTEM.gcj02);
    const first = activity.points.find(
      (point) => point.lon !== undefined && point.lat !== undefined,
    );
    expect(first).toBeDefined();
  });
});

describe('gcj02 conversion helper', () => {
  it('国内坐标会产生偏移', () => {
    const wgs = gcj02ToWgs84(116.39745, 39.90878);
    expect(wgs.lon).not.toBe(116.39745);
  });
});
