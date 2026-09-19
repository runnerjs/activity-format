import { TRACK_SOURCE } from '../constants';
import { CURRENT_SCHEMA_VERSION } from '../field-map/constant';
import { resolvePathValues } from '../field-map/path-util';
import { CURRENT_CLEANUP_VERSION } from '../utils/track-point';
import {
  CURRENT_CLEANUP_VERSION as exportedCleanupVersion,
  CURRENT_SCHEMA_VERSION as exportedSchemaVersion,
} from '../index';
import { parseGpx } from './gpx.parser';
import {
  sanitizeGpxRawTrackpoints,
  sanitizeTcxRawTrackpoints,
  sanitizeXmlPointArray,
  readXmlElementTimeMs,
} from './sanitize-xml-trackpoints';
import { parseTcx } from './tcx.parser';
import { parseXmlConfigB } from './xml-parser-config';

describe('version constants', () => {
  it('应从主入口导出当前 schema 与清洗版本', () => {
    expect(exportedSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(exportedCleanupVersion).toBe(CURRENT_CLEANUP_VERSION);
    expect(exportedSchemaVersion).toBe(1);
    expect(exportedCleanupVersion).toBe(1);
  });
});

describe('sanitizeXmlPointArray', () => {
  it('丢掉非法时间戳，按时间排序，无时间点排在末尾', () => {
    const points = [
      { time: ['2016-02-27T01:00:00Z'], id: 'late' },
      { time: ['1970-01-01T00:00:00Z'], id: 'epoch' },
      { id: 'no-time' },
      { time: ['not-a-date'], id: 'garbage' },
      { time: ['2016-02-27T00:30:00Z'], id: 'early' },
    ];
    const cleaned = sanitizeXmlPointArray(points, (point) =>
      readXmlElementTimeMs(point, 'time'),
    );
    expect(cleaned.map((point) => (point as { id: string }).id)).toEqual([
      'early',
      'late',
      'no-time',
    ]);
  });

  it('缺 GPS 但时间合法的点应保留', () => {
    const points = [
      { time: ['2016-02-27T01:00:00Z'] },
      { time: ['2016-02-27T00:30:00Z'] },
    ];
    const cleaned = sanitizeXmlPointArray(points, (point) =>
      readXmlElementTimeMs(point, 'time'),
    );
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0]).toBe(points[1]);
  });
});

describe('sanitizeGpxRawTrackpoints', () => {
  it('按 trkseg 就地清洗 trkpt', async () => {
    const raw = await parseXmlConfigB(
      Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="40.1" lon="116.1"><time>2016-02-27T01:00:00Z</time></trkpt>
      <trkpt lat="40.0" lon="116.0"><time>1970-01-01T00:00:00Z</time></trkpt>
      <trkpt lat="40.2" lon="116.2"><time>2016-02-27T00:30:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`),
    );
    expect(sanitizeGpxRawTrackpoints(raw)).toBe(2);
    const times = resolvePathValues(raw, 'gpx.trk[].trkseg[].trkpt[].time');
    expect(times.map((value) => String(Array.isArray(value) ? value[0] : value))).toEqual([
      '2016-02-27T00:30:00Z',
      '2016-02-27T01:00:00Z',
    ]);
  });
});

describe('sanitizeTcxRawTrackpoints', () => {
  it('按 Track 就地清洗 Trackpoint', async () => {
    const raw = await parseXmlConfigB(
      Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2016-02-27T00:30:00Z</Id>
      <Lap StartTime="2016-02-27T00:30:00Z">
        <TotalTimeSeconds>1800</TotalTimeSeconds>
        <DistanceMeters>100</DistanceMeters>
        <Calories>1</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
          <Trackpoint>
            <Time>2016-02-27T01:00:00Z</Time>
            <Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>116.1</LongitudeDegrees></Position>
          </Trackpoint>
          <Trackpoint>
            <Time>1970-01-01T00:00:00Z</Time>
            <Position><LatitudeDegrees>40.0</LatitudeDegrees><LongitudeDegrees>116.0</LongitudeDegrees></Position>
          </Trackpoint>
          <Trackpoint>
            <Time>2016-02-27T00:30:00Z</Time>
            <Position><LatitudeDegrees>40.2</LatitudeDegrees><LongitudeDegrees>116.2</LongitudeDegrees></Position>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`),
    );
    expect(sanitizeTcxRawTrackpoints(raw)).toBe(2);
    const times = resolvePathValues(
      raw,
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].Time',
    );
    expect(times.map((value) => String(Array.isArray(value) ? value[0] : value))).toEqual([
      '2016-02-27T00:30:00Z',
      '2016-02-27T01:00:00Z',
    ]);
  });
});

