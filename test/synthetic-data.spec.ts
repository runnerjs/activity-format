import { readFileSync } from 'fs';
import { parseXmlConfigB } from '../src/parsers/xml-parser-config';
import { decodeFitBuffer } from '../src/parsers/fit-decoder';
import { repoDemoPath, fixturePath } from './fixtures/paths';

// Validate source data directly, so parser fallbacks cannot hide stale summaries.
describe('synthetic sample consistency', () => {
  it.each(['garmin/connect-run.tcx', 'joyrun/phone-run.tcx', 'joyrun-suunto/watch-run.tcx'])(
    '%s has lap summaries consistent with its generated points', async (file) => {
      const tree = await parseXmlConfigB(readFileSync(repoDemoPath(file)));
      const activities = (tree as any).TrainingCenterDatabase.Activities[0].Activity;
      for (const activity of activities) {
        const laps = activity.Lap;
        let distance = 0;
        for (let i = 0; i < laps.length; i++) {
          const lap = laps[i];
          const points = lap.Track.flatMap((track: any) => track.Trackpoint);
          const end = laps[i + 1]?.$?.StartTime ?? points[points.length - 1].Time[0];
          const duration = (Date.parse(end) - Date.parse(lap.$.StartTime)) / 1000;
          expect(Number(lap.TotalTimeSeconds[0])).toBe(duration);
          expect(Number(lap.DistanceMeters[0])).toBeCloseTo(duration * 3, 5);
          distance += Number(lap.DistanceMeters[0]);
          const heartRates = points.flatMap((p: any) => p.HeartRateBpm?.map((h: any) => Number(h.Value[0])) ?? []);
          if (heartRates.length) {
            expect(Number(lap.MaximumHeartRateBpm[0].Value[0])).toBe(Math.max(...heartRates));
            expect(Number(lap.AverageHeartRateBpm[0].Value[0])).toBe(Math.round(heartRates.reduce((a: number, b: number) => a + b, 0) / heartRates.length));
          }
          const lx = lap.Extensions?.[0]?.['ns3:LX']?.[0];
          if (lx?.['ns3:AvgSpeed']) expect(Number(lx['ns3:AvgSpeed'][0])).toBe(3);
        }
        const allPoints = laps.flatMap((lap: any) => lap.Track.flatMap((track: any) => track.Trackpoint));
        expect(distance).toBeCloseTo(Number(allPoints[allPoints.length - 1].DistanceMeters[0]), 5);
      }
    },
  );

  it.each(['sample.fit', 'no-gps-records.fit', 'monitoring.fit'])(
    '%s decodes without errors and contains only synthetic dates', async (file) => {
      const { messages, errors } = await decodeFitBuffer(readFileSync(fixturePath(file)));
      expect(errors).toEqual([]);
      expect(messages.fileIdMesgs?.[0].timeCreated).toEqual(new Date('2020-02-01T00:00:00Z'));
      expect(messages.fileIdMesgs?.[0].serialNumber).toBeUndefined();
    },
  );
});
