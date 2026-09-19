import { toFitLapTrigger, toTcxTriggerMethod } from './lap-trigger';

describe('toTcxTriggerMethod', () => {
  it('已是 TCX 枚举则原样返回', () => {
    expect(toTcxTriggerMethod('Manual')).toBe('Manual');
    expect(toTcxTriggerMethod('HeartRate')).toBe('HeartRate');
  });

  it('FIT camelCase 按语义对应', () => {
    expect(toTcxTriggerMethod('manual')).toBe('Manual');
    expect(toTcxTriggerMethod('distance')).toBe('Distance');
    expect(toTcxTriggerMethod('positionLap')).toBe('Location');
    expect(toTcxTriggerMethod('sessionEnd')).toBe('Manual');
  });

  it('无法识别时回退 Manual', () => {
    expect(toTcxTriggerMethod(undefined)).toBe('Manual');
    expect(toTcxTriggerMethod('unknown')).toBe('Manual');
  });
});

describe('toFitLapTrigger', () => {
  it('已是 FIT 枚举则原样返回', () => {
    expect(toFitLapTrigger('manual')).toBe('manual');
    expect(toFitLapTrigger('positionStart')).toBe('positionStart');
  });

  it('TCX PascalCase 按语义对应', () => {
    expect(toFitLapTrigger('Manual')).toBe('manual');
    expect(toFitLapTrigger('Distance')).toBe('distance');
    expect(toFitLapTrigger('Location')).toBe('positionLap');
    expect(toFitLapTrigger('HeartRate')).toBe('manual');
  });

  it('无法识别时回退 manual', () => {
    expect(toFitLapTrigger('')).toBe('manual');
    expect(toFitLapTrigger('unknown')).toBe('manual');
  });
});
