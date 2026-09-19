import { readFileSync } from 'fs';
import { COORD_SYSTEM } from '../src/constants';
import { parseFit } from '../src/parsers/fit.parser';
import { parseXmlConfigB } from '../src/parsers/xml-parser-config';
import { writeTcx } from '../src/serializers/tcx.writer';
import { repoDemoPath } from './fixtures/paths';
import { collectTcxTrackpoints, diffXmlTrees } from './xml-tree-diff';

const DEMO_FILE = 'joyrun-suunto/watch-run';

describe('FIT → TCX 整体转换', () => {
  it('parseFit 后 writeTcx(GCJ-02) 对比原 TCX（忽略字段顺序）', async () => {
    const fitPath = repoDemoPath(`${DEMO_FILE}.fit`);
    const originalTcxPath = repoDemoPath(`${DEMO_FILE}.tcx`);
    const activity = await parseFit(readFileSync(fitPath));
    const xml = writeTcx(activity, { targetCoordSystem: COORD_SYSTEM.gcj02 });

    const originalTree = await parseXmlConfigB(readFileSync(originalTcxPath));
    const afterTree = await parseXmlConfigB(Buffer.from(xml, 'utf8'));
    const originalPoints = collectTcxTrackpoints(originalTree);
    const afterPoints = collectTcxTrackpoints(afterTree);
    const diff = diffXmlTrees(originalTree, afterTree);

    expect(xml).toContain('<TrainingCenterDatabase');
    expect(xml).toContain('<Id>2020-01-07T00:00:00');
    expect(xml).not.toContain('<Id>2020-01-07T01:00:25');
    expect(xml).toContain('<Cadence>84</Cadence>');
    expect(xml).not.toContain('<Cadence>168</Cadence>');
    expect(xml).toContain('<DistanceMeters>15</DistanceMeters>');
    expect(afterPoints.length).toBe(activity.points.length);
    expect(afterPoints.length).toBeGreaterThan(0);
    expect(originalPoints.length).toBeGreaterThan(0);
    expect(diff.originalLeafCount).toBeGreaterThan(0);
    expect(diff.afterLeafCount).toBeGreaterThan(0);
  });
});
