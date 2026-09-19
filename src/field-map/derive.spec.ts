import { FILE_FORMAT, TRACK_SOURCE } from '../constants';
import type { Activity, FormatTransformMeta } from '../types';
import {
  applyDeriveEntries,
  applyDerivers,
  applySummaryDerivers,
  DERIVE_REGISTRY,
} from './derive';

function emptyMeta(): FormatTransformMeta {
  return {
    sourceFormat: 'fit',
    derivedFields: [],
    cadenceScaled: false,
    cleanupVersion: 1,
  };
}

function baseActivity(overrides?: Partial<Activity['summary']>): Activity {
  return {
    summary: {
      sportType: 1,
      source: TRACK_SOURCE.garmin,
      startTime: '2026-08-14T10:37:58.000Z',
      ...overrides,
    },
    points: [
      { t: '2026-08-14T10:37:58.000Z', lat: 22.66, lon: 113.81, dist: 0 },
      { t: '2026-08-14T11:47:18.000Z', lat: 22.67, lon: 113.82, dist: 8061 },
    ],
    laps: [],
    fileFormat: FILE_FORMAT.fit,
    sourceCoordSystem: 1,
    coordinateDetection: { method: 'source', confidence: 'low' },
    altitudeRef: 2,
  };
}

describe('DERIVE_REGISTRY', () => {
  it('按格式分列，形态对齐 FIELD_REGISTRY', () => {
    const duration = DERIVE_REGISTRY.find((entry) => entry.semantic === 'durationSec');
    const device = DERIVE_REGISTRY.find((entry) => entry.semantic === 'deviceModel');
    const startTime = DERIVE_REGISTRY.find((entry) => entry.semantic === 'startTime');
    const endTime = DERIVE_REGISTRY.find((entry) => entry.semantic === 'endTime');
    expect(duration?.fit).toEqual(expect.any(Function));
    expect(duration?.tcx).toEqual(expect.any(Function));
    expect(duration?.gpx).toEqual(expect.any(Function));
    expect(startTime?.gpx).toEqual(expect.any(Function));
    expect(startTime?.fit).toBeNull();
    expect(endTime?.fit).toEqual(expect.any(Function));
    expect(endTime?.tcx).toBeNull();
    expect(endTime?.gpx).toBeNull();
    const manufacturer = DERIVE_REGISTRY.find(
      (entry) => entry.semantic === 'deviceManufacturer',
    );
    expect(device?.fit).toEqual(expect.any(Function));
    expect(device?.gpx).toBeNull();
    expect(manufacturer?.fit).toEqual(expect.any(Function));
    expect(manufacturer?.gpx).toBeNull();
    expect(device?.tcx).toBeNull();
    const activityName = DERIVE_REGISTRY.find((entry) => entry.semantic === 'activityName');
    expect(activityName?.gpx).toEqual(expect.any(Function));
    expect(activityName?.fit).toBeNull();
    expect(activityName?.tcx).toBeNull();
    const avgPace = DERIVE_REGISTRY.find((entry) => entry.semantic === 'avgPaceSecPerKm');
    expect(avgPace?.fit).toEqual(expect.any(Function));
    expect(avgPace?.tcx).toEqual(expect.any(Function));
    expect(avgPace?.gpx).toEqual(expect.any(Function));
  });
});

