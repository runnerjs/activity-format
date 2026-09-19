import { readFileSync } from 'fs';
import { COORD_SYSTEM, FILE_FORMAT, TRACK_SOURCE } from '../constants';
import {
  detectFileSource,
  resolveSourceCoordSystem,
} from './detect-file-source.util';
import { repoDemoPath } from '../../test/fixtures/paths';

describe('detectFileSource', () => {
  it('应识别咕咚本地 GPX 为 GCJ-02', async () => {
    const buffer = readFileSync(repoDemoPath('codoon/local-run.gpx'));
    const result = await detectFileSource(buffer, FILE_FORMAT.gpx);
    expect(result.source).toBe(TRACK_SOURCE.codoon);
    expect(result.sourceCoordSystem).toBe(COORD_SYSTEM.gcj02);
    expect(result.hasRecordingDevice).toBe(false);
  });

  it('应识别颂拓 GPX', async () => {
    const buffer = readFileSync(repoDemoPath('suunto/watch-run.gpx'));
    const result = await detectFileSource(buffer, FILE_FORMAT.gpx);
    expect(result.source).toBe(TRACK_SOURCE.suunto);
    expect(result.sourceCoordSystem).toBe(COORD_SYSTEM.wgs84);
  });

  it('应识别 Joyrun TCX', async () => {
    const buffer = readFileSync(repoDemoPath('joyrun/phone-run.tcx'));
    const result = await detectFileSource(buffer, FILE_FORMAT.tcx);
    expect(result.source).toBe(TRACK_SOURCE.joyrun);
    expect(result.sourceCoordSystem).toBe(COORD_SYSTEM.gcj02);
  });

  describe('FIT', () => {
    it('应识别含颂拓设备的 FIT 为 WGS-84', async () => {
      const result = await detectFileSource(
        readFileSync(repoDemoPath('suunto/watch-run.fit')),
        FILE_FORMAT.fit,
      );
      expect(result.source).toBe(TRACK_SOURCE.suunto);
      expect(result.hasRecordingDevice).toBe(true);
      expect(result.sourceCoordSystem).toBe(COORD_SYSTEM.wgs84);
    });

    it('应识别无设备信息的空 FIT 为 Joyrun', async () => {
      const result = await detectFileSource(Buffer.alloc(0), FILE_FORMAT.fit);
      expect(result.source).toBe(TRACK_SOURCE.joyrun);
      expect(result.hasRecordingDevice).toBe(false);
    });
  });
});

describe('resolveSourceCoordSystem', () => {
  it('手动选择咕咚 + FIT（有设备）应为 WGS-84', () => {
    expect(
      resolveSourceCoordSystem(TRACK_SOURCE.codoon, FILE_FORMAT.fit, true),
    ).toBe(COORD_SYSTEM.wgs84);
  });

  it('手动选择咕咚 + GPX（无设备）应为 GCJ-02', () => {
    expect(
      resolveSourceCoordSystem(TRACK_SOURCE.codoon, FILE_FORMAT.gpx, false),
    ).toBe(COORD_SYSTEM.gcj02);
  });
});
