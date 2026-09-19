# @runnerjs/activity-format

[中文](./README.md) | **English**

Parse and write FIT, GPX, and TCX activity files with a unified `Activity` model.

This library does not touch the filesystem. Callers pass `Uint8Array | ArrayBuffer` (Node `Buffer` is also accepted); writers return `string` or `Uint8Array`.

- Node.js ≥ 18
- Dual ESM / CJS builds with TypeScript types
- Track points are normalized to **WGS-84** internally; writers can emit GCJ-02
- Same-format round-trips preserve unmapped fields via `preservation`
- **Running is the only sport type that has been verified.** Other `SPORT_TYPE` values may parse and write, but have not been tested.

## Contents

- [What it does](#what-it-does)
- [Install](#install)
- [Quick start](#quick-start)
- [Concepts](#concepts)
- [API](#api)
  - [Parse](#parse)
  - [Write](#write)
  - [Format detection and file names](#format-detection-and-file-names)
  - [Coordinate conversion](#coordinate-conversion)
  - [Constants](#constants)
  - [Versions and helpers](#versions-and-helpers)
- [Types](#types)
- [Errors](#errors)
- [License](#license)
- [Contributing](#contributing)

## What it does

| Feature | Description |
| --- | --- |
| Format detection | Identifies FIT, GPX, and TCX from the file header: FIT uses the `.FIT` marker, GPX/TCX use the XML start |
| Parse | `parseFile` / `parseFit` / `parseGpx` / `parseTcx` → unified `Activity` |
| Multi-activity TCX | `parseFileActivities` / `parseTcxActivities` return every activity in the file |
| Write | `writeFit` / `writeGpx` / `writeTcx` / `writeJson`, including cross-format conversion |
| Coordinates | GCJ-02 → WGS-84 on parse; optional target system on write |
| China-platform hints | Source and coordinate inference for WeChat, Joyrun, Codoon, Garmin, Suunto |
| Faithful round-trip | Fields that do not fit the unified model are stored in `preservation.remainder` and written back into the file on same-format export |
| File names | `buildFileName` / `sanitizeFileBaseName` for safe export names |

Parsing also drops invalid timestamps, sorts points by time, converts running FIT cadence from rpm to dual-foot spm, and derives summary fields such as duration, distance, and pace when missing.

Testing and verification currently cover **running** only. Other sports have not been covered yet.

## Install

```bash
pnpm add @runnerjs/activity-format
```

```bash
npm install @runnerjs/activity-format
```

FIT parse/write depends on [`@garmin/fitsdk`](https://www.npmjs.com/package/@garmin/fitsdk). It is installed as an npm dependency and is **not** bundled into this package. Using FIT features means you also accept the [Garmin FIT SDK License](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt).

The FIT path requires Node.js `Buffer`. In browsers, provide a Buffer polyfill or stick to GPX / TCX / JSON.

## Quick start

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import {
  parseFile,
  writeGpx,
  writeTcx,
  writeFit,
  writeJson,
  TRACK_SOURCE,
  COORD_SYSTEM,
} from '@runnerjs/activity-format';

const buffer = readFileSync('./activity.fit');
const activity = await parseFile(buffer, { source: TRACK_SOURCE.garmin });

activity.summary.name = 'Morning Run';

writeFileSync('./out.gpx', writeGpx(activity));
writeFileSync('./out.tcx', writeTcx(activity));
writeFileSync('./out.fit', await writeFit(activity));
writeFileSync('./out.json', writeJson(activity));
```

Pin the source coordinate system (highest priority; skips autodetection):

```ts
const activity = await parseFile(buffer, {
  sourceCoordSystem: COORD_SYSTEM.gcj02,
});
```

Write GCJ-02 for China map tiles:

```ts
const gpx = writeGpx(activity, { targetCoordSystem: COORD_SYSTEM.gcj02 });
```

## Concepts

### Unified `Activity` model

Every parser returns and every writer accepts the same shape:

```ts
interface Activity {
  summary: ActivitySummary;       // name, sport, duration, distance, heart rate, …
  points: TrackPoint[];           // time-ordered samples (lon/lat are WGS-84)
  laps: LapSummary[];             // lap / split summaries
  preservation?: ActivityPreservation; // leftover source fields for round-trip
  fileFormat: FileFormat;         // source format: fit / gpx / tcx
  sourceCoordSystem: CoordSystem; // coordinate system of the original file
  coordinateDetection: CoordinateDetection; // how that system was decided
  altitudeRef: AltitudeRef;       // altitude datum
}
```

Indoor or GPS-less points may omit `lon` / `lat`. Heart rate, cadence, and other series are still kept.

### Coordinates

Internal `points` are **always WGS-84**. `sourceCoordSystem` records what the original file used so writers can convert back.

Detection order:

1. `ParseOptions.sourceCoordSystem` (`explicit`, confidence `certain`)
2. File metadata such as GPX `creator`, Codoon naming, TCX notes (`metadata`, `high`)
3. Inference from `TrackSource` + format + whether a recording device is present (`source`)
4. GPX/TCX with no metadata default to WGS-84 (`default`, `low`)

Typical source rules:

| Source | Typical original system |
| --- | --- |
| Garmin / Suunto FIT | WGS-84 |
| WeChat, Joyrun | GCJ-02 |
| Codoon local GPX (no watch) | GCJ-02 |
| Codoon synced FIT/TCX (has device) | WGS-84 |

On write:

- `targetCoordSystem` set → use it
- Same-format write → keep `activity.sourceCoordSystem`
- Cross-format → default WGS-84

Coordinates outside China are not GCJ-02-shifted.

### Faithful write-back (`preservation`)

Fields that fit the unified model land in `summary` / `points` / `laps`. Other source-file fields are stored in `preservation.remainder`. On **same-format** write, mapped fields are converted back from the current `Activity`, and remainder fields are written into the same file so extra source data is not dropped.

`WriteOptions.preservation`:

| Value | Behavior |
| --- | --- |
| `auto` (default) | Mapped fields come from Activity; remainder is written into the same file |
| `activity` | Same as `auto` |
| `none` | Ignore preservation; write core fields only |

If faithful GPX / TCX export fails, writers fall back to a hand-written core XML (name, track points, HR, cadence) and do **not** throw.

`writeJson` omits `preservation` by default (it can be large). Pass `includePreservation: true` to keep it.

### Runtime

The library never reads or writes files. Typical usage is `readFileSync` / an upload, then pass the bytes to a parser.

## API

All of the following are exported from the package root `@runnerjs/activity-format`.

### Parse

#### `parseFile(input, options?): Promise<Activity>`

Detects the format and parses. If a TCX file contains multiple activities, only the **first** is returned.

| Param | Type | Description |
| --- | --- | --- |
| `input` | `BinaryInput` | File bytes: `Uint8Array \| ArrayBuffer` (Node `Buffer` is also accepted) |
| `options` | `ParseOptions` | Optional. `source` platform; `sourceCoordSystem` to skip detection |

**Returns:** `Promise<Activity>` with WGS-84 points and `preservation`.

**Throws:** unrecognized format, no valid track points, FIT decoder errors, non-activity FIT files (e.g. monitoring).

#### `parseFileActivities(input, options?): Promise<Activity[]>`

Same as `parseFile`, but returns every activity. FIT / GPX usually have one; TCX may have several.

| Param | Type | Description |
| --- | --- | --- |
| `input` | `BinaryInput` | File bytes |
| `options` | `ParseOptions` | Optional, same as above |

**Returns:** `Promise<Activity[]>`.

#### `parseFit(input, options?): Promise<Activity>`

Parse a FIT binary. Requires `@garmin/fitsdk`.

| Param | Type | Description |
| --- | --- | --- |
| `input` | `BinaryInput` | `.fit` contents |
| `options` | `ParseOptions` | Optional |

**Returns:** `Promise<Activity>`.

**Throws:** decoder errors, no valid track points, or `fileId.type` values such as monitoring / settings / workout.

#### `parseGpx(input, options?): Promise<Activity>`

Parse GPX. Tolerates unescaped `&` in third-party exports (some Codoon files).

| Param | Type | Description |
| --- | --- | --- |
| `input` | `BinaryInput` | `.gpx` contents |
| `options` | `ParseOptions` | Optional |

**Returns:** `Promise<Activity>`.

**Throws:** missing `<trk>`, or no valid track points.

#### `parseTcx(input, options?): Promise<Activity>`

Parse the **first** Activity in a TCX file.

| Param | Type | Description |
| --- | --- | --- |
| `input` | `BinaryInput` | `.tcx` contents |
| `options` | `ParseOptions` | Optional |

**Returns:** `Promise<Activity>`.

#### `parseTcxActivities(input, options?): Promise<Activity[]>`

Parse every Activity in a TCX file. Multi-activity files are split; `preservation.transformations.sourceActivityIndex` is the index in the original file.

| Param | Type | Description |
| --- | --- | --- |
| `input` | `BinaryInput` | `.tcx` contents |
| `options` | `ParseOptions` | Optional |

**Returns:** `Promise<Activity[]>`.

**Throws:** no Activity, or an activity with no valid track points.

`ParseOptions`:

```ts
interface ParseOptions {
  source?: TrackSource;             // platform; used for coordinate / vendor inference
  sourceCoordSystem?: CoordSystem;  // skip detection when the caller already knows
}
```

### Write

#### `writeGpx(activity, options?): string`

Serialize to GPX 1.1 XML. Prefers a faithful merge; falls back to core fields on failure.

| Param | Type | Description |
| --- | --- | --- |
| `activity` | `Activity` | Activity to export |
| `options` | `WriteOptions` | Optional. Target coordinates, preservation mode |

**Returns:** GPX XML string.

#### `writeTcx(activity, options?): string`

Serialize to TCX XML. Prefers a faithful merge; falls back to core fields on failure.

| Param | Type | Description |
| --- | --- | --- |
| `activity` | `Activity` | Activity to export |
| `options` | `WriteOptions` | Optional |

**Returns:** TCX XML string.

#### `writeFit(activity, options?): Promise<Uint8Array>`

Serialize to FIT binary. Requires `@garmin/fitsdk`; the FIT path still uses Node `Buffer` at runtime.

| Param | Type | Description |
| --- | --- | --- |
| `activity` | `Activity` | Activity to export |
| `options` | `WriteOptions` | Optional |

**Returns:** `Promise<Uint8Array>`, suitable for `writeFileSync`.

#### `writeJson(activity, options?): string`

Serialize to JSON. Omits `preservation` unless requested.

| Param | Type | Description |
| --- | --- | --- |
| `activity` | `Activity` | Activity to export |
| `options` | `WriteJsonOptions` | Optional |

**Returns:** JSON string.

`WriteOptions` / `WriteJsonOptions`:

```ts
interface WriteOptions {
  targetCoordSystem?: CoordSystem;           // coordinate system of the output file
  preservation?: 'auto' | 'activity' | 'none'; // default 'auto'
}

interface WriteJsonOptions extends WriteOptions {
  indent?: number;                 // JSON indent, default 2
  keepUndefined?: boolean;         // write undefined as null, default false
  includePreservation?: boolean;   // include preservation, default false
}
```

### Format detection and file names

#### `detectFileFormat(input): FileFormat`

Detects format from the start of the file. A FIT file has the four characters `.FIT` at indices 8–11; GPX / TCX are recognized if the first few KB of text contain `<gpx` or `TrainingCenterDatabase`.

| Param | Type | Description |
| --- | --- | --- |
| `input` | `BinaryInput` | File bytes |

**Returns:** `fit` / `tcx` / `gpx`.

**Throws:** `Unrecognized file format; only FIT, GPX, and TCX are supported`. Does not return `other`.

#### `sanitizeFileBaseName(name): string`

Strips characters illegal on Windows / macOS, collapses whitespace, max 80 characters. Empty result becomes `活动`.

| Param | Type | Description |
| --- | --- | --- |
| `name` | `string` | Raw activity name |

**Returns:** a safe file-name fragment.

#### `buildFileName(activityName, startTimeIso, ext, usedNames): string`

Builds `name_YYYYMMDD_HHmmss.ext` in UTC. `usedNames` de-duplicates within a batch (`_2`, `_3`, …) and is mutated.

| Param | Type | Description |
| --- | --- | --- |
| `activityName` | `string` | Activity name |
| `startTimeIso` | `string` | Start time, ISO 8601 |
| `ext` | `string` | Extension without a dot, e.g. `gpx` |
| `usedNames` | `Set<string>` | Names already used; updated in place |

**Returns:** a unique file name, e.g. `Morning Run_20260710_224953.gpx`.

```ts
const used = new Set<string>();
const name = buildFileName(activity.summary.name ?? 'Activity', activity.summary.startTime, 'gpx', used);
```

### Coordinate conversion

Point helpers do not mutate their input. Coordinates outside China are returned unchanged. `gcj02ToWgs84` uses one iteration (about 1–2 m error).

#### `gcj02ToWgs84(lon, lat): LngLat`

| Param | Type | Description |
| --- | --- | --- |
| `lon` | `number` | Longitude (GCJ-02) |
| `lat` | `number` | Latitude (GCJ-02) |

**Returns:** `{ lon, lat }` in WGS-84.

#### `wgs84ToGcj02(lon, lat): LngLat`

| Param | Type | Description |
| --- | --- | --- |
| `lon` | `number` | Longitude (WGS-84) |
| `lat` | `number` | Latitude (WGS-84) |

**Returns:** `{ lon, lat }` in GCJ-02.

#### `gcj02ToWgs84Batch<T>(points): T[]`

#### `wgs84ToGcj02Batch<T>(points): T[]`

Batch conversion. Fields other than `lon` / `lat` are kept. Points without coordinates are copied as-is.

| Param | Type | Description |
| --- | --- | --- |
| `points` | `readonly T[]` | `T extends { lon?: number; lat?: number }` |

**Returns:** a new array.

#### `convertActivityCoordinates(activity, target): Activity`

Converts all `points` lon/lat. Only `points` change; `summary` / `laps` / `preservation` are shallow-copied onto a new object. After parse, points are already WGS-84 — convert to GCJ-02 when you need China map coordinates.

| Param | Type | Description |
| --- | --- | --- |
| `activity` | `Activity` | Activity to convert (not mutated) |
| `target` | `CoordSystem` | `COORD_SYSTEM.wgs84` or `COORD_SYSTEM.gcj02` |

**Returns:** an `Activity` with a new `points` array.

For export, prefer `targetCoordSystem` on `writeGpx` / `writeTcx` / `writeFit` instead of converting first.

### Constants

Numeric enums. Compare and serialize with the constants, not raw numbers.

#### `SPORT_TYPE`

| Key | Value | Meaning |
| --- | --- | --- |
| `run` | `1` | Running |
| `bike` | `2` | Cycling |
| `swim` | `3` | Swimming |
| `hike` | `4` | Hiking |
| `trailRun` | `5` | Trail running |
| `droneFlight` | `6` | Drone flight |
| `paragliding` | `7` | Paragliding |
| `skiing` | `8` | Skiing |

Unrecognized sports default to `run` on parse.

**Only running has been verified.** Other types in this table (cycling, swimming, hiking, etc.) may appear in parse results but have not been tested — do not treat them as supported yet.

#### `TRACK_SOURCE`

| Key | Value | Meaning |
| --- | --- | --- |
| `auto` | `0` | Default: no specific platform; the parser infers the source from file contents |
| `wechat` | `1` | WeChat |
| `joyrun` | `2` | Joyrun |
| `garmin` | `3` | Garmin |
| `suunto` | `4` | Suunto |
| `manual` | `5` | Manual entry or unknown |
| `codoon` | `6` | Codoon |

If `source` is omitted, the library infers it from file contents.

#### `FILE_FORMAT`

| Key | Value | Meaning |
| --- | --- | --- |
| `fit` | `1` | Garmin FIT |
| `tcx` | `2` | Training Center XML |
| `gpx` | `3` | GPS Exchange Format |
| `other` | `4` | Unrecognized (`detectFileFormat` throws instead of returning this) |

#### `COORD_SYSTEM`

| Key | Value | Meaning |
| --- | --- | --- |
| `wgs84` | `1` | WGS-84 |
| `gcj02` | `2` | GCJ-02 |

#### `ALTITUDE_REF`

| Key | Value | Meaning |
| --- | --- | --- |
| `ellipsoid` | `1` | Ellipsoid height |
| `msl` | `2` | Mean sea level (parse default) |
| `agl` | `3` | Above ground level |

### Versions and helpers

#### `CURRENT_SCHEMA_VERSION: number`

Field-mapping / remainder-strip rule version, stored as `preservation.mappingVersion`. Currently `1`.

#### `CURRENT_CLEANUP_VERSION: number`

Track-point cleanup rule version, stored as `preservation.cleanupVersion`. Currently `1`. Must stay aligned with remainder point-array indices.

#### `fileFormatToSourceFormat(format): SourceFormatKey`

Converts a format enum value to the string `'fit' | 'tcx' | 'gpx'`. Throws if the value is `other`.

| Param | Type | Description |
| --- | --- | --- |
| `format` | `FileFormat` | `fit` / `tcx` / `gpx` |

**Returns:** `'fit' | 'tcx' | 'gpx'`.

## Types

### `ActivitySummary`

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string?` | Activity name |
| `sportType` | `SportType` | Sport |
| `source` | `TrackSource` | Source platform |
| `startTime` | `string` | Start time, ISO 8601 UTC |
| `endTime` | `string?` | End time, ISO 8601 UTC |
| `durationSec` | `number?` | Timer duration in seconds (pauses excluded). FIT `totalTimerTime` |
| `activeDurationSec` | `number?` | Elapsed time including pauses. FIT `totalElapsedTime`; same as `durationSec` when TCX/GPX cannot distinguish |
| `distance2dM` | `number?` | 2D distance in meters |
| `avgPaceSecPerKm` | `number?` | Average pace (sec/km), derived from speed or duration/distance |
| `avgSpeedMps` / `maxSpeedMps` | `number?` | Average / max speed (m/s) |
| `avgHeartRate` / `maxHeartRate` | `number?` | Average / max heart rate |
| `avgCadence` | `number?` | spm for running, rpm for cycling |
| `totalAscentM` / `totalDescentM` | `number?` | Ascent / descent (m) |
| `maxAltitudeM` / `minAltitudeM` | `number?` | Max / min altitude (m) |
| `calories` | `number?` | Kilocalories |
| `creator` | `string?` | Writing software (GPX `creator`), not the device |
| `deviceManufacturer` | `string?` | e.g. `garmin` / `suunto` |
| `deviceModel` | `string?` | e.g. `Forerunner 235 (Asia)` |

### `TrackPoint`

| Field | Type | Description |
| --- | --- | --- |
| `t` | `string` | Sample time, ISO 8601 UTC; empty string if missing |
| `lon` / `lat` | `number?` | Degrees, WGS-84; omitted without GPS |
| `ele` | `number?` | Elevation (m); datum is `Activity.altitudeRef` |
| `hr` | `number?` | Heart rate |
| `cad` | `number?` | Cadence (spm or rpm) |
| `spd` | `number?` | Instant speed (m/s) |
| `dist` | `number?` | Cumulative distance from start (m) |

### `LapSummary`

| Field | Type | Description |
| --- | --- | --- |
| `index` | `number` | Lap index, 0-based |
| `startTime` | `string` | Lap start time |
| `durationSec` | `number` | Lap duration (s) |
| `distanceM` | `number` | Lap distance (m) |
| `avgHr` / `maxHr` | `number?` | Heart rate |
| `avgCadence` / `maxCadence` | `number?` | Cadence |
| `avgSpeed` / `maxSpeed` | `number?` | Speed (m/s) |
| `calories` | `number?` | Kilocalories |
| `avgAltitudeM` / `maxAltitudeM` / `minAltitudeM` | `number?` | Altitude |
| `totalAscentM` / `totalDescentM` | `number?` | Ascent / descent |
| `trigger` | `string?` | Lap trigger. FIT: `manual` / `time` / `distance` / `sessionEnd`, etc. TCX: `Manual` / `Distance` / `Location` / `Time` / `HeartRate` |
| `pointRange` | `[number, number]?` | Inclusive index range into `points` |

### `ActivityPreservation`

| Field | Type | Description |
| --- | --- | --- |
| `remainder` | `Record<string, unknown>` | Unmapped source tree |
| `mappingVersion` | `number` | Mapping rule version |
| `cleanupVersion` | `number` | Point-cleanup rule version |
| `transformations` | `ActivityTransformMeta` | Unit conversion and derived-field notes |
| `originalPointCount` | `number` | Point count at parse time; guards remainder alignment |

`ActivityTransformMeta` includes `cadenceScaled`, `derivedFields`, and optional `sourceActivityIndex` / `pathHits`.

### `CoordinateDetection`

| Field | Type | Description |
| --- | --- | --- |
| `method` | `'explicit' \| 'metadata' \| 'source' \| 'default'` | How the system was chosen |
| `confidence` | `'certain' \| 'high' \| 'low'` | Confidence |

### Other types

```ts
type BinaryInput = Uint8Array | ArrayBuffer;
type SourceFormatKey = 'fit' | 'tcx' | 'gpx';

interface LngLat { lon: number; lat: number; }
type LngLatLike = { lon?: number; lat?: number };

interface RegistryPathHit {
  index: number;       // which TCX candidate path matched
  wildcards?: string[]; // keys matched by `*:localName`
}
```

`SportType` / `TrackSource` / `FileFormat` / `CoordSystem` / `AltitudeRef` / `ParseStatus` are unions of the corresponding constant values.

## Errors

| Situation | Behavior |
| --- | --- |
| Not FIT / GPX / TCX | `detectFileFormat` / `parseFile` throw |
| GPX missing `<trk>` or valid points | Throws |
| TCX missing Activity or valid points | Throws |
| FIT decoder errors | Throws |
| FIT monitoring / settings / etc. | Throws with the file type |
| Faithful GPX/TCX write fails | **Does not throw**; falls back to core XML |
| `preservation` point count mismatches `points` | Throws unless `preservation` is `none` |

Error messages are in English.

## License

This library is [Apache-2.0](./LICENSE). See [NOTICE](./NOTICE) for third-party attributions.

FIT parse/write depends on [`@garmin/fitsdk`](https://www.npmjs.com/package/@garmin/fitsdk), which is **not** bundled here and is installed as a dependency. Using FIT features means you also accept the [Garmin FIT SDK License](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Report security issues privately as described in [SECURITY.md](./SECURITY.md).