describe('applySummaryDerivers', () => {
  it('FIT 时长对全部 session 的 totalTimerTime 求和并保留小数', () => {
    const core = baseActivity({ durationSec: 1 });
    const meta = emptyMeta();
    applySummaryDerivers(
      core,
      {
        sessionMesgs: [{ totalTimerTime: 2000.4 }, { totalTimerTime: 156.584 }],
        activityMesgs: [{ totalTimerTime: 10 }],
      },
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.summary.durationSec).toBeCloseTo(2156.984, 3);
    expect(core.summary.activeDurationSec).toBeCloseTo(2156.984, 3);
    expect(meta.derivedFields).toEqual(
      expect.arrayContaining(['summary.durationSec', 'summary.activeDurationSec']),
    );
  });

  it('FIT session 缺 timer 时回退 activity / lap / elapsed', () => {
    const core = baseActivity();
    const meta = emptyMeta();
    applySummaryDerivers(
      core,
      {
        sessionMesgs: [{ totalElapsedTime: 100 }],
        activityMesgs: [{}],
        lapMesgs: [{ totalTimerTime: 40 }, { totalTimerTime: 50 }],
      },
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.summary.durationSec).toBe(90);
  });

  it('FIT endTime 用 startTime + session.totalElapsedTime，覆盖 timestamp', () => {
    const core = baseActivity({
      startTime: '2026-08-14T10:37:58.000Z',
      endTime: '2026-08-14T10:37:58.000Z',
    });
    const meta = emptyMeta();
    applyDerivers(
      core,
      {
        sessionMesgs: [{ totalElapsedTime: 4160 }],
      },
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.summary.endTime).toBe('2026-08-14T11:47:18.000Z');
    expect(meta.derivedFields).toContain('summary.endTime');
  });

  it('FIT 无 totalElapsedTime 时保留已有 endTime', () => {
    const core = baseActivity({
      endTime: '2026-08-14T10:37:58.000Z',
    });
    const meta = emptyMeta();
    applyDerivers(core, { sessionMesgs: [{}] }, FILE_FORMAT.fit, meta);
    expect(core.summary.endTime).toBe('2026-08-14T10:37:58.000Z');
    expect(meta.derivedFields).not.toContain('summary.endTime');
  });

  it('FIT 设备型号优先 creator 的 garminProduct，不用 file_id 全球款', () => {
    const core = baseActivity();
    const meta = emptyMeta();
    applySummaryDerivers(
      core,
      {
        fileIdMesgs: [{ manufacturer: 'garmin', product: 2431, garminProduct: 'fr235' }],
        deviceInfoMesgs: [
          {
            deviceIndex: 1,
            manufacturer: 47881,
            product: 1619,
            garminProduct: 1619,
          },
          {
            deviceIndex: 'creator',
            manufacturer: 'garmin',
            product: 2396,
            garminProduct: 'fr235Asia',
          },
        ],
      },
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.summary.deviceManufacturer).toBe('garmin');
    expect(core.summary.deviceModel).toBe('Forerunner 235 (Asia)');
  });

  it('Suunto 用 creator 的 productName，不把 product=30 当 garmin 编号', () => {
    const core = baseActivity({ deviceModel: 'wrong' });
    const meta = emptyMeta();
    applySummaryDerivers(
      core,
      {
        deviceInfoMesgs: [
          {
            deviceIndex: 'creator',
            manufacturer: 'suunto',
            product: 30,
            productName: 'Suunto Spartan Sport Wrist HR',
          },
        ],
      },
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.summary.deviceManufacturer).toBe('suunto');
    expect(core.summary.deviceModel).toBe('Suunto Spartan Sport Wrist HR');
  });

  it('GPX 活动名优先 trk/name，creator 原样保留、不拆设备', () => {
    const core = baseActivity({ name: 'from-registry', deviceManufacturer: 'should-stay' });
    core.fileFormat = FILE_FORMAT.gpx;
    const meta = { ...emptyMeta(), sourceFormat: 'gpx' as const };
    applySummaryDerivers(
      core,
      {
        gpx: {
          $: { creator: 'Garmin Connect' },
          metadata: [{ name: ['file-title'] }],
          trk: [{ name: ['北京市 跑步'] }],
        },
      },
      FILE_FORMAT.gpx,
      meta,
    );
    expect(core.summary.name).toBe('北京市 跑步');
    expect(core.summary.deviceManufacturer).toBe('should-stay');
    expect(core.summary.deviceModel).toBeUndefined();
    expect(meta.derivedFields).toContain('summary.name');
  });

  it('GPX 无 trk/name 时回退 metadata/name，无 creator 时跳过咕咚占位名', () => {
    const named = baseActivity();
    named.fileFormat = FILE_FORMAT.gpx;
    const namedMeta = { ...emptyMeta(), sourceFormat: 'gpx' as const };
    applySummaryDerivers(
      named,
      { gpx: { metadata: [{ name: ['Morning Run'] }], trk: [{}] } },
      FILE_FORMAT.gpx,
      namedMeta,
    );
    expect(named.summary.name).toBe('Morning Run');

    const placeholder = baseActivity({ name: undefined });
    placeholder.fileFormat = FILE_FORMAT.gpx;
    const placeholderMeta = { ...emptyMeta(), sourceFormat: 'gpx' as const };
    applySummaryDerivers(
      placeholder,
      { gpx: { metadata: [{ name: ['Codoon_Sport_Record'] }], trk: [{}] } },
      FILE_FORMAT.gpx,
      placeholderMeta,
    );
    expect(placeholder.summary.name).toBeUndefined();
  });

  it('咕咚 creator + 占位名 + desc 含时间时用 desc 作名称并只填 startTime', () => {
    const core = baseActivity({
      startTime: '2026-07-23T01:44:31.000Z',
    });
    core.fileFormat = FILE_FORMAT.gpx;
    core.points = [
      { t: '2026-07-23T01:44:31.000Z', lat: 40.07, lon: 116.31 },
      { t: '2026-07-23T01:44:31.000Z', lat: 40.08, lon: 116.32 },
    ];
    const meta = { ...emptyMeta(), sourceFormat: 'gpx' as const };
    applySummaryDerivers(
      core,
      {
        gpx: {
          $: { creator: 'Chengdu Ledong Information & Technology Co., Ltd.' },
          metadata: [
            {
              name: ['Codoon_Sport_Record'],
              desc: ['Codoon_Sport_2016-02-27 08:40:23'],
              time: ['2026-07-23T01:44:31Z'],
            },
          ],
          trk: [{ trkseg: [{ trkpt: [{ $: { lat: '40.07', lon: '116.31' } }] }] }],
        },
      },
      FILE_FORMAT.gpx,
      meta,
    );
    expect(core.summary.name).toBe('Codoon_Sport_2016-02-27 08:40:23');
    expect(core.summary.startTime).toBe('2016-02-27T00:40:23.000Z');
    expect(core.summary.endTime).toBeUndefined();
    expect(core.points.map((point) => point.t)).toEqual([
      '2026-07-23T01:44:31.000Z',
      '2026-07-23T01:44:31.000Z',
    ]);
  });

  it('FIT 已有 elapsed 时不覆盖 activeDurationSec', () => {
    const core = baseActivity({ durationSec: 4157, activeDurationSec: 4160 });
    const meta = emptyMeta();
    applySummaryDerivers(
      core,
      { sessionMesgs: [{ totalTimerTime: 4157 }] },
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.summary.durationSec).toBe(4157);
    expect(core.summary.activeDurationSec).toBe(4160);
    expect(meta.derivedFields).not.toContain('summary.activeDurationSec');
  });

  it('无独立 elapsed 时 activeDurationSec 与 durationSec 对齐', () => {
    const core = baseActivity({ durationSec: 90 });
    core.fileFormat = FILE_FORMAT.tcx;
    const meta = { ...emptyMeta(), sourceFormat: 'tcx' as const };
    applySummaryDerivers(core, {}, FILE_FORMAT.tcx, meta);
    expect(core.summary.activeDurationSec).toBe(90);
    expect(meta.derivedFields).toContain('summary.activeDurationSec');
  });

  it('GPX 无时长字段时用首末点墙钟并保留 2 位小数', () => {
    const core = baseActivity();
    core.fileFormat = FILE_FORMAT.gpx;
    core.points = [
      { t: '2018-05-24T22:43:51.330Z' },
      { t: '2018-05-24T22:50:15.800Z' },
    ];
    const meta = { ...emptyMeta(), sourceFormat: 'gpx' as const };
    applySummaryDerivers(core, {}, FILE_FORMAT.gpx, meta);
    expect(core.summary.durationSec).toBe(384.47);
    expect(meta.derivedFields).toContain('summary.durationSec');
  });

  it('海拔优先保留 session，否则圈级，再否则点级 ele', () => {
    const fromSession = baseActivity({ maxAltitudeM: 34, minAltitudeM: 6 });
    fromSession.points = [
      { t: '2026-08-14T10:37:58.000Z', ele: 10 },
      { t: '2026-08-14T11:47:18.000Z', ele: 80 },
    ];
    applySummaryDerivers(fromSession, {}, FILE_FORMAT.fit, emptyMeta());
    expect(fromSession.summary.maxAltitudeM).toBe(34);
    expect(fromSession.summary.minAltitudeM).toBe(6);

    const fromLaps = baseActivity();
    fromLaps.laps = [
      {
        index: 0,
        startTime: '2026-08-14T10:37:58.000Z',
        durationSec: 1,
        distanceM: 1,
        maxAltitudeM: 40,
        minAltitudeM: 8,
      },
      {
        index: 1,
        startTime: '2026-08-14T11:47:16.000Z',
        durationSec: 1,
        distanceM: 1,
        maxAltitudeM: 22,
        minAltitudeM: 5,
      },
    ];
    fromLaps.points = [
      { t: '2026-08-14T10:37:58.000Z', ele: 99 },
      { t: '2026-08-14T11:47:18.000Z', ele: 1 },
    ];
    applySummaryDerivers(fromLaps, {}, FILE_FORMAT.fit, emptyMeta());
    expect(fromLaps.summary.maxAltitudeM).toBe(40);
    expect(fromLaps.summary.minAltitudeM).toBe(5);

    const fromPoints = baseActivity();
    fromPoints.fileFormat = FILE_FORMAT.gpx;
    fromPoints.points = [
      { t: '2026-08-14T10:37:58.000Z', ele: 11 },
      { t: '2026-08-14T11:47:18.000Z', ele: 66.6 },
    ];
    const pointMeta = { ...emptyMeta(), sourceFormat: 'gpx' as const };
    applySummaryDerivers(fromPoints, {}, FILE_FORMAT.gpx, pointMeta);
    expect(fromPoints.summary.maxAltitudeM).toBe(66.6);
    expect(fromPoints.summary.minAltitudeM).toBe(11);
  });

  it('平均配速优先用 avgSpeedMps，否则用计时时长 / 距离', () => {
    const fromSpeed = baseActivity({
      avgSpeedMps: 2.5,
      durationSec: 100,
      distance2dM: 1000,
    });
    const speedMeta = emptyMeta();
    applySummaryDerivers(fromSpeed, {}, FILE_FORMAT.fit, speedMeta);
    expect(fromSpeed.summary.avgPaceSecPerKm).toBeCloseTo(400, 5);
    expect(speedMeta.derivedFields).toContain('summary.avgPaceSecPerKm');

    const fromDuration = baseActivity({
      durationSec: 300,
      distance2dM: 1000,
    });
    fromDuration.fileFormat = FILE_FORMAT.tcx;
    fromDuration.points = [];
    const durationMeta = { ...emptyMeta(), sourceFormat: 'tcx' as const };
    applySummaryDerivers(fromDuration, {}, FILE_FORMAT.tcx, durationMeta);
    expect(fromDuration.summary.avgPaceSecPerKm).toBeCloseTo(300, 5);
  });

  it('已有平均配速时不覆盖；缺距离或速度时不填', () => {
    const kept = baseActivity({
      avgPaceSecPerKm: 250,
      avgSpeedMps: 2,
    });
    const keptMeta = emptyMeta();
    applySummaryDerivers(kept, {}, FILE_FORMAT.fit, keptMeta);
    expect(kept.summary.avgPaceSecPerKm).toBe(250);
    expect(keptMeta.derivedFields).not.toContain('summary.avgPaceSecPerKm');

    const missing = baseActivity({ durationSec: 100 });
    missing.fileFormat = FILE_FORMAT.gpx;
    missing.points = [
      { t: '2026-08-14T10:37:58.000Z' },
      { t: '2026-08-14T10:38:58.000Z' },
    ];
    applySummaryDerivers(
      missing,
      {},
      FILE_FORMAT.gpx,
      { ...emptyMeta(), sourceFormat: 'gpx' },
    );
    expect(missing.summary.avgPaceSecPerKm).toBeUndefined();
  });
});

