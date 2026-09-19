import {
  FILE_FORMAT,
  SPORT_TYPE,
  TRACK_SOURCE,
} from '../constants';
import {
  isRunningLikeSport,
  normalizeCadenceToSpm,
  shouldScaleCadenceToSpm,
} from './running-cadence';

describe('normalizeCadenceToSpm', () => {
  const fitGarmin = {
    sportType: SPORT_TYPE.run,
    fileFormat: FILE_FORMAT.fit,
    source: TRACK_SOURCE.garmin,
  };

  it('FIT 跑步 cadence 按格式换算 rpm→spm', () => {
    expect(normalizeCadenceToSpm(82, fitGarmin)).toBe(164);
    expect(normalizeCadenceToSpm(86, fitGarmin)).toBe(172);
  });

  it('同文件内全部点使用同一规则，不因数值阈值跳变', () => {
    expect(normalizeCadenceToSpm(82, fitGarmin)).toBe(164);
    expect(normalizeCadenceToSpm(120, fitGarmin)).toBe(240);
  });

  it('Joyrun TCX 与 Garmin TCX 同样按 rpm 换算为 spm', () => {
    expect(
      normalizeCadenceToSpm(120, {
        sportType: SPORT_TYPE.run,
        fileFormat: FILE_FORMAT.tcx,
        source: TRACK_SOURCE.joyrun,
      }),
    ).toBe(240);
  });

  it('骑行等非跑步类不换算', () => {
    expect(normalizeCadenceToSpm(82, { ...fitGarmin, sportType: SPORT_TYPE.bike })).toBe(
      82,
    );
  });
});

describe('shouldScaleCadenceToSpm', () => {
  it('FIT/TCX/GPX 跑步默认换算', () => {
    expect(
      shouldScaleCadenceToSpm({
        sportType: SPORT_TYPE.run,
        fileFormat: FILE_FORMAT.tcx,
        source: TRACK_SOURCE.garmin,
      }),
    ).toBe(true);
  });
});

describe('isRunningLikeSport', () => {
  it('识别跑步与越野跑', () => {
    expect(isRunningLikeSport(SPORT_TYPE.run)).toBe(true);
    expect(isRunningLikeSport(SPORT_TYPE.trailRun)).toBe(true);
    expect(isRunningLikeSport(SPORT_TYPE.bike)).toBe(false);
  });
});
