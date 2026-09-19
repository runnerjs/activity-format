import { SPORT_TYPE } from '../constants';
import {
  defaultActivityName,
  formatActivityDateInTz,
  formatDateTimeInTz,
  normalizeActivityName,
  resolveActivityDisplayName,
} from './activity-name';

describe('activity-name', () => {
  it('formatActivityDateInTz 按上海时区格式化', () => {
    expect(
      formatActivityDateInTz('2024-09-15T16:00:00.000Z', 'Asia/Shanghai'),
    ).toBe('2024-09-16');
  });

  it('formatDateTimeInTz 按上海时区格式化为年月日时分秒', () => {
    expect(
      formatDateTimeInTz('2024-09-15T16:00:00.000Z', 'Asia/Shanghai'),
    ).toBe('2024-09-16 00:00:00');
  });

  it('defaultActivityName 拼接运动类型与日期', () => {
    expect(
      defaultActivityName(SPORT_TYPE.run, '2024-09-15T02:00:00.000Z'),
    ).toBe('跑步 2024-09-15');
  });

  it('normalizeActivityName 将颂拓自动名转为东八区默认名', () => {
    expect(
      normalizeActivityName(
        'suuntoapp-Running-2026-07-10T22-49-53Z',
        SPORT_TYPE.run,
        '2026-07-10T22:49:53.000Z',
      ),
    ).toBe('跑步 2026-07-11');
  });

  it('resolveActivityDisplayName 在无名称时回退默认名', () => {
    expect(
      resolveActivityDisplayName(null, SPORT_TYPE.run, '2024-09-15T02:00:00.000Z'),
    ).toBe('跑步 2024-09-15');
  });
});
