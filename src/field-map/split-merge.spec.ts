import { FILE_FORMAT, TRACK_SOURCE } from '../constants';
import {
  assertArrayStructureEqual,
  assertLeafPathsEqual,
  collectLeafPaths,
} from './round-trip.spec-util';
import { CURRENT_SCHEMA_VERSION } from './constant';
import { deepStrip } from './deep-strip';
import {
  APPENDIX_D_EXTENSIONS,
  APPENDIX_D_TCX_RAW,
} from './fixtures/appendix-d-tcx.raw';
import { merge } from './merge';
import { deepClone } from './path-util';
import { mappedPathsForStrip } from './registry';
import { split } from './split';

describe('split / merge TCX 附录 D', () => {
  const raw = deepClone(APPENDIX_D_TCX_RAW);
  const options = {
    source: TRACK_SOURCE.garmin,
    meta: { cadenceScaled: true, derivedFields: [], cleanupVersion: 1 },
  };

  it('split 产出预期 extensions 形态', () => {
    const { extensions, core, meta } = split(raw, FILE_FORMAT.tcx, options);
    expect(meta.sourceFormat).toBe('tcx');
    expect(meta.cadenceScaled).toBe(true);
    expect(core.points).toHaveLength(2);
    expect(core.points[0].hr).toBe(115);
    expect(core.points[1].hr).toBe(117);
    expect(core.points[1].cad).toBe(168);
    expect(core.laps[0].index).toBe(0);
    expect(core.laps[0].calories).toBe(3);
    expect(core.laps[0].trigger).toBe('Manual');
    expect(core.laps[0].avgHr).toBe(152);
    expect(core.laps[0].maxHr).toBe(169);
    expect(core.laps[0].avgCadence).toBe(168);
    expect(core.laps[0].maxSpeed).toBe(3.5);
    expect(core.laps[0].pointRange).toEqual([0, 1]);
    expect(extensions).toEqual(APPENDIX_D_EXTENSIONS);
    expect(meta.pathHits?.['points[].cad']).toEqual({ index: 0 });
    expect(meta.pathHits?.['laps[].avgCadence']).toEqual({ index: 0 });
    expect(meta.pathHits?.['points[].hr']).toBeUndefined();
  });

  it('未命中的 tcx 候选路径留在 remainder', () => {
    const raw = deepClone(APPENDIX_D_TCX_RAW) as Record<string, unknown>;
    const point = (
      raw as typeof APPENDIX_D_TCX_RAW
    ).TrainingCenterDatabase.Activities[0].Activity[0].Lap[0].Track[0]
      .Trackpoint[1] as Record<string, unknown>;
    point.Extensions = [
      { 'ns3:TPX': [{ 'ns3:RunCadence': ['84'] }] },
    ];
    const { core, extensions, meta } = split(raw, FILE_FORMAT.tcx, options);
    expect(core.points[1].cad).toBe(168);
    expect(meta.pathHits?.['points[].cad']).toEqual({ index: 0 });
    const remainder = JSON.stringify(extensions);
    expect(remainder).toContain('ns3:RunCadence');
    expect(remainder).not.toMatch(/"Cadence"/);
    const merged = merge(core, extensions, meta, {
      targetFormat: FILE_FORMAT.tcx,
      alignment: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        pointCount: core.points.length,
      },
    });
    assertLeafPathsEqual(merged, raw);
  });

  it('merge(split(raw)) 叶子路径与 raw 一致', () => {
    const { core, extensions, meta } = split(raw, FILE_FORMAT.tcx, options);
    const merged = merge(core, extensions, meta, {
      targetFormat: FILE_FORMAT.tcx,
      alignment: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        pointCount: core.points.length,
      },
    });
    assertLeafPathsEqual(merged, raw);
    assertArrayStructureEqual(
      (merged as typeof APPENDIX_D_TCX_RAW).TrainingCenterDatabase
        .Activities[0].Activity[0].Lap[0].Track[0].Trackpoint,
      raw.TrainingCenterDatabase.Activities[0].Activity[0].Lap[0].Track[0]
        .Trackpoint,
      'Trackpoint',
    );
  });
});

describe('deepStrip', () => {
  it('未映射的 Date 叶子保留在 extensions', () => {
    const stripped = deepStrip(
      {
        lapMesgs: [
          {
            startTime: new Date('2026-08-14T10:37:58.000Z'),
            timestamp: new Date('2026-08-14T11:47:16.000Z'),
            totalDistance: 8059,
          },
        ],
      },
      mappedPathsForStrip(FILE_FORMAT.fit),
    ) as { lapMesgs: Array<{ timestamp: Date; startTime?: Date }> };

    expect(stripped.lapMesgs[0].timestamp).toEqual(
      new Date('2026-08-14T11:47:16.000Z'),
    );
    expect(stripped.lapMesgs[0].startTime).toBeUndefined();
  });

  it('已映射到 core 的字段从 extensions 剔除', () => {
    const raw = deepClone(APPENDIX_D_TCX_RAW);
    const stripped = deepStrip(raw, mappedPathsForStrip(FILE_FORMAT.tcx));
    const paths = collectLeafPaths(stripped);
    expect(
      paths.has(
        'TrainingCenterDatabase.Activities[].Activity[].Lap[].Calories[]',
      ),
    ).toBe(false);
    expect(
      paths.has(
        'TrainingCenterDatabase.Activities[].Activity[].Lap[].Intensity[]',
      ),
    ).toBe(true);
    expect(
      paths.has(
        'TrainingCenterDatabase.Activities[].Activity[].Lap[].TriggerMethod[]',
      ),
    ).toBe(false);
    expect(
      paths.has(
        'TrainingCenterDatabase.Activities[].Activity[].Lap[].AverageHeartRateBpm[].Value[]',
      ),
    ).toBe(false);
    expect(
      paths.has(
        'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].HeartRateBpm[].Value[]',
      ),
    ).toBe(false);
  });
});

describe('registry coverage', () => {
  it('TCX 映射路径可用于 split', () => {
    const { core } = split(APPENDIX_D_TCX_RAW, FILE_FORMAT.tcx, {
      source: TRACK_SOURCE.garmin,
    });
    expect(core.summary.startTime.startsWith('2016-05-21T23:32:02')).toBe(true);
    expect(core.summary.distance2dM).toBe(16);
    expect(core.summary.avgHeartRate).toBe(152);
    expect(core.summary.maxHeartRate).toBe(169);
    expect(core.points[0].lat).toBeCloseTo(40.010692, 5);
  });
});
