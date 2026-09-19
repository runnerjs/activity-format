import { FILE_FORMAT } from '../constants';
import type { FileFormat, RegistryPathHit } from '../types';
import type { FieldMapEntry } from './types';

/**
 * 跨格式字段映射表：semantic ↔ Activity core ↔ FIT/TCX/GPX 原生路径。
 * 供 extractCore / reverseMap / deepStrip 共用。
 */
export const FIELD_REGISTRY: FieldMapEntry[] = [
  {
    semantic: 'sportType',
    core: 'summary.sportType',
    fit: 'sessionMesgs[].sport',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].$.Sport',
    gpx: 'gpx.trk[].type',
    direction: 'both',
  },
  {
    semantic: 'startTime',
    core: 'summary.startTime',
    fit: 'sessionMesgs[].startTime',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Id',
    gpx: 'gpx.trk[].trkseg[].trkpt[].time',
    direction: 'both',
  },
  {
    semantic: 'endTime',
    core: 'summary.endTime',
    fit: 'sessionMesgs[].timestamp',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'durationSec',
    core: 'summary.durationSec',
    unit: 'sec',
    fit: 'sessionMesgs[].totalTimerTime',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].TotalTimeSeconds',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'activeDurationSec',
    core: 'summary.activeDurationSec',
    unit: 'sec',
    fit: 'sessionMesgs[].totalElapsedTime',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'distance2dM',
    core: 'summary.distance2dM',
    unit: 'm',
    fit: 'sessionMesgs[].totalDistance',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].DistanceMeters',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'avgSpeedMps',
    core: 'summary.avgSpeedMps',
    unit: 'm/s',
    fit: 'sessionMesgs[].avgSpeed',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'maxSpeedMps',
    core: 'summary.maxSpeedMps',
    unit: 'm/s',
    fit: 'sessionMesgs[].maxSpeed',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'avgHeartRate',
    core: 'summary.avgHeartRate',
    unit: 'bpm',
    fit: 'sessionMesgs[].avgHeartRate',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].AverageHeartRateBpm[].Value',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'maxHeartRate',
    core: 'summary.maxHeartRate',
    unit: 'bpm',
    fit: 'sessionMesgs[].maxHeartRate',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].MaximumHeartRateBpm[].Value',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'avgCadence',
    core: 'summary.avgCadence',
    unit: 'spm',
    fit: 'sessionMesgs[].avgCadence',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'totalAscentM',
    core: 'summary.totalAscentM',
    unit: 'm',
    fit: 'sessionMesgs[].totalAscent',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'totalDescentM',
    core: 'summary.totalDescentM',
    unit: 'm',
    fit: 'sessionMesgs[].totalDescent',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'maxAltitudeM',
    core: 'summary.maxAltitudeM',
    unit: 'm',
    fit: 'sessionMesgs[].maxAltitude',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'minAltitudeM',
    core: 'summary.minAltitudeM',
    unit: 'm',
    fit: 'sessionMesgs[].minAltitude',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'calories',
    core: 'summary.calories',
    unit: 'kcal',
    fit: 'sessionMesgs[].totalCalories',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'creator',
    core: 'summary.creator',
    fit: null,
    tcx: null,
    gpx: 'gpx.$.creator',
    direction: 'both',
  },
  {
    semantic: 'activityName',
    core: 'summary.name',
    fit: null,
    tcx: null,
    // GPX 写出落到 trk/name；解析时 deriver 会优先 trk、再回退 metadata
    gpx: 'gpx.trk[].name',
    direction: 'both',
  },
  {
    semantic: 'pointTime',
    core: 'points[].t',
    fit: 'recordMesgs[].timestamp',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].Time',
    gpx: 'gpx.trk[].trkseg[].trkpt[].time',
    direction: 'both',
  },
  {
    semantic: 'pointLat',
    core: 'points[].lat',
    unit: 'deg',
    fit: 'recordMesgs[].positionLat',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].Position[].LatitudeDegrees',
    gpx: 'gpx.trk[].trkseg[].trkpt[].$.lat',
    direction: 'both',
  },
  {
    semantic: 'pointLon',
    core: 'points[].lon',
    unit: 'deg',
    fit: 'recordMesgs[].positionLong',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].Position[].LongitudeDegrees',
    gpx: 'gpx.trk[].trkseg[].trkpt[].$.lon',
    direction: 'both',
  },
  {
    semantic: 'pointEle',
    core: 'points[].ele',
    unit: 'm',
    fit: 'recordMesgs[].altitude',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].AltitudeMeters',
    gpx: 'gpx.trk[].trkseg[].trkpt[].ele',
    direction: 'both',
  },
  {
    semantic: 'pointHr',
    core: 'points[].hr',
    unit: 'bpm',
    fit: 'recordMesgs[].heartRate',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].HeartRateBpm[].Value',
    gpx: 'gpx.trk[].trkseg[].trkpt[].extensions[].*:TrackPointExtension[].*:hr',
    direction: 'both',
  },
  {
    semantic: 'pointCadence',
    core: 'points[].cad',
    unit: 'spm',
    fit: 'recordMesgs[].cadence',
    tcx: [
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].Cadence',
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].Extensions[].*:TPX[].*:RunCadence',
    ],
    gpx: 'gpx.trk[].trkseg[].trkpt[].extensions[].*:TrackPointExtension[].*:cad',
    direction: 'both',
  },
  {
    semantic: 'pointSpeed',
    core: 'points[].spd',
    unit: 'm/s',
    fit: 'recordMesgs[].speed',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].Extensions[].*:TPX[].*:Speed',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'pointDistance',
    core: 'points[].dist',
    unit: 'm',
    fit: 'recordMesgs[].distance',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Track[].Trackpoint[].DistanceMeters',
    gpx: null,
    direction: 'both',
  },
  // {
  //   semantic: 'pointVerticalSpeed',
  //   core: 'points[].verticalSpeed',
  //   unit: 'm/s',
  //   fit: 'recordMesgs[].verticalSpeed',
  //   tcx: null,
  //   gpx: null,
  //   direction: 'both',
  // },
  {
    semantic: 'lapStartTime',
    core: 'laps[].startTime',
    fit: 'lapMesgs[].startTime',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].$.StartTime',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapDurationSec',
    core: 'laps[].durationSec',
    unit: 'sec',
    fit: 'lapMesgs[].totalElapsedTime',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].TotalTimeSeconds',
    gpx: null,
    requiredIn: ['tcx'],
    direction: 'both',
  },
  {
    semantic: 'lapDistanceM',
    core: 'laps[].distanceM',
    unit: 'm',
    fit: 'lapMesgs[].totalDistance',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].DistanceMeters',
    gpx: null,
    requiredIn: ['tcx'],
    direction: 'both',
  },
  {
    semantic: 'lapAvgHr',
    core: 'laps[].avgHr',
    unit: 'bpm',
    fit: 'lapMesgs[].avgHeartRate',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].AverageHeartRateBpm[].Value',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapMaxHr',
    core: 'laps[].maxHr',
    unit: 'bpm',
    fit: 'lapMesgs[].maxHeartRate',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].MaximumHeartRateBpm[].Value',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapAvgSpeed',
    core: 'laps[].avgSpeed',
    unit: 'm/s',
    fit: 'lapMesgs[].avgSpeed',
    tcx: [
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Extensions[].*:TPX[].*:AvgSpeed',
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Extensions[].*:LX[].*:AvgSpeed',
    ],
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapMaxSpeed',
    core: 'laps[].maxSpeed',
    unit: 'm/s',
    fit: 'lapMesgs[].maxSpeed',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].MaximumSpeed',
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapCalories',
    core: 'laps[].calories',
    unit: 'kcal',
    fit: 'lapMesgs[].totalCalories',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].Calories',
    gpx: null,
    requiredIn: ['tcx'],
    direction: 'both',
  },
  {
    semantic: 'lapAvgCadence',
    core: 'laps[].avgCadence',
    unit: 'spm',
    fit: 'lapMesgs[].avgCadence',
    tcx: [
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Cadence',
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Extensions[].*:TPX[].*:AvgRunCadence',
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Extensions[].*:LX[].*:AvgRunCadence',
    ],
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapMaxCadence',
    core: 'laps[].maxCadence',
    unit: 'spm',
    fit: 'lapMesgs[].maxCadence',
    tcx: [
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Extensions[].*:TPX[].*:MaxRunCadence',
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].Extensions[].*:LX[].*:MaxRunCadence',
    ],
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapAvgAltitudeM',
    core: 'laps[].avgAltitudeM',
    unit: 'm',
    fit: 'lapMesgs[].avgAltitude',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapMaxAltitudeM',
    core: 'laps[].maxAltitudeM',
    unit: 'm',
    fit: 'lapMesgs[].maxAltitude',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapMinAltitudeM',
    core: 'laps[].minAltitudeM',
    unit: 'm',
    fit: 'lapMesgs[].minAltitude',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapTotalAscentM',
    core: 'laps[].totalAscentM',
    unit: 'm',
    fit: 'lapMesgs[].totalAscent',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapTotalDescentM',
    core: 'laps[].totalDescentM',
    unit: 'm',
    fit: 'lapMesgs[].totalDescent',
    tcx: null,
    gpx: null,
    direction: 'both',
  },
  {
    semantic: 'lapTrigger',
    core: 'laps[].trigger',
    fit: 'lapMesgs[].lapTrigger',
    tcx: 'TrainingCenterDatabase.Activities[].Activity[].Lap[].TriggerMethod',
    gpx: null,
    direction: 'both',
  },
];

