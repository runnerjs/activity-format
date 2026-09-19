const { buildSync } = require('esbuild');
const { mkdirSync } = require('fs');
const { dirname, join } = require('path');

const outfile = join(__dirname, '..', 'test', 'vendor', 'fitsdk.cjs');
mkdirSync(dirname(outfile), { recursive: true });
buildSync({
  entryPoints: [require.resolve('@garmin/fitsdk')],
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  outfile,
  logLevel: 'silent',
});
