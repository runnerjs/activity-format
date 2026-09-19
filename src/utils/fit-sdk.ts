export type { Encoder, FitMessages } from '@garmin/fitsdk';

type FitSdk = typeof import('@garmin/fitsdk');

let fitSdkPromise: Promise<FitSdk> | undefined;

/** 动态加载 @garmin/fitsdk，避免 CJS 入口同步 require ESM。 */
export function loadFitSdk(): Promise<FitSdk> {
  fitSdkPromise ??= import('@garmin/fitsdk');
  return fitSdkPromise;
}