/**
 * 把 FileFormat 常量映射为 registry 条目上的路径键。
 * @param format 文件格式（fit / gpx / tcx）
 * @returns `'fit' | 'tcx' | 'gpx'`
 */
export function formatPathKey(format: FileFormat): 'fit' | 'tcx' | 'gpx' {
  switch (format) {
    case FILE_FORMAT.fit:
      return 'fit';
    case FILE_FORMAT.tcx:
      return 'tcx';
    case FILE_FORMAT.gpx:
      return 'gpx';
    default:
      // 不支持的文件格式
      throw new Error(`Unsupported file format: ${format}`);
  }
}

/**
 * 把 registry 某格式列规范成路径数组（字符串视为单元素数组）。
 * @param entry 映射表条目
 * @param format 文件格式
 * @returns 非空路径列表；该格式无路径时为空数组
 */
export function rawPathsOf(
  entry: FieldMapEntry,
  format: FileFormat,
): string[] {
  const raw = entry[formatPathKey(format)];
  if (!raw) return [];
  if (typeof raw === 'string') return [raw];
  return [...raw];
}

/**
 * 收集当前格式应从 raw 中剔除的已映射路径（供 deepStrip）。
 *
 * 单路径条目：该路径写入 core 后从 remainder 去掉。
 * 多候选条目：只剔除实际命中的那一条；未用到的别名留在 remainder，写回时由 merge 还原。
 * @param format 文件格式
 * @param pathHits extractCore 记录的多候选命中；缺省时不剔除任何多候选路径
 * @returns 该格式应剔除的 raw 路径集合
 */
