import { readFileSync } from 'fs';
import { FILE_FORMAT, SPORT_TYPE, TRACK_SOURCE } from '../constants';
import { CURRENT_SCHEMA_VERSION } from '../field-map/constant';
import { parseTcx } from '../parsers/tcx.parser';
import { parseXmlConfigB } from '../parsers/xml-parser-config';
import type { Activity } from '../types';
import { CURRENT_CLEANUP_VERSION } from '../utils/track-point';
import { repoDemoPath } from '../../test/fixtures/paths';
import {
  collectTcxTrackpoints,
  diffXmlTrees,
} from '../../test/xml-tree-diff';
import { writeTcx, writeTcxAsync } from './tcx.writer';

const DEMO_TCX_FILES = [
  'garmin/connect-run.tcx',
  'joyrun/phone-run.tcx',
  'joyrun-suunto/watch-run.tcx',
] as const;

const sampleActivity: Activity = {
  summary: {
    name: '测试跑步',
    sportType: SPORT_TYPE.run,
    source: TRACK_SOURCE.garmin,
    startTime: '2026-07-21T10:00:00.000Z',
    endTime: '2026-07-21T10:30:00.000Z',
    durationSec: 1800,
    distance2dM: 5000,
  },
  points: [
    {
      t: '2026-07-21T10:00:00.000Z',
      lat: 22.5431,
      lon: 114.0579,
      ele: 12,
      hr: 140,
      cad: 170,
    },
    {
      t: '2026-07-21T10:01:00.000Z',
      lat: 22.5435,
      lon: 114.0582,
      ele: 13,
      hr: 145,
      cad: 172,
      spd: 3.5,
    },
  ],
  laps: [
    {
      index: 0,
      startTime: '2026-07-21T10:00:00.000Z',
      durationSec: 1800,
      distanceM: 5000,
      avgHr: 142,
      maxHr: 145,
    },
  ],
  fileFormat: FILE_FORMAT.tcx,
  sourceCoordSystem: 1,
  coordinateDetection: { method: 'source', confidence: 'high' },
  altitudeRef: 2,
};

