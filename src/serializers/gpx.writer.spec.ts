import { readFileSync } from 'fs';
import { FILE_FORMAT, SPORT_TYPE, TRACK_SOURCE } from '../constants';
import { parseGpx } from '../parsers/gpx.parser';
import { parseXmlConfigB } from '../parsers/xml-parser-config';
import type { Activity } from '../types';
import { fixturePath, repoDemoPath } from '../../test/fixtures/paths';
import { hasValidTrackCoordinate } from '../utils';
import { writeGpx } from './gpx.writer';

const DEMO_GPX_FILES = [
  'codoon/local-run.gpx',
  'codoon-suunto/watch-run.gpx',
  'garmin/connect-run.gpx',
] as const;

const sampleTrack: Activity = {
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
  fileFormat: FILE_FORMAT.gpx,
  sourceCoordSystem: 1,
  coordinateDetection: { method: 'source', confidence: 'high' },
  altitudeRef: 2,
};

describe('gpx.writer', () => {
  it('生成包含轨迹点与扩展指标的 GPX', () => {
    const xml = writeGpx(sampleTrack);
    expect(xml).toContain('<name>测试跑步</name>');
    expect(xml).toContain('creator="run-project"');
    expect(xml).toContain('lat="22.5431" lon="114.0579"');
    expect(xml).toContain('<gpxtpx:hr>140</gpxtpx:hr>');
    expect(xml).toContain('<gpxtpx:cad>170</gpxtpx:cad>');
  });

  it('有 summary.creator 时写回 gpx@creator', () => {
    const xml = writeGpx({
      ...sampleTrack,
      summary: { ...sampleTrack.summary, creator: 'Suunto app' },
    });
    expect(xml).toContain('creator="Suunto app"');
  });

  it('ele 小数写回保持小数，整数写成 n.0', () => {
    const withDecimal = writeGpx({
      ...sampleTrack,
      points: [{ ...sampleTrack.points[0], ele: 21.1 }],
    });
    const withWhole = writeGpx({
      ...sampleTrack,
      points: [{ ...sampleTrack.points[0], ele: 21 }],
    });
    expect(withDecimal).toContain('<ele>21.1</ele>');
    expect(withDecimal).not.toContain('<ele>21</ele>');
    expect(withWhole).toContain('<ele>21.0</ele>');
  });

  it('Garmin GPX 写回保留 ns3 扩展前缀', async () => {
    const xml = writeGpx(
      await parseGpx(readFileSync(repoDemoPath('garmin/connect-run.gpx'))),
    );
    expect(xml).toContain(
      'xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"',
    );
    expect(xml).toContain('<ns3:TrackPointExtension>');
    expect(xml).toContain('<ns3:hr>');
    expect(xml).toContain('<ns3:cad>');
    expect(xml).not.toMatch(/<(TrackPointExtension|hr|cad)>/);
  });

  it('Suunto GPX 写回保留 gpxtpx 扩展前缀', async () => {
    const xml = writeGpx(
      await parseGpx(
        readFileSync(
          fixturePath('suunto-mini.gpx'),
        ),
      ),
    );
    expect(xml).toContain('<gpxtpx:TrackPointExtension>');
    expect(xml).toContain('<gpxtpx:hr>');
    expect(xml).toContain('<ele>7.2</ele>');
    expect(xml).toContain('<ele>21.0</ele>');
    expect(xml).not.toContain('<ele>21</ele>');
    expect(xml).not.toMatch(/<(TrackPointExtension|hr)>/);
  });

  it.each(DEMO_GPX_FILES)('round-trip %s 保持有坐标的轨迹点数', async (file) => {
    const activity = await parseGpx(readFileSync(repoDemoPath(file)));
    const xml = writeGpx(activity);
    const after = await parseXmlConfigB(Buffer.from(xml, 'utf8'));

    expect(xml).toContain('<gpx');
    expect(xml).toContain('<trkpt');
    const gpx = after.gpx as Record<string, unknown> | undefined;
    const tracks = gpx?.trk as Array<Record<string, unknown>> | undefined;
    const segments = tracks?.[0]?.trkseg as Array<Record<string, unknown>> | undefined;
    const trkpts = segments?.[0]?.trkpt as unknown[] | undefined;
    expect(Array.isArray(trkpts)).toBe(true);
    expect((trkpts ?? []).length).toBeGreaterThan(0);
    expect((trkpts ?? []).length).toBe(
      activity.points.filter(hasValidTrackCoordinate).length,
    );
  });
});
