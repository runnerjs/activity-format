import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const xsdDir = __dirname;

const XSD_FILES: Record<'gpx' | 'tcx', string> = {
  gpx: 'gpx.xsd',
  tcx: 'TrainingCenterDatabasev2.xsd',
};

export interface XmlValidationResult {
  valid: boolean;
  errors: string[];
}

/** 使用 xmllint + 官方 XSD 校验 XML 字符串 */
export function validateXmlAgainstXsd(
  xml: string,
  schema: 'gpx' | 'tcx',
): XmlValidationResult {
  const dir = mkdtempSync(join(tmpdir(), 'run-nest-xsd-'));
  const xmlPath = join(dir, 'document.xml');
  const xsdPath = resolve(xsdDir, XSD_FILES[schema]);
  try {
    writeFileSync(xmlPath, xml, 'utf8');
    execFileSync('xmllint', ['--noout', '--schema', xsdPath, xmlPath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { valid: true, errors: [] };
  } catch (error) {
    if (isXmllintMissing(error)) {
      throw new Error(
        'xmllint is required for XSD tests. Install libxml2-utils (Debian/Ubuntu) or libxml2 (macOS/Fedora). See CONTRIBUTING.md.',
      );
    }
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr?: string }).stderr ?? '')
        : error instanceof Error
          ? error.message
          : String(error);
    const lines = stderr
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return { valid: false, errors: lines.length > 0 ? lines : ['XSD validation failed'] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function isXmllintMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ENOENT'
  );
}

/** 校验 XML 文件路径 */
export function validateXmlFileAgainstXsd(
  filePath: string,
  schema: 'gpx' | 'tcx',
): XmlValidationResult {
  return validateXmlAgainstXsd(readFileSync(filePath, 'utf8'), schema);
}