export function mappedPathsForStrip(
  format: FileFormat,
  pathHits?: Record<string, RegistryPathHit>,
): Set<string> {
  const paths = new Set<string>();
  for (const entry of FIELD_REGISTRY) {
    // 无 core 落点：只存在于 remainder，不剔除
    if (!entry.core) continue;
    const rawPaths = rawPathsOf(entry, format);
    if (rawPaths.length === 0) continue;
    if (rawPaths.length === 1) {
      paths.add(rawPaths[0]);
      continue;
    }
    const hit = pathHits?.[entry.core];
    if (hit === undefined) continue;
    paths.add(rawPaths[hit.index] ?? rawPaths[0]);
  }
  return paths;
}

/**
 * 列出当前格式可映射的 registry 条目及其全部 raw 路径（按 registry 优先级）。
 * @param format 文件格式
 * @returns `{ entry, rawPaths }` 列表；无 core 或该格式路径为空的条目被跳过
 */
export function entriesForFormat(format: FileFormat): Array<{
  entry: FieldMapEntry;
  rawPaths: string[];
}> {
  return FIELD_REGISTRY.flatMap((entry) => {
    if (!entry.core) return [];
    const rawPaths = rawPathsOf(entry, format);
    if (rawPaths.length === 0) return [];
    return [{ entry, rawPaths }];
  });
}
