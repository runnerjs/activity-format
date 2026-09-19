import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  treeshake: true,
  minify: true,
  platform: 'neutral',
  esbuildOptions(options) {
    options.legalComments = 'none';
  },
  // Keep @garmin/fitsdk external: Garmin's license forbids redistributing the SDK
  // inside this package. Consumers get it from the npm dependency. Load it with
  // import() so the CJS build does not require() the ESM-only SDK.
});
