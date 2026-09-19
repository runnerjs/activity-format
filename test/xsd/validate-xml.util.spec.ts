import { validateXmlAgainstXsd } from './validate-xml.util';

describe('validateXmlAgainstXsd', () => {
  it('GPX 最小样本通过 schema 校验', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test">
  <trk><trkseg>
    <trkpt lat="22.66" lon="113.81"><time>2026-07-10T22:49:56Z</time></trkpt>
  </trkseg></trk>
</gpx>`;
    const result = validateXmlAgainstXsd(xml, 'gpx');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('TCX 最小样本通过 schema 校验', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2016-05-21T23:32:02Z</Id>
      <Lap StartTime="2016-05-21T23:32:02Z">
        <TotalTimeSeconds>10</TotalTimeSeconds>
        <DistanceMeters>16.0</DistanceMeters>
        <Calories>3</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
          <Trackpoint>
            <Time>2016-05-21T23:32:02Z</Time>
            <Position>
              <LatitudeDegrees>40.01</LatitudeDegrees>
              <LongitudeDegrees>116.38</LongitudeDegrees>
            </Position>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
    const result = validateXmlAgainstXsd(xml, 'tcx');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