describe('parseGpx split 前清洗', () => {
  it('丢掉 1970 时间点，core 与 remainder 点数对齐', async () => {
    const activity = await parseGpx(
      Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>cleanup</name>
    <trkseg>
      <trkpt lat="40.1" lon="116.1"><time>2016-02-27T01:00:00Z</time><ele>10</ele></trkpt>
      <trkpt lat="39.9" lon="115.9"><time>1970-01-01T00:00:00Z</time><ele>11</ele></trkpt>
      <trkpt lat="40.2" lon="116.2"><time>2016-02-27T00:30:00Z</time><ele>12</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`),
      { source: TRACK_SOURCE.garmin },
    );

    expect(activity.points.map((point) => point.ele)).toEqual([12, 10]);
    expect(activity.preservation?.cleanupVersion).toBe(CURRENT_CLEANUP_VERSION);
    expect(activity.preservation?.mappingVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(activity.preservation?.originalPointCount).toBe(2);
    expect(activity.points).toHaveLength(2);
  });

  it('无 GPS 但时间合法的点应保留', async () => {
    const activity = await parseGpx(
      Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="40.1" lon="116.1"><time>2016-02-27T00:30:00Z</time></trkpt>
      <trkpt><time>2016-02-27T00:31:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`),
      { source: TRACK_SOURCE.garmin },
    );
    expect(activity.points).toHaveLength(2);
    expect(activity.points[1].lat).toBeUndefined();
    expect(activity.points[1].hr).toBeUndefined();
  });
});

describe('parseTcx split 前清洗', () => {
  it('丢掉 1970 时间点，core 与 remainder 点数对齐', async () => {
    const activity = await parseTcx(
      Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2016-02-27T00:30:00Z</Id>
      <Lap StartTime="2016-02-27T00:30:00Z">
        <TotalTimeSeconds>1800</TotalTimeSeconds>
        <DistanceMeters>100</DistanceMeters>
        <Calories>1</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
          <Trackpoint>
            <Time>2016-02-27T01:00:00Z</Time>
            <Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>116.1</LongitudeDegrees></Position>
            <AltitudeMeters>10</AltitudeMeters>
          </Trackpoint>
          <Trackpoint>
            <Time>1970-01-01T00:00:00Z</Time>
            <Position><LatitudeDegrees>39.9</LatitudeDegrees><LongitudeDegrees>115.9</LongitudeDegrees></Position>
            <AltitudeMeters>11</AltitudeMeters>
          </Trackpoint>
          <Trackpoint>
            <Time>2016-02-27T00:30:00Z</Time>
            <Position><LatitudeDegrees>40.2</LatitudeDegrees><LongitudeDegrees>116.2</LongitudeDegrees></Position>
            <AltitudeMeters>12</AltitudeMeters>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`),
      { source: TRACK_SOURCE.garmin },
    );

    expect(activity.points.map((point) => point.ele)).toEqual([12, 10]);
    expect(activity.preservation?.cleanupVersion).toBe(CURRENT_CLEANUP_VERSION);
    expect(activity.preservation?.originalPointCount).toBe(2);
    expect(activity.points).toHaveLength(2);
  });
});
