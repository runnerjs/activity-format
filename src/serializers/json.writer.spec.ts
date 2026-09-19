import type { Activity, WriteJsonOptions } from '../types';
import { writeJson } from './json.writer';

describe('writeJson', () => {
  const activity: Activity = {
    summary: {
      sportType: 1,
      source: 3,
      startTime: '2026-07-21T10:00:00.000Z',
      name: 'Test',
    },
    points: [{ t: '2026-07-21T10:00:00.000Z', lat: 22.5, lon: 114 }],
    laps: [],
    fileFormat: 3,
    sourceCoordSystem: 1,
    coordinateDetection: { method: 'default', confidence: 'low' },
    altitudeRef: 2,
    preservation: {
      remainder: { hidden: true },
      mappingVersion: 1,
      cleanupVersion: 1,
      transformations: { cadenceScaled: false, derivedFields: [] },
      originalPointCount: 1,
    },
  };

  it('默认不输出 preservation', () => {
    const json = writeJson(activity);
    expect(json).toContain('"name": "Test"');
    expect(json).not.toContain('preservation');
  });

  it('includePreservation 时输出 remainder', () => {
    const options: WriteJsonOptions = { includePreservation: true, indent: 0 };
    expect(writeJson(activity, options)).toContain('"hidden":true');
  });
});