describe('writeTcx', () => {
  it('生成包含 Lap 与 Trackpoint 的 TCX', () => {
    const xml = writeTcx(sampleActivity);
    expect(xml).toContain('Sport="Running"');
    expect(xml).toContain('<LatitudeDegrees>22.5431</LatitudeDegrees>');
    expect(xml).toContain('<HeartRateBpm>');
    expect(xml).toContain('<TotalTimeSeconds>1800</TotalTimeSeconds>');
    expect(xml).toContain(
      'xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd',
    );
    expect(xml).toContain(
      'xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"',
    );
  });

  it('writeTcxAsync 与 writeTcx 写出相同内容', async () => {
    await expect(writeTcxAsync(sampleActivity)).resolves.toBe(
      writeTcx(sampleActivity),
    );
  });

  it('跨格式无 remainder 时走 merge，写出点距离并把 spm 还原为 rpm', () => {
    const xml = writeTcx({
      ...sampleActivity,
      fileFormat: FILE_FORMAT.fit,
      points: [
        { ...sampleActivity.points[0], cad: 168, dist: 0 },
        { ...sampleActivity.points[1], cad: 168, dist: 100.1 },
      ],
      preservation: {
        remainder: {},
        mappingVersion: CURRENT_SCHEMA_VERSION,
        cleanupVersion: CURRENT_CLEANUP_VERSION,
        transformations: { cadenceScaled: true, derivedFields: [] },
        originalPointCount: 2,
      },
    });
    expect(xml).toContain('<DistanceMeters>100.1</DistanceMeters>');
    expect(xml).toContain('<Cadence>84</Cadence>');
    expect(xml).not.toContain('<Cadence>168</Cadence>');
    expect(xml).toContain('>2026-07-21T10:00:00.000Z<');
  });

  it('Joyrun 写回同时保留 Cadence 与未映射的 ns3:RunCadence', async () => {
    const xml = writeTcx(
      await parseTcx(readFileSync(repoDemoPath('joyrun/phone-run.tcx')), {
        source: TRACK_SOURCE.joyrun,
      }),
    );
    expect(xml).toContain('<Cadence>84</Cadence>');
    expect(xml).toContain('<ns3:RunCadence>84</ns3:RunCadence>');
  });

  it('Garmin 写回点步频用 ns3:RunCadence，圈最大步频留在 LX', async () => {
    const xml = writeTcx(
      await parseTcx(readFileSync(repoDemoPath('garmin/connect-run.tcx')), {
        source: TRACK_SOURCE.garmin,
      }),
    );
    expect(xml).toContain('<ns3:RunCadence>84</ns3:RunCadence>');
    expect(xml).toContain('<ns3:Speed>3</ns3:Speed>');
    expect(xml).toContain('<ns3:LX>');
    expect(xml).toContain('<ns3:MaxRunCadence>87</ns3:MaxRunCadence>');
    expect(xml).not.toContain('<Cadence>');
    expect(xml).not.toMatch(/<ns3:TPX>\s*<ns3:MaxRunCadence>/);
  });

  it('圈时长与小数距离写回不取整', () => {
    const xml = writeTcx({
      ...sampleActivity,
      laps: [
        {
          ...sampleActivity.laps[0],
          durationSec: 384.33,
          distanceM: 1000.1,
          calories: 281,
        },
      ],
    });
    expect(xml).toContain('<TotalTimeSeconds>384.33</TotalTimeSeconds>');
    expect(xml).not.toContain('<TotalTimeSeconds>384</TotalTimeSeconds>');
    expect(xml).toContain('<DistanceMeters>1000.1</DistanceMeters>');
    expect(xml).not.toContain('<DistanceMeters>1000</DistanceMeters>');
    expect(xml).toContain('<Calories>281</Calories>');
  });

  it('解析后写回保留无毫秒时间戳与亚秒数值精度', async () => {
    const source = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">',
      '<Activities><Activity Sport="Running">',
      '<Id>2016-05-21T23:32:02Z</Id>',
      '<Lap StartTime="2016-05-21T23:32:02Z">',
      '<TotalTimeSeconds>384.33</TotalTimeSeconds>',
      '<DistanceMeters>1000.1</DistanceMeters>',
      '<Calories>10</Calories>',
      '<Intensity>Active</Intensity>',
      '<TriggerMethod>Manual</TriggerMethod>',
      '<Track><Trackpoint>',
      '<Time>2016-05-21T23:32:02Z</Time>',
      '<Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>116.2</LongitudeDegrees></Position>',
      '<DistanceMeters>8.5</DistanceMeters>',
      '</Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>',
    ].join('');
    const xml = writeTcx(await parseTcx(Buffer.from(source, 'utf8')));
    expect(xml).toContain('>2016-05-21T23:32:02Z<');
    expect(xml).toContain('StartTime="2016-05-21T23:32:02Z"');
    expect(xml).not.toContain('2016-05-21T23:32:02.000Z');
    expect(xml).toContain('<TotalTimeSeconds>384.33</TotalTimeSeconds>');
    expect(xml).toContain('<DistanceMeters>1000.1</DistanceMeters>');
    expect(xml).toContain('<DistanceMeters>8.5</DistanceMeters>');
  });

  it.each(DEMO_TCX_FILES)('round-trip %s 保持 Trackpoint 数量', async (file) => {
    const originalBuffer = readFileSync(repoDemoPath(file));
    const activity = await parseTcx(originalBuffer);
    const xml = writeTcx(activity);
    const originalTree = await parseXmlConfigB(originalBuffer);
    const afterTree = await parseXmlConfigB(Buffer.from(xml, 'utf8'));
    const originalPoints = collectTcxTrackpoints(originalTree);
    const afterPoints = collectTcxTrackpoints(afterTree);
    const diff = diffXmlTrees(originalTree, afterTree);

    expect(xml).toContain('<TrainingCenterDatabase');
    expect(xml).toContain('<Trackpoint');
    expect(afterPoints.length).toBe(originalPoints.length);
    expect(afterPoints.length).toBe(activity.points.length);
    expect(diff.originalLeafCount).toBeGreaterThan(0);
    expect(diff.afterLeafCount).toBeGreaterThan(0);
  });
});