describe('applyDerivers 任意 core 路径', () => {
  it('laps[] 对每个对象子项调用 deriver，并带上 index', () => {
    const core = baseActivity();
    core.laps = [
      {
        index: 0,
        startTime: '2026-08-14T10:37:58.000Z',
        durationSec: 1,
        distanceM: 1,
        calories: 10,
      },
      {
        index: 1,
        startTime: '2026-08-14T11:47:16.000Z',
        durationSec: 2,
        distanceM: 2,
        calories: 20,
      },
    ];
    const meta = emptyMeta();
    const indexes: number[] = [];
    applyDeriveEntries(
      [
        {
          semantic: 'lapCalories',
          core: 'laps[].calories',
          fit: (context) => {
            indexes.push(context.index ?? -1);
            return (Number(context.target.calories) ?? 0) + 1;
          },
          tcx: null,
          gpx: null,
        },
      ],
      core,
      {},
      FILE_FORMAT.fit,
      meta,
    );
    expect(indexes).toEqual([0, 1]);
    expect(core.laps.map((lap) => lap.calories)).toEqual([11, 21]);
    expect(meta.derivedFields).toEqual(['laps[].calories']);
  });

  it('points[] 对每个对象子项调用 deriver', () => {
    const core = baseActivity();
    const meta = emptyMeta();
    applyDeriveEntries(
      [
        {
          semantic: 'pointSpeed',
          core: 'points[].spd',
          fit: (context) => (context.index ?? 0) + 0.5,
          tcx: null,
          gpx: null,
        },
      ],
      core,
      {},
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.points.map((point) => point.spd)).toEqual([0.5, 1.5]);
    expect(meta.derivedFields).toEqual(['points[].spd']);
  });

  it('数组中的非对象子项跳过，不调用 deriver', () => {
    const core = baseActivity();
    (core.laps as unknown[]) = [
      {
        index: 0,
        startTime: '2026-08-14T10:37:58.000Z',
        durationSec: 1,
        distanceM: 1,
      },
      42,
      null,
    ];
    const called: number[] = [];
    applyDeriveEntries(
      [
        {
          semantic: 'lapDuration',
          core: 'laps[].durationSec',
          fit: (context) => {
            called.push(context.index ?? -1);
            return 9;
          },
          tcx: null,
          gpx: null,
        },
      ],
      core,
      {},
      FILE_FORMAT.fit,
      emptyMeta(),
    );
    expect(called).toEqual([0]);
    expect(core.laps[0].durationSec).toBe(9);
  });

  it('嵌套对象属性与 Activity 根属性也可推导', () => {
    const core = baseActivity();
    const meta = emptyMeta();
    applyDeriveEntries(
      [
        {
          semantic: 'coordMethod',
          core: 'coordinateDetection.method',
          fit: () => 'metadata',
          tcx: null,
          gpx: null,
        },
        {
          semantic: 'altitudeRef',
          core: 'altitudeRef',
          fit: () => 1,
          tcx: null,
          gpx: null,
        },
      ],
      core,
      {},
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.coordinateDetection.method).toBe('metadata');
    expect(core.altitudeRef).toBe(1);
    expect(meta.derivedFields).toEqual([
      'coordinateDetection.method',
      'altitudeRef',
    ]);
  });

  it('返回 undefined 时保留原值且不记 derivedFields', () => {
    const core = baseActivity();
    core.laps = [
      {
        index: 0,
        startTime: '2026-08-14T10:37:58.000Z',
        durationSec: 12,
        distanceM: 1,
      },
    ];
    const meta = emptyMeta();
    applyDeriveEntries(
      [
        {
          semantic: 'lapDuration',
          core: 'laps[].durationSec',
          fit: () => undefined,
          tcx: null,
          gpx: null,
        },
      ],
      core,
      {},
      FILE_FORMAT.fit,
      meta,
    );
    expect(core.laps[0].durationSec).toBe(12);
    expect(meta.derivedFields).toEqual([]);
  });

  it('applyDerivers 仍走 DERIVE_REGISTRY，applySummaryDerivers 为别名', () => {
    const core = baseActivity({ durationSec: 1 });
    const alias = baseActivity({ durationSec: 1 });
    const raw = { sessionMesgs: [{ totalTimerTime: 40 }] };
    applyDerivers(core, raw, FILE_FORMAT.fit, emptyMeta());
    applySummaryDerivers(alias, raw, FILE_FORMAT.fit, emptyMeta());
    expect(core.summary.durationSec).toBe(40);
    expect(alias.summary.durationSec).toBe(40);
  });
});
