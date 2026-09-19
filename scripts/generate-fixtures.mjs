// Deterministic fixtures generated without personal activity files.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Encoder, Profile } from '@garmin/fitsdk';

const dir = new URL('../test/fixtures/', import.meta.url);
const start = Date.parse('2020-02-01T00:00:00Z');
const time = (i) => new Date(start + i * 5000).toISOString().replace('.000Z', 'Z');
const point = (i) => ({ lat: 25 + i * 0.000135, lon: 110, hr: 140 + i % 7, cad: 84 + i % 3 });
const save = (name, contents) => writeFileSync(fileURLToPath(new URL(name, dir)), contents);
const declaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
function gpxPoint(i, elevation = '40.0') {
  const p = point(i);
  return `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${elevation}</ele><time>${time(i)}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`;
}
const gpx = (body, creator = 'Suunto app') => declaration + `<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" creator="${creator}" version="1.1"><metadata><name>synthetic-run</name><author><name>synthetic</name></author></metadata>${body}</gpx>\n`;
save('sample.gpx', gpx(`<trk><trkseg>${Array.from({ length: 35 }, (_, i) => gpxPoint(i)).join('')}</trkseg></trk>`));
save('suunto-mini.gpx', gpx(`<trk><trkseg>${gpxPoint(0, '21.0')}${gpxPoint(1, '7.2')}</trkseg></trk>`));
// The unescaped ampersand is intentional: this fixture exercises XML repair.
save('codoon-invalid-amp.gpx', gpx(`<trk><trkseg>${gpxPoint(0)}${gpxPoint(1)}</trkseg></trk>`, 'Chengdu Ledong Information & Technology Co., Ltd.'));
save('multi-trk.gpx', gpx(`<trk><name>track-a</name><trkseg>${gpxPoint(0)}${gpxPoint(1)}</trkseg><trkseg>${gpxPoint(2)}</trkseg></trk><trk><name>track-b</name><trkseg>${gpxPoint(3)}${gpxPoint(4)}</trkseg><trkseg>${gpxPoint(5)}</trkseg></trk>`, 'fixture'));
function tcxPoint(i) {
  const p = point(i);
  return `<Trackpoint><Time>${time(i)}</Time><Position><LatitudeDegrees>${p.lat.toFixed(6)}</LatitudeDegrees><LongitudeDegrees>${p.lon.toFixed(6)}</LongitudeDegrees></Position><AltitudeMeters>40.0</AltitudeMeters><DistanceMeters>${i * 15}</DistanceMeters><HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm><Cadence>${p.cad}</Cadence></Trackpoint>`;
}
function lap(first, count) {
  const duration = (count - 1) * 5;
  return `<Lap StartTime="${time(first)}"><TotalTimeSeconds>${duration}</TotalTimeSeconds><DistanceMeters>${duration * 3}</DistanceMeters><Calories>${Math.round(duration * .15)}</Calories><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${Array.from({ length: count }, (_, i) => tcxPoint(first + i)).join('')}</Track></Lap>`;
}
const activity = (first, laps, notes = '') => `<Activity Sport="Running"><Id>${time(first)}</Id>${laps}${notes ? `<Notes>${notes}</Notes>` : ''}</Activity>`;
const tcx = (activities) => declaration + `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities>${activities}</Activities></TrainingCenterDatabase>\n`;
save('sample.tcx', tcx(activity(0, lap(0, 35))));
save('multi-lap.tcx', tcx(activity(0, lap(0, 2) + lap(2, 1))));
save('multi-activity.tcx', tcx(activity(0, lap(0, 2), 'activity-one') + activity(12, lap(12, 1), 'activity-two')));
function fit(name, noGps = false) {
  const encoder = new Encoder();
  const write = (type, fields) => encoder.onMesg(Profile.MesgNum[type], fields);
  write('FILE_ID', { type: 'activity', manufacturer: 'development', timeCreated: new Date(start) });
  for (let i = 0; i < 35; i++) {
    const p = point(i);
    write('RECORD', { timestamp: new Date(start + i * 5000), distance: i * 15, heartRate: p.hr, cadence: p.cad, altitude: 40, speed: 3, ...(!noGps || i % 3 ? { positionLat: Math.round(p.lat * 2 ** 31 / 180), positionLong: Math.round(p.lon * 2 ** 31 / 180) } : {}) });
  }
  const summary = { timestamp: new Date(start + 170000), startTime: new Date(start), totalElapsedTime: 170, totalTimerTime: 170, totalDistance: 510, sport: 'running' };
  write('LAP', { ...summary, event: 'lap', eventType: 'stop', lapTrigger: 'sessionEnd' });
  write('SESSION', { ...summary, firstLapIndex: 0, numLaps: 1 });
  write('ACTIVITY', { timestamp: summary.timestamp, totalTimerTime: 170, numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop' });
  save(name, encoder.close());
}
fit('sample.fit');
fit('no-gps-records.fit', true);
const monitoring = new Encoder();
monitoring.onMesg(Profile.MesgNum.FILE_ID, { type: 'monitoringB', timeCreated: new Date(start) });
save('monitoring.fit', monitoring.close());
console.log('Generated synthetic XML and FIT fixtures.');
