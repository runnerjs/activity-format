import {
  isConcretePathMapped,
  matchObjectKey,
  parsePath,
  resolvePathHit,
  resolvePathValue,
  resolvePathValueFirst,
  setPathValue,
} from './path-util';

describe('parsePath', () => {
  it('将 $ 与后续段解析为属性', () => {
    const segments = parsePath(
      'TrainingCenterDatabase.Activities[].Activity[].$.Sport',
    );
    expect(segments.at(-1)).toEqual({ kind: 'attr', name: 'Sport' });
  });

  it('支持 $.attr 单段写法', () => {
    const segments = parsePath('gpx.trk[].trkseg[].trkpt[].$.lat');
    expect(segments.at(-1)).toEqual({ kind: 'attr', name: 'lat' });
  });

  it('解析 *:localName 通配段', () => {
    const segments = parsePath(
      'extensions[].*:TrackPointExtension[].*:hr',
    );
    expect(segments[1]).toEqual({
      kind: 'prop',
      name: 'TrackPointExtension',
      array: true,
      wildcard: true,
    });
    expect(segments[2]).toEqual({
      kind: 'prop',
      name: 'hr',
      array: false,
      wildcard: true,
    });
  });
});

describe('matchObjectKey / resolvePathValue wildcard', () => {
  const trkpt = {
    extensions: [
      {
        'ns3:TrackPointExtension': [{ 'ns3:hr': ['115'], 'ns3:cad': ['84'] }],
      },
    ],
  };

  it('matchObjectKey 按 localName 匹配命名空间前缀', () => {
    expect(
      matchObjectKey('ns3:hr', {
        kind: 'prop',
        name: 'hr',
        array: false,
        wildcard: true,
      }),
    ).toBe(true);
    expect(
      matchObjectKey('gpxtpx:hr', {
        kind: 'prop',
        name: 'hr',
        array: false,
        wildcard: true,
      }),
    ).toBe(true);
    expect(
      matchObjectKey('hr', {
        kind: 'prop',
        name: 'hr',
        array: false,
        wildcard: true,
      }),
    ).toBe(true);
  });

  it('resolvePathValue 读取 ns3 前缀心率', () => {
    expect(
      resolvePathValue(
        trkpt,
        'extensions[].*:TrackPointExtension[].*:hr',
      ),
    ).toBe('115');
  });

  it('resolvePathValueFirst 支持无 TrackPointExtension 包裹', () => {
    const direct = { extensions: [{ hr: ['120'] }] };
    expect(
      resolvePathValueFirst(direct, [
        'extensions[].*:TrackPointExtension[].*:hr',
        'extensions[].*:hr',
      ]),
    ).toBe('120');
  });
});

describe('TCX HeartRateBpm / ns3:TPX', () => {
  const trackpoint = {
    HeartRateBpm: [{ Value: ['115'] }],
    Extensions: [
      {
        'ns3:TPX': [
          { 'ns3:Speed': ['2.809000015258789'], 'ns3:RunCadence': ['84'] },
        ],
      },
    ],
  };

  it('HeartRateBpm[].Value 读出配置 B 包装的心率', () => {
    expect(resolvePathValue(trackpoint, 'HeartRateBpm[].Value')).toBe('115');
    expect(resolvePathValue(trackpoint, 'HeartRateBpm.Value')).toBeUndefined();
  });

  it('*:TPX 通配读取 ns3:Speed / ns3:RunCadence', () => {
    expect(
      resolvePathValue(trackpoint, 'Extensions[].*:TPX[].*:Speed'),
    ).toBe('2.809000015258789');
    expect(
      resolvePathValue(trackpoint, 'Extensions[].*:TPX[].*:RunCadence'),
    ).toBe('84');
  });

  it('resolvePathHit 记录 * 匹配到的实际键', () => {
    expect(resolvePathHit(trackpoint, 'Extensions[].*:TPX[].*:Speed')).toEqual({
      value: '2.809000015258789',
      path: 'Extensions[].*:TPX[].*:Speed',
      wildcards: ['ns3:TPX', 'ns3:Speed'],
    });
  });
});

describe('isConcretePathMapped', () => {
  it('通配 registry 路径应覆盖具体 ns3 前缀路径', () => {
    const mapped = new Set([
      'gpx.trk[].trkseg[].trkpt[].extensions[].*:TrackPointExtension[].*:hr',
    ]);
    expect(
      isConcretePathMapped(
        'gpx.trk[].trkseg[].trkpt[].extensions[].ns3:TrackPointExtension[].ns3:hr',
        mapped,
      ),
    ).toBe(true);
  });
});

describe('setPathValue / resolvePathValue', () => {
  it('往返写入 TCX 属性与元素', () => {
    const root: Record<string, unknown> = {
      TrainingCenterDatabase: {
        Activities: [{ Activity: [{ Lap: [{}] }] }],
      },
    };
    setPathValue(
      root,
      'TrainingCenterDatabase.Activities[].Activity[].$.Sport',
      'Running',
      [0, 0],
    );
    setPathValue(
      root,
      'TrainingCenterDatabase.Activities[].Activity[].Lap[].$.StartTime',
      '2016-05-21T23:32:02Z',
      [0, 0, 0],
    );

    const activity = (
      (root.TrainingCenterDatabase as Record<string, unknown>).Activities as
        | unknown[]
        | undefined
    )?.[0] as Record<string, unknown>;
    const act = (activity.Activity as unknown[])?.[0] as Record<string, unknown>;
    expect((act.$ as Record<string, unknown>).Sport).toBe('Running');
    expect((act.Lap as unknown[])[0]).toMatchObject({
      $: { StartTime: '2016-05-21T23:32:02Z' },
    });
    expect(
      resolvePathValue(
        root,
        'TrainingCenterDatabase.Activities[].Activity[].$.Sport',
      ),
    ).toBe('Running');
  });

  it('wildcard 段按 wildcardPrefix 写入带前缀键', () => {
    const root: Record<string, unknown> = { extensions: [{}] };
    setPathValue(
      root,
      'extensions[].*:TrackPointExtension[].*:hr',
      115,
      [0, 0],
      { wildcardPrefix: 'ns3' },
    );
    expect(root).toEqual({
      extensions: [
        { 'ns3:TrackPointExtension': [{ 'ns3:hr': ['115'] }] },
      ],
    });
  });

  it('wildcardKeys 按解析记录的实际键写出', () => {
    const root: Record<string, unknown> = { Extensions: [{}] };
    setPathValue(
      root,
      'Extensions[].*:TPX[].*:RunCadence',
      84,
      [0, 0],
      { wildcardKeys: ['ns3:TPX', 'ns3:RunCadence'] },
    );
    expect(root).toEqual({
      Extensions: [{ 'ns3:TPX': [{ 'ns3:RunCadence': ['84'] }] }],
    });
  });
});
