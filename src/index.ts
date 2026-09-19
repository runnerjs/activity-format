export type {
  Activity,
  ActivitySummary,
  TrackPoint,
  LapSummary,
  ActivityPreservation,
  ActivityTransformMeta,
  CoordinateDetection,
  ParseOptions,
  WriteOptions,
  WriteJsonOptions,
  BinaryInput,
  SportType,
  TrackSource,
  FileFormat,
  CoordSystem,
  AltitudeRef,
  ParseStatus,
  RegistryPathHit,
  SourceFormatKey,
  LngLat,
  LngLatLike,
} from './types';

export {
  SPORT_TYPE,
  TRACK_SOURCE,
  FILE_FORMAT,
  COORD_SYSTEM,
  ALTITUDE_REF,
} from './constants';
export {
  CURRENT_SCHEMA_VERSION,
  fileFormatToSourceFormat,
} from './field-map/constant';
export { CURRENT_CLEANUP_VERSION } from './utils/track-point';

export { parseFit } from './parsers/fit.parser';
export { parseGpx } from './parsers/gpx.parser';
export { parseTcx, parseTcxActivities } from './parsers/tcx.parser';
export { parseFile, parseFileActivities } from './parsers';

export { writeFit } from './serializers/fit.writer';
export { writeGpx } from './serializers/gpx.writer';
export { writeTcx } from './serializers/tcx.writer';
export { writeJson } from './serializers/json.writer';

export { detectFileFormat } from './parsers/detect-file-format';
export { buildFileName, sanitizeFileBaseName } from './serializers/filename.util';
export {
  gcj02ToWgs84,
  wgs84ToGcj02,
  gcj02ToWgs84Batch,
  wgs84ToGcj02Batch,
  convertActivityCoordinates,
} from './coordinates';
