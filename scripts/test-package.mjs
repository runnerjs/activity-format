// Exercise exactly the tarball consumers install, outside this repository.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'activity-format-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, cwd = temp) => execFileSync(command, args, { cwd, stdio: 'inherit' });
try {
  run(npm, ['pack', '--pack-destination', temp], root);
  const archives = readdirSync(temp).filter((name) => name.endsWith('.tgz'));
  if (archives.length !== 1) throw new Error('Expected exactly one npm tarball');
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ name: 'activity-format-consumer', private: true }));
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, archives[0])]);
  const smoke = `
const assert = require('node:assert/strict');
(async () => {
  const bytes = new TextEncoder().encode('<gpx version="1.1" creator="synthetic"><trk><trkseg><trkpt lat="25" lon="110"><time>2020-02-01T00:00:00Z</time></trkpt><trkpt lat="25.000135" lon="110"><time>2020-02-01T00:00:05Z</time></trkpt></trkseg></trk></gpx>');
  for (const [mode, lib] of [['CJS', require('@runnerjs/activity-format')], ['ESM', await import('@runnerjs/activity-format')]]) {
    const activity = await lib.parseFile(bytes);
    assert.equal(activity.points.length, 2);
    for (const [format, output] of [['FIT', await lib.writeFit(activity)], ['GPX', lib.writeGpx(activity)], ['TCX', lib.writeTcx(activity)]]) {
      const restored = await lib.parseFile(typeof output === 'string' ? new TextEncoder().encode(output) : output);
      assert.equal(restored.points.length, 2, mode + ' ' + format);
      assert.equal(Date.parse(restored.summary.startTime), Date.parse(activity.summary.startTime));
    }
    assert.equal(JSON.parse(lib.writeJson(activity)).points.length, 2);
    console.log(process.version, mode, 'package parse/write OK');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
`;
  writeFileSync(join(temp, 'smoke.cjs'), smoke);
  run(process.execPath, ['smoke.cjs']);
  const typeCheck = `import { parseFile, writeFit, type BinaryInput } from '@runnerjs/activity-format';
const input: BinaryInput = new Uint8Array();
const output: Promise<Uint8Array> = parseFile(input).then(activity => writeFit(activity));
void output;
`;
  for (const ext of ['mts', 'cts']) writeFileSync(join(temp, `consumer.${ext}`), typeCheck);
  writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ['consumer.mts', 'consumer.cts'] }));
  run(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')]);
  console.log('ESM/CJS consumer types pass without @types/node.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
