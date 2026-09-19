import { readFileSync } from 'fs';
import { parseGpx } from '../src/parsers/gpx.parser';
import { parseXmlConfigB } from '../src/parsers/xml-parser-config';
import { writeTcx } from '../src/serializers/tcx.writer';
import { repoDemoPath } from './fixtures/paths';
import { collectTcxTrackpoints, diffXmlTrees } from './xml-tree-diff';

const DEMO_FILE = 'garmin/connect-run';

describe('GPX → TCX 整体转换', () => {
  it('parseGpx 后 writeTcx 对比原 TCX（忽略字段顺序）', async () => {
    const gpxPath = repoDemoPath(`${DEMO_FILE}.gpx`);
    const originalTcxPath = repoDemoPath(`${DEMO_FILE}.tcx`);
    const activity = await parseGpx(readFileSync(gpxPath));
    const xml = writeTcx(activity);

    const originalTree = await parseXmlConfigB(readFileSync(originalTcxPath));
    const afterTree = await parseXmlConfigB(Buffer.from(xml, 'utf8'));
    const originalPoints = collectTcxTrackpoints(originalTree);
    const afterPoints = collectTcxTrackpoints(afterTree);
    const diff = diffXmlTrees(originalTree, afterTree);

    expect(xml).toContain('<TrainingCenterDatabase');
    expect(afterPoints.length).toBe(activity.points.length);
    expect(afterPoints.length).toBeGreaterThan(0);
    expect(originalPoints.length).toBeGreaterThan(0);
    expect(diff.originalLeafCount).toBeGreaterThan(0);
    expect(diff.afterLeafCount).toBeGreaterThan(0);
  });
});
