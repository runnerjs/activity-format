import { readFileSync } from 'fs';
import { FILE_FORMAT } from '../constants';
import { detectFileFormat } from './detect-file-format';
import { fixturePath } from '../../test/fixtures/paths';

describe('detectFileFormat', () => {
  it('识别 FIT 魔数', () => {
    expect(detectFileFormat(readFileSync(fixturePath('sample.fit')))).toBe(
      FILE_FORMAT.fit,
    );
  });

  it('识别 GPX 头', () => {
    expect(detectFileFormat(readFileSync(fixturePath('sample.gpx')))).toBe(
      FILE_FORMAT.gpx,
    );
  });

  it('识别 TCX 头', () => {
    expect(detectFileFormat(readFileSync(fixturePath('sample.tcx')))).toBe(
      FILE_FORMAT.tcx,
    );
  });
});
