import { readFileSync } from 'fs';
import {
  applyCodoonGpxMetadataFallback,
  gpxRawHasTrackpointTimes,
  isCodoonGpxContent,
  parseCodoonGpxDescStartTime,
  readGpxMetadataText,
} from './codoon-gpx.util';
import { parseXmlConfigB } from './xml-parser-config';
import { fixturePath, repoDemoPath } from '../../test/fixtures/paths';
import { TRACK_SOURCE } from '../constants';
import type { Activity } from '../types';

describe('parseCodoonGpxDescStartTime', () => {
  it('应解析 desc 中的本地时间为 ISO UTC', () => {
    expect(
      parseCodoonGpxDescStartTime('Codoon_Sport_2016-02-27 08:40:23'),
    ).toBe('2016-02-27T00:40:23.000Z');
  });

  it('非咕咚 desc 返回 null', () => {
    expect(parseCodoonGpxDescStartTime('Running on 2016-02-27')).toBeNull();
  });
});

describe('gpxRawHasTrackpointTimes', () => {
  it('咕咚 demo 无 trkpt/time', async () => {
    const raw = await parseXmlConfigB(
      readFileSync(
        repoDemoPath('codoon/local-run.gpx'),
      ),
    );
    expect(gpxRawHasTrackpointTimes(raw)).toBe(false);
  });

  it('fixture 含 trkpt/time', async () => {
    const raw = await parseXmlConfigB(
      readFileSync(
        fixturePath('suunto-mini.gpx'),
      ),
    );
    expect(gpxRawHasTrackpointTimes(raw)).toBe(true);
  });
});

describe('applyCodoonGpxMetadataFallback', () => {
  it('只把 desc 时间写进 startTime，不改 endTime 和轨迹点', async () => {
    const raw = await parseXmlConfigB(
      readFileSync(
        repoDemoPath('codoon/local-run.gpx'),
      ),
    );
    const model: Activity = {
      summary: {
        sportType: 1,
        source: TRACK_SOURCE.codoon,
        startTime: '2026-07-23T01:44:31.000Z',
      },
      points: [{ t: '' }, { t: '' }],
      laps: [],
      fileFormat: 3,
      sourceCoordSystem: 2,
      coordinateDetection: { method: 'source', confidence: 'high' },
      altitudeRef: 1,
    };

    applyCodoonGpxMetadataFallback(raw, model, TRACK_SOURCE.codoon);

    expect(model.summary.startTime).toBe('2020-01-01T00:00:00.000Z');
    expect(model.summary.endTime).toBeUndefined();
    expect(model.points.map((point) => point.t)).toEqual(['', '']);
    expect(readGpxMetadataText(raw, 'desc')).toBe(
      'Codoon_Sport_2020-01-01 08:00:00',
    );
  });
});

describe('isCodoonGpxContent', () => {
  it('creator 含 Ledong 应识别为咕咚', () => {
    expect(
      isCodoonGpxContent('Chengdu Ledong Information', '', undefined),
    ).toBe(true);
  });
});
