import { existsSync } from 'fs';
import { resolve } from 'path';

export const fixturesDir = resolve(__dirname, '.');
export const demoDir = resolve(__dirname, '../../demo');
export const demoLocalDir = resolve(__dirname, '../../demo-local');

export function fixturePath(name: string): string {
  return resolve(fixturesDir, name);
}

/** 仓库根目录 demo/ 下的公开样例路径。 */
export function repoDemoPath(name: string): string {
  return resolve(demoDir, name);
}

/** 本地完整样例（含未公开轨迹）；目录不存在于 git。 */
export function repoDemoLocalPath(name: string): string {
  return resolve(demoLocalDir, name);
}

export function existingDemoLocalPath(name: string): string | undefined {
  const path = repoDemoLocalPath(name);
  return existsSync(path) ? path : undefined;
}

/** @deprecated 使用 repoDemoPath */
export function samplePath(name: string): string {
  return repoDemoPath(name);
}

/** @deprecated 使用 repoDemoPath */
export function demoPath(name: string): string {
  return repoDemoPath(name);
}
