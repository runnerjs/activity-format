import { COORD_SYSTEM, FILE_FORMAT, SPORT_TYPE, TRACK_SOURCE } from '../constants';
import type { Activity } from '../types';
import { wgs84ToGcj02 } from '../coordinates';
import { assertPreservationAlignment } from './preservation';
import { writeGpx } from '../serializers/gpx.writer';

function sampleActivity(): Activity {
  const summary = {
    name: 'Run',
    sportType: SPORT_TYPE.run,
    source: TRACK_SOURCE.codoon,
    startTime: '2016-02-27T00:40:23.000Z',
  };
  const points = [{ t: summary.startTime, lon: 116.4, lat: 39.9 }];
  return {
    summary,
    points,
    laps: [],
    fileFormat: FILE_FORMAT.gpx,
    sourceCoordSystem: COORD_SYSTEM.gcj02,
    coordinateDetection: { method: 'explicit', confidence: 'certain' },
    altitudeRef: 2,
    preservation: {
      remainder: { gpx: { metadata: [{ desc: ['kept'] }] } },
      mappingVersion: 1,
      cleanupVersion: 1,
      transformations: { cadenceScaled: false, derivedFields: [] },
      originalPointCount: 1,
    },
  };
}

describe('preservation', () => {
  it('点数错位时 fail fast', () => {
    const activity = sampleActivity();
    activity.points.push({ t: activity.summary.startTime, lon: 116.41, lat: 39.91 });
    expect(() => assertPreservationAlignment(activity)).toThrow(/point_count/);
  });

  it('写回 GCJ-02 时按固定转换从 Activity 坐标逆还原', () => {
    const activity = sampleActivity();
    const converted = wgs84ToGcj02(116.4, 39.9);
    const xml = writeGpx(activity, { targetCoordSystem: COORD_SYSTEM.gcj02 });
    expect(xml).toContain(`lat="${converted.lat}"`);
    expect(xml).toContain(`lon="${converted.lon}"`);
    expect(xml).not.toContain('lat="39.9"');
    expect(xml).toContain('<desc>kept</desc>');
  });

  it('修改统一字段后使用新值', () => {
    const activity = sampleActivity();
    activity.summary.name = 'Edited';
    activity.points[0].lat = 40.1;
    activity.points[0].lon = 116.5;
    const xml = writeGpx(activity, { targetCoordSystem: COORD_SYSTEM.wgs84 });
    expect(xml).toContain('<name>Edited</name>');
    expect(xml).toContain('lat="40.1"');
  });
});
