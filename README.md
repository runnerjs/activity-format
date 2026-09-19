# @runnerjs/activity-format

**中文** | [English](./README.en.md)

解析、写出 FIT / GPX / TCX 运动文件，统一为 `Activity` 模型。

本库不读写文件系统：调用方传入 `Uint8Array | ArrayBuffer`（Node `Buffer` 也可），写出结果为 `string` 或 `Uint8Array`。

- Node.js ≥ 18
- ESM / CJS 双构建，自带 TypeScript 类型
- 内部轨迹点统一为 **WGS-84**；写回时可还原 GCJ-02
- 同格式写回尽量保真（未映射字段进入 `preservation`）
- **当前仅针对跑步验证**；骑行、游泳等其它 `SPORT_TYPE` 已能解析写出，但尚未专门测试

## 目录

- [功能概览](#功能概览)
- [安装](#安装)
- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [API](#api)
  - [解析](#解析)
  - [写出](#写出)
  - [格式探测与文件名](#格式探测与文件名)
  - [坐标转换](#坐标转换)
  - [常量](#常量)
  - [版本号与工具函数](#版本号与工具函数)
- [类型参考](#类型参考)
- [常见错误](#常见错误)
- [许可证](#许可证)
- [贡献](#贡献)

## 功能概览

| 能力 | 说明 |
| --- | --- |
| 自动识别格式 | 按文件头识别：FIT 看固定位置的 `.FIT` 标记，GPX/TCX 看 XML 开头 |
| 解析 | `parseFile` / `parseFit` / `parseGpx` / `parseTcx`，得到统一 `Activity` |
| 多活动 TCX | `parseFileActivities` / `parseTcxActivities` 拆出文件内全部活动 |
| 写出 | `writeFit` / `writeGpx` / `writeTcx` / `writeJson`，可跨格式转换 |
| 坐标系 | 解析时 GCJ-02 → WGS-84；写出时可指定目标坐标系 |
| 国内平台特征 | 微信运动、悦跑圈、咕咚、佳明、颂拓的来源与坐标推断 |
| 保真写回 | 进不了统一模型的原格式字段先存到 `preservation.remainder`，再按原格式写出时一并写回文件 |
| 文件名 | `buildFileName` / `sanitizeFileBaseName` 生成安全导出名 |

解析时还会：清洗无效时间戳、按时间排序轨迹点、跑步 cadence 在 FIT 上从 rpm 换算为双足步频 spm、按公式补全时长 / 距离 / 配速等摘要字段。

当前测试与验证以**跑步**为主，其它运动类型尚未覆盖。

## 安装

```bash
pnpm add @runnerjs/activity-format
```

```bash
npm install @runnerjs/activity-format
```

FIT 解析/写出依赖 [`@garmin/fitsdk`](https://www.npmjs.com/package/@garmin/fitsdk)，会作为本包的 npm 依赖安装，**不会**打进本库产物。使用 FIT 即表示同时接受 [Garmin FIT SDK License](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt)。

FIT 路径需要 Node.js `Buffer`。浏览器环境请自行提供 Buffer polyfill，或只使用 GPX / TCX / JSON。

## 快速开始

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

activity.summary.name = '晨跑';

writeFileSync('./out.gpx', writeGpx(activity));
writeFileSync('./out.tcx', writeTcx(activity));
writeFileSync('./out.fit', await writeFit(activity));
writeFileSync('./out.json', writeJson(activity));
```

显式指定原始坐标系（优先级最高，跳过自动探测）：

```ts
const activity = await parseFile(buffer, {
  sourceCoordSystem: COORD_SYSTEM.gcj02,
});
```

跨格式写出到国内地图常用的 GCJ-02：

```ts
const gpx = writeGpx(activity, { targetCoordSystem: COORD_SYSTEM.gcj02 });
```

## 核心概念

### 统一模型 `Activity`

所有 parser 输出、所有 writer 接受同一套结构：

```ts
interface Activity {
  summary: ActivitySummary;       // 名称、运动类型、时长、距离、心率等
  points: TrackPoint[];           // 按时间排序的轨迹点（内部 lon/lat 为 WGS-84）
  laps: LapSummary[];             // 圈 / 段汇总
  preservation?: ActivityPreservation; // 原格式残余，供同格式写回
  fileFormat: FileFormat;         // 来源格式：fit / gpx / tcx
  sourceCoordSystem: CoordSystem; // 源文件坐标系
  coordinateDetection: CoordinateDetection; // 坐标系是怎么判定的
  altitudeRef: AltitudeRef;       // 海拔基准
}
```

室内或无 GPS 的点可以没有 `lon` / `lat`，心率、步频等时序字段仍会保留。

### 坐标系

内部 `points` **始终是 WGS-84**。`sourceCoordSystem` 记录源文件原来的坐标系，写回时可按它还原。

判定优先级：

1. `ParseOptions.sourceCoordSystem`（`explicit`，置信度 `certain`）
2. 文件内容特征，如 GPX `creator`、咕咚命名、TCX notes（`metadata`，`high`）
3. 按 `TrackSource` + 格式 + 是否含记录设备推断（`source`）
4. 无元数据的 GPX/TCX 默认 WGS-84（`default`，`low`）

按来源的大致规则：

| 来源 | 典型原始坐标系 |
| --- | --- |
| 佳明 / 颂拓 FIT | WGS-84 |
| 微信运动、悦跑圈 | GCJ-02 |
| 咕咚本地 GPX（无手表） | GCJ-02 |
| 咕咚经平台同步的 FIT/TCX（有设备） | WGS-84 |

写出时：

- 传了 `targetCoordSystem` → 用指定值
- 同格式写回 → 沿用 `activity.sourceCoordSystem`
- 跨格式 → 默认 WGS-84

境外坐标不做 GCJ-02 偏移，原样返回。

### 保真写回 `preservation`

解析时，能放进 `Activity` 的字段进入 `summary` / `points` / `laps`；源文件里对不上的其它字段先存到 `preservation.remainder`。再按**原格式**写出时：已映射字段以当前 `Activity` 为准转换回去，`remainder` 里的字段也会写进同一份文件，避免丢掉源文件里的额外信息。

`WriteOptions.preservation`：

| 值 | 行为 |
| --- | --- |
| `auto`（默认） | 已映射字段以 Activity 为准；`remainder` 一并写回文件 |
| `activity` | 与 `auto` 相同 |
| `none` | 忽略 preservation，只写核心字段 |

GPX / TCX 保真写出失败时会回退到手写核心字段（名称、轨迹点、心率、步频等），不抛错。

`writeJson` 默认**不**输出 `preservation`（体积可能很大），需要时设 `includePreservation: true`。

### 运行环境

本库不读文件、不写文件。典型用法是调用方 `readFileSync` / 上传得到二进制，再交给 parser。

## API

下列均为包根入口 `@runnerjs/activity-format` 的导出。

### 解析

#### `parseFile(input, options?): Promise<Activity>`

自动识别格式并解析。TCX 含多场活动时只返回**第一条**。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `input` | `BinaryInput` | 文件内容：`Uint8Array \| ArrayBuffer`（Node `Buffer` 也可） |
| `options` | `ParseOptions` | 可选。`source` 来源平台；`sourceCoordSystem` 显式坐标系 |

**返回：** `Promise<Activity>`，内部坐标已转为 WGS-84，并带 `preservation`。

**抛错：** 无法识别格式、无有效轨迹点、FIT Decoder 报错、非活动类 FIT（如 monitoring）等。

#### `parseFileActivities(input, options?): Promise<Activity[]>`

与 `parseFile` 相同，但返回全部活动。FIT / GPX 通常只有一条；TCX 可能有多条。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `input` | `BinaryInput` | 文件内容 |
| `options` | `ParseOptions` | 可选，同上 |

**返回：** `Promise<Activity[]>`。

#### `parseFit(input, options?): Promise<Activity>`

解析 FIT 二进制。依赖 `@garmin/fitsdk`。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `input` | `BinaryInput` | `.fit` 文件内容 |
| `options` | `ParseOptions` | 可选 |

**返回：** `Promise<Activity>`。

**抛错：** Decoder 有错误、没有有效轨迹点、`fileId.type` 为 monitoring / settings / workout 等非活动文件。

#### `parseGpx(input, options?): Promise<Activity>`

解析 GPX。容错第三方导出里未转义的裸 `&`（如部分咕咚文件）。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `input` | `BinaryInput` | `.gpx` 文件内容 |
| `options` | `ParseOptions` | 可选 |

**返回：** `Promise<Activity>`。

**抛错：** 没有 `<trk>`，或没有有效轨迹点。

#### `parseTcx(input, options?): Promise<Activity>`

解析 TCX 中的**第一条** Activity。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `input` | `BinaryInput` | `.tcx` 文件内容 |
| `options` | `ParseOptions` | 可选 |

**返回：** `Promise<Activity>`。

#### `parseTcxActivities(input, options?): Promise<Activity[]>`

解析 TCX 中的全部 Activity。多活动文件会按条拆分，`preservation.transformations.sourceActivityIndex` 记录该场在原文件中的下标。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `input` | `BinaryInput` | `.tcx` 文件内容 |
| `options` | `ParseOptions` | 可选 |

**返回：** `Promise<Activity[]>`。

**抛错：** 没有 Activity，或某一条没有有效轨迹点。

`ParseOptions`：

```ts
interface ParseOptions {
  source?: TrackSource;             // 数据来源，用于坐标系与厂商推断
  sourceCoordSystem?: CoordSystem;  // 已知原始坐标系时传入，跳过探测
}
```

### 写出

#### `writeGpx(activity, options?): string`

序列化为 GPX 1.1 XML 字符串。优先保真还原；失败时回退核心字段。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `activity` | `Activity` | 待导出活动 |
| `options` | `WriteOptions` | 可选。目标坐标系、保真策略 |

**返回：** GPX XML 字符串。

#### `writeTcx(activity, options?): string`

序列化为 TCX XML 字符串。优先保真还原；失败时回退核心字段。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `activity` | `Activity` | 待导出活动 |
| `options` | `WriteOptions` | 可选 |

**返回：** TCX XML 字符串。

#### `writeFit(activity, options?): Promise<Uint8Array>`

序列化为 FIT 二进制。依赖 `@garmin/fitsdk`；运行时仍使用 Node `Buffer`。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `activity` | `Activity` | 待导出活动 |
| `options` | `WriteOptions` | 可选 |

**返回：** `Promise<Uint8Array>`，可直接 `writeFileSync`。

#### `writeJson(activity, options?): string`

序列化为 JSON 字符串。默认不含 `preservation`。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `activity` | `Activity` | 待导出活动 |
| `options` | `WriteJsonOptions` | 可选 |

**返回：** JSON 字符串。

`WriteOptions` / `WriteJsonOptions`：

```ts
interface WriteOptions {
  targetCoordSystem?: CoordSystem;           // 目标文件坐标系
  preservation?: 'auto' | 'activity' | 'none'; // 默认 'auto'
}

interface WriteJsonOptions extends WriteOptions {
  indent?: number;                 // JSON 缩进，默认 2
  keepUndefined?: boolean;         // 把 undefined 写成 null，默认 false
  includePreservation?: boolean;   // 是否输出 preservation，默认 false
}
```

### 格式探测与文件名

#### `detectFileFormat(input): FileFormat`

根据文件开头识别格式。FIT 文件下标 8～11 的字节固定是 `.FIT` 四个字符；GPX / TCX 看开头几 KB 的文本里是否包含 `<gpx` 或 `TrainingCenterDatabase`。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `input` | `BinaryInput` | 文件内容 |

**返回：** `fit` / `tcx` / `gpx`。

**Throws:** `Unrecognized file format; only FIT, GPX, and TCX are supported`. Does not return `other`.

#### `sanitizeFileBaseName(name): string`

去掉 Windows / macOS 非法文件名字符，空白折叠，最长 80 字。空结果返回 `活动`。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 原始活动名 |

**返回：** 安全文件名片段。

#### `buildFileName(activityName, startTimeIso, ext, usedNames): string`

生成 `活动名_YYYYMMDD_HHmmss.ext`。时间按 UTC。`usedNames` 用于同批次去重，重名时追加 `_2`、`_3`…，并写回该 Set。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `activityName` | `string` | 活动名称 |
| `startTimeIso` | `string` | 开始时间，ISO 8601 |
| `ext` | `string` | 扩展名，不含点，如 `gpx` |
| `usedNames` | `Set<string>` | 已占用文件名，会被就地更新 |

**返回：** 唯一文件名，如 `晨跑_20260710_224953.gpx`。

```ts
const used = new Set<string>();
const name = buildFileName(activity.summary.name ?? '活动', activity.summary.startTime, 'gpx', used);
```

### 坐标转换

点级函数不修改入参。中国境外坐标原样返回。`gcj02ToWgs84` 采用一次迭代近似，误差约 1–2 米。

#### `gcj02ToWgs84(lon, lat): LngLat`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `lon` | `number` | 经度（GCJ-02） |
| `lat` | `number` | 纬度（GCJ-02） |

**返回：** `{ lon, lat }`（WGS-84）。

#### `wgs84ToGcj02(lon, lat): LngLat`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `lon` | `number` | 经度（WGS-84） |
| `lat` | `number` | 纬度（WGS-84） |

**返回：** `{ lon, lat }`（GCJ-02）。

#### `gcj02ToWgs84Batch<T>(points): T[]`

#### `wgs84ToGcj02Batch<T>(points): T[]`

批量转换，保留点上除 `lon` / `lat` 以外的字段。缺经纬度的点原样保留。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `points` | `readonly T[]` | `T extends { lon?: number; lat?: number }` |

**返回：** 新数组，不修改入参。

#### `convertActivityCoordinates(activity, target): Activity`

转换整场 `points` 的经纬度。只改 `points`，`summary` / `laps` / `preservation` 浅拷贝到新对象。调用方需保证当前点坐标系与 `target` 匹配（解析完成后点已是 WGS-84，再转到 GCJ-02 即可）。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `activity` | `Activity` | 待转换活动（不修改） |
| `target` | `CoordSystem` | `COORD_SYSTEM.wgs84` 或 `COORD_SYSTEM.gcj02` |

**返回：** 带新 `points` 的 `Activity`。

一般写出请用 `writeGpx` / `writeTcx` / `writeFit` 的 `targetCoordSystem`，不必先手动转换。

### 常量

数字枚举，比较和序列化请用常量，不要写裸数字。

#### `SPORT_TYPE`

| 键 | 值 | 含义 |
| --- | --- | --- |
| `run` | `1` | 跑步 |
| `bike` | `2` | 骑行 |
| `swim` | `3` | 游泳 |
| `hike` | `4` | 徒步 |
| `trailRun` | `5` | 越野跑 |
| `droneFlight` | `6` | 无人机飞行 |
| `paragliding` | `7` | 滑翔伞 |
| `skiing` | `8` | 滑雪 |

无法识别的运动类型解析时默认 `run`。

**当前仅针对跑步做过验证。** 表中其它类型（骑行、游泳、徒步等）可以出现在解析结果里，但尚未专门测试，请勿当作已支持。

#### `TRACK_SOURCE`

| 键 | 值 | 含义 |
| --- | --- | --- |
| `auto` | `0` | 默认值：不指定具体平台，解析时从文件内容自动探测来源 |
| `wechat` | `1` | 微信运动 |
| `joyrun` | `2` | 悦跑圈 |
| `garmin` | `3` | 佳明 |
| `suunto` | `4` | 颂拓 |
| `manual` | `5` | 手工录入或未知来源 |
| `codoon` | `6` | 咕咚 |

不传 `source` 时按文件内容探测。

#### `FILE_FORMAT`

| 键 | 值 | 含义 |
| --- | --- | --- |
| `fit` | `1` | Garmin FIT |
| `tcx` | `2` | Training Center XML |
| `gpx` | `3` | GPS Exchange Format |
| `other` | `4` | 未识别（`detectFileFormat` 失败时抛错，不会返回此值） |

#### `COORD_SYSTEM`

| 键 | 值 | 含义 |
| --- | --- | --- |
| `wgs84` | `1` | WGS-84 |
| `gcj02` | `2` | GCJ-02（火星坐标） |

#### `ALTITUDE_REF`

| 键 | 值 | 含义 |
| --- | --- | --- |
| `ellipsoid` | `1` | 椭球高 |
| `msl` | `2` | 平均海平面高（解析默认） |
| `agl` | `3` | 离地高度 |

### 版本号与工具函数

#### `CURRENT_SCHEMA_VERSION: number`

字段映射 / remainder 剔除规则版本，写入 `preservation.mappingVersion`。当前为 `1`。

#### `CURRENT_CLEANUP_VERSION: number`

轨迹点清洗规则版本，写入 `preservation.cleanupVersion`。当前为 `1`。须与 remainder 点数组下标对齐。

#### `fileFormatToSourceFormat(format): SourceFormatKey`

把格式枚举转换成字符串 `'fit' | 'tcx' | 'gpx'`。传入 `other` 会抛错。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `format` | `FileFormat` | `fit` / `tcx` / `gpx` |

**返回：** `'fit' | 'tcx' | 'gpx'`。

## 类型参考

### `ActivitySummary`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string?` | 活动名称 |
| `sportType` | `SportType` | 运动类型 |
| `source` | `TrackSource` | 数据来源平台 |
| `startTime` | `string` | 开始时间，ISO 8601 UTC |
| `endTime` | `string?` | 结束时间，ISO 8601 UTC |
| `durationSec` | `number?` | 计时器时长（秒，不含暂停）。FIT 对应 `totalTimerTime` |
| `activeDurationSec` | `number?` | 含暂停的时长。FIT 对应 `totalElapsedTime`；TCX/GPX 无法区分时与 `durationSec` 相同 |
| `distance2dM` | `number?` | 平面累计距离（米） |
| `avgPaceSecPerKm` | `number?` | 平均配速（秒/公里），由速度或时长/距离推导 |
| `avgSpeedMps` / `maxSpeedMps` | `number?` | 平均 / 最大速度（米/秒） |
| `avgHeartRate` / `maxHeartRate` | `number?` | 平均 / 最大心率 |
| `avgCadence` | `number?` | 跑步为 spm，骑行为 rpm |
| `totalAscentM` / `totalDescentM` | `number?` | 累计爬升 / 下降（米） |
| `maxAltitudeM` / `minAltitudeM` | `number?` | 最高 / 最低海拔（米） |
| `calories` | `number?` | 千卡 |
| `creator` | `string?` | 写出软件（GPX `creator`），与设备无关 |
| `deviceManufacturer` | `string?` | 如 `garmin` / `suunto` |
| `deviceModel` | `string?` | 如 `Forerunner 235 (Asia)` |

### `TrackPoint`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `t` | `string` | 采样时间，ISO 8601 UTC；源文件未给时为空串 |
| `lon` / `lat` | `number?` | 经纬度（度，WGS-84）；无 GPS 时缺省 |
| `ele` | `number?` | 海拔（米），基准见 `Activity.altitudeRef` |
| `hr` | `number?` | 心率 |
| `cad` | `number?` | 步频 spm 或踏频 rpm |
| `spd` | `number?` | 瞬时速度（米/秒） |
| `dist` | `number?` | 从起点累计距离（米） |

### `LapSummary`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `index` | `number` | 圈序号，从 0 起 |
| `startTime` | `string` | 本圈开始时间 |
| `durationSec` | `number` | 本圈时长（秒） |
| `distanceM` | `number` | 本圈距离（米） |
| `avgHr` / `maxHr` | `number?` | 心率 |
| `avgCadence` / `maxCadence` | `number?` | 步频 / 踏频 |
| `avgSpeed` / `maxSpeed` | `number?` | 速度（米/秒） |
| `calories` | `number?` | 千卡 |
| `avgAltitudeM` / `maxAltitudeM` / `minAltitudeM` | `number?` | 海拔 |
| `totalAscentM` / `totalDescentM` | `number?` | 爬升 / 下降 |
| `trigger` | `string?` | 切圈方式。FIT：`manual` / `time` / `distance` / `sessionEnd` 等；TCX：`Manual` / `Distance` / `Location` / `Time` / `HeartRate` |
| `pointRange` | `[number, number]?` | 本圈覆盖 `points` 的闭区间下标 |

### `ActivityPreservation`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `remainder` | `Record<string, unknown>` | 未映射的原格式残余 |
| `mappingVersion` | `number` | 映射规则版本 |
| `cleanupVersion` | `number` | 点清洗规则版本 |
| `transformations` | `ActivityTransformMeta` | 单位换算、公式补全等记录 |
| `originalPointCount` | `number` | 解析时点数，防止 remainder 数组错位 |

`ActivityTransformMeta` 含 `cadenceScaled`、`derivedFields`、可选的 `sourceActivityIndex` 与 `pathHits`。

### `CoordinateDetection`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `method` | `'explicit' \| 'metadata' \| 'source' \| 'default'` | 判定方式 |
| `confidence` | `'certain' \| 'high' \| 'low'` | 置信度 |

### 其它类型

```ts
type BinaryInput = Uint8Array | ArrayBuffer;
type SourceFormatKey = 'fit' | 'tcx' | 'gpx';

interface LngLat { lon: number; lat: number; }
type LngLatLike = { lon?: number; lat?: number };

interface RegistryPathHit {
  index: number;       // TCX 多候选路径命中的下标
  wildcards?: string[]; // `*:localName` 实际匹配到的键
}
```

`SportType` / `TrackSource` / `FileFormat` / `CoordSystem` / `AltitudeRef` / `ParseStatus` 分别为对应常量对象值的联合类型。

## 常见错误

| 场景 | 行为 |
| --- | --- |
| 不是 FIT / GPX / TCX | `detectFileFormat` / `parseFile` 抛错 |
| GPX 无 `<trk>` 或无有效点 | 抛错 |
| TCX 无 Activity 或某条无有效点 | 抛错 |
| FIT Decoder 报错 | 抛错 |
| FIT 为 monitoring / settings 等非活动文件 | 抛错，说明文件类型 |
| GPX/TCX 保真写出失败 | **不抛错**，回退核心字段 XML |
| 写出时 `preservation` 点数与当前 `points` 对不齐 | `preservation` 不为 `none` 时抛错 |

错误信息为英文。

## 许可证

本库使用 [Apache-2.0](./LICENSE)。第三方声明见 [NOTICE](./NOTICE)。

FIT 解析/写出依赖 [`@garmin/fitsdk`](https://www.npmjs.com/package/@garmin/fitsdk)，该 SDK **不会**打进本包，由 npm 依赖安装。使用 FIT 功能即表示同时接受 [Garmin FIT SDK License](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt)。

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。安全问题请按 [SECURITY.md](./SECURITY.md) 私下报告。
