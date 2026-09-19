import {
  ALTITUDE_REF,
  COORD_SYSTEM,
  FILE_FORMAT,
  PARSE_STATUS,
  SPORT_TYPE,
  TRACK_SOURCE,
} from './constants';

export type SportType = (typeof SPORT_TYPE)[keyof typeof SPORT_TYPE];
export type TrackSource = (typeof TRACK_SOURCE)[keyof typeof TRACK_SOURCE];
export type FileFormat = (typeof FILE_FORMAT)[keyof typeof FILE_FORMAT];
export type CoordSystem = (typeof COORD_SYSTEM)[keyof typeof COORD_SYSTEM];
export type AltitudeRef = (typeof ALTITUDE_REF)[keyof typeof ALTITUDE_REF];
export type ParseStatus = (typeof PARSE_STATUS)[keyof typeof PARSE_STATUS];

/**
 * registry 中 `tcx` 为多候选数组时，记录实际命中的那一条。
 * 单字符串路径不写入 preservation。
 */
export interface RegistryPathHit {
  /** 命中的是 tcx 候选数组中的第几条（0-based）。 */
  index: number;
  /**
   * 路径中 `*:localName` 段匹配到的实际键，按出现顺序。
   * 无通配段时可省略。
   */
  wildcards?: string[];
}

/** 经纬度点（度数）。 */
export interface LngLat {
  /** 经度（度）。 */
  lon: number;
  /** 纬度（度）。 */
  lat: number;
}

/** 可选经纬度；缺 lat/lon 表示该点无 GPS。 */
export type LngLatLike = { lon?: number; lat?: number };

/** 可保真还原的源格式键；`FILE_FORMAT.other` 不在此列。 */
export type SourceFormatKey = 'fit' | 'tcx' | 'gpx';

/** 解析阶段的变换元信息，随后写入 `preservation`。 */
export interface FormatTransformMeta {
  /** 源文件格式。 */
  sourceFormat: SourceFormatKey;
  /** 由公式补全或纠正过的 core 字段路径，如 `summary.durationSec`。 */
  derivedFields: string[];
  /** 跑步 cadence 是否已从 FIT rpm 换算为双足步频 spm。 */
  cadenceScaled: boolean;
  /** 轨迹点清洗规则版本，须与 remainder 点数组下标对齐。 */
  cleanupVersion: number;
  /**
   * 仅记录 registry `tcx` 为数组的字段：命中了第几条候选，以及 `*` 实际键。
   * 同格式写回用下标还原路径；deepStrip 也只剔除该条，未命中候选留在 remainder。
   */
  pathHits?: Record<string, RegistryPathHit>;
}

/** 一场运动的统一数据模型，所有 parser 输出此类型，所有 writer 接受此类型。 */
export interface Activity {
  /** 运动摘要，含运动类型、起止时间、距离、心率等汇总统计。 */
  summary: ActivitySummary;
  /** 按时间排序的轨迹点序列，含经纬度及心率、配速、海拔等时序数据。 */
  points: TrackPoint[];
  /** 分段（圈）汇总列表。 */
  laps: LapSummary[];
  /** 解析时保留的未映射原始字段与变换元信息，用于同格式 round-trip 写回；解析阶段由 finalize 写入。 */
  preservation?: ActivityPreservation;
  /** 来源文件格式（fit / gpx / tcx）。 */
  fileFormat: FileFormat;
  /** 文件原始坐标系；内部 points 已归一化为 WGS-84，写回时可按此还原。 */
  sourceCoordSystem: CoordSystem;
  /** 原始坐标系的探测方式与置信度，供调用方了解判定依据。 */
  coordinateDetection: CoordinateDetection;
  /** 海拔高度参考基准（椭球面 / 平均海平面 / 离地高度）。 */
  altitudeRef: AltitudeRef;
}

/**
 * 原始坐标系（`sourceCoordSystem`）的探测结果。
 *
 * 解析阶段写入 Activity，供调用方了解坐标系判定依据与可信程度；不影响内部 WGS-84 归一化逻辑。
 */
export interface CoordinateDetection {
  /**
   * 坐标系判定方式。
   *
   * - `explicit`：用户通过 ParseOptions.sourceCoordSystem 显式指定
   * - `metadata`：从文件内容特征探测（如 GPX creator、TCX notes、咕咚命名规则）
   * - `source`：按 TrackSource + 文件格式 + 是否含记录设备推断
   * - `default`：来源为 manual 且无元数据时，GPX/TCX 默认 WGS-84
   */
  method: 'explicit' | 'metadata' | 'source' | 'default';
  /**
   * 判定置信度。
   *
   * - `certain`：用户显式指定，完全可信
   * - `high`：文件元数据命中，或已知平台（佳明/颂拓/咕咚 FIT 等）按来源推断
   * - `low`：manual/auto 来源推断，或 GPX/TCX 无元数据时的默认值
   */
  confidence: 'certain' | 'high' | 'low';
}

/** 原格式保真信息，供同格式 round-trip 写回；不是业务扩展字段。 */
export interface ActivityPreservation {
  /**
   * 未进入统一模型、或无法从 core 无损逆还原的原格式残余，保持解析后的原层级。
   * 已映射且可按固定规则写回的字段（含坐标系 / 单位换算）不进入此树。
   */
  remainder: Record<string, unknown>;
  /** 字段剔除与反向映射规则版本。 */
  mappingVersion: number;
  /** 点清洗规则版本，须与 remainder 点数组下标对齐。 */
  cleanupVersion: number;
  /** 解析期间执行过的单位换算、公式补全等变换。 */
  transformations: ActivityTransformMeta;
  /** 解析时的点数，写出前用于防止 remainder 数组静默错位。 */
  originalPointCount: number;
}

/** 解析期间对 core 字段做过的变换记录。 */
export interface ActivityTransformMeta {
  /** 跑步 cadence 是否已从 FIT rpm 换算为双足步频 spm。 */
  cadenceScaled: boolean;
  /** 由公式补全或纠正过的 core 字段路径。 */
  derivedFields: string[];
  /** 源文件含多场活动时，本场在文件中的下标。 */
  sourceActivityIndex?: number;
  /**
   * 仅记录 registry `tcx` 为数组的字段：命中下标与 `*` 实际键。
   * 键为 `points[].cad` / `laps[].maxCadence` 等。
   */
  pathHits?: Record<string, RegistryPathHit>;
}

/** 整场运动的汇总指标。 */
export interface ActivitySummary {
  /** 活动名称；缺省可由运动类型与日期生成。 */
  name?: string;
  /** 运动类型，取值见 `SPORT_TYPE`（跑步 / 骑行等）。 */
  sportType: SportType;
  /** 数据来源平台，取值见 `TRACK_SOURCE`（佳明 / 颂拓 / 悦跑圈等）。 */
  source: TrackSource;
  /** 开始时间，ISO 8601 UTC。 */
  startTime: string;
  /** 结束时间，ISO 8601 UTC。 */
  endTime?: string;
  /** 计时器时长（秒，可含亚秒），不含暂停。FIT 为 `totalTimerTime`。 */
  durationSec?: number;
  /**
   * 含暂停的活动持续时间（秒，可含亚秒）。FIT 为 `totalElapsedTime`。
   * TCX / GPX 无法区分暂停时与 `durationSec` 相同，不留空。
   */
  activeDurationSec?: number;
  /** 平面累计距离（米）。 */
  distance2dM?: number;
  // /** 三维累计距离（米），计入海拔变化。 */
  // distance3dM?: number;
  /**
   * 平均配速（秒/公里）。
   * FIT / TCX / GPX 均无原生字段；由 `avgSpeedMps`，或计时时长 `durationSec` 与 `distance2dM` 推导。
   */
  avgPaceSecPerKm?: number;
  /** 平均速度（米/秒）。 */
  avgSpeedMps?: number;
  /** 最大速度（米/秒）。 */
  maxSpeedMps?: number;
  /** 平均心率（次/分）。 */
  avgHeartRate?: number;
  /** 最大心率（次/分）。 */
  maxHeartRate?: number;
  /** 平均步频（跑步为 spm）或踏频（骑行为 rpm）。 */
  avgCadence?: number;
  /** 累计爬升（米）。 */
  totalAscentM?: number;
  /** 累计下降（米）。 */
  totalDescentM?: number;
  /** 最高海拔（米）。 */
  maxAltitudeM?: number;
  /** 最低海拔（米）。 */
  minAltitudeM?: number;
  /** 消耗热量（千卡）。 */
  calories?: number;
  /**
   * 写出该文件的软件或站点（GPX 根属性 `creator`）。
   * 可选；FIT/TCX 通常没有。与 `deviceManufacturer` / `deviceModel` 无关。
   */
  creator?: string;
  /** 设备厂商，如 `garmin` / `suunto`。 */
  deviceManufacturer?: string;
  /** 给人看的设备型号，如 `Forerunner 235 (Asia)`。 */
  deviceModel?: string;
}

/** 单个轨迹点（GPS + 心率等时序指标）。室内或无定位点可缺经纬度。 */
export interface TrackPoint {
  /** 采样时间，ISO 8601 UTC；源文件未给出时为空串。 */
  t: string;
  /** 经度（度，WGS-84）；无 GPS 时缺省。 */
  lon?: number;
  /** 纬度（度，WGS-84）；无 GPS 时缺省。 */
  lat?: number;
  /** 海拔（米），基准见 `Activity.altitudeRef`。 */
  ele?: number;
  /** 心率（次/分）。 */
  hr?: number;
  /** 步频（跑步为 spm）或踏频（骑行为 rpm）。 */
  cad?: number;
  /** 瞬时速度（米/秒）。 */
  spd?: number;
  /** 从起点累计的距离（米）。 */
  dist?: number;
  // /** 航向角（度，0–360）。 */
  // heading?: number;
  // /** 俯仰角（度），无人机/3D 扩展。 */
  // pitch?: number;
  // /** 横滚角（度），无人机/3D 扩展。 */
  // roll?: number;
  // /** 垂直速度（米/秒）。 */
  // verticalSpeed?: number;
  // /** 离地高度（米）。 */
  // altitudeAgl?: number;
  // /** 坡度（百分比）。 */
  // grade?: number;
}

/** 一圈 / 一段的汇总。 */
export interface LapSummary {
  /** 圈序号，从 0 起。 */
  index: number;
  /** 本圈开始时间，ISO 8601 UTC。 */
  startTime: string;
  /** 本圈时长（秒，可含亚秒）。 */
  durationSec: number;
  /** 本圈距离（米）。 */
  distanceM: number;
  /** 本圈平均心率（次/分）。 */
  avgHr?: number;
  /** 本圈最大心率（次/分）。 */
  maxHr?: number;
  /** 本圈平均步频（spm）或踏频（rpm）。 */
  avgCadence?: number;
  /** 本圈最大步频（spm）或踏频（rpm）。 */
  maxCadence?: number;
  /** 本圈平均速度（米/秒）。 */
  avgSpeed?: number;
  /** 本圈最大速度（米/秒）。 */
  maxSpeed?: number;
  /** 本圈消耗热量（千卡）。 */
  calories?: number;
  /** 本圈平均海拔（米）。 */
  avgAltitudeM?: number;
  /** 本圈最高海拔（米）。 */
  maxAltitudeM?: number;
  /** 本圈最低海拔（米）。 */
  minAltitudeM?: number;
  /** 本圈累计爬升（米）。 */
  totalAscentM?: number;
  /** 本圈累计下降（米）。 */
  totalDescentM?: number;
  /**
   * 切圈触发方式，来自 FIT `lapTrigger` 或 TCX `TriggerMethod`。
   *
   * FIT（fitsdk camelCase）：
   * - `manual`：用户按圈键
   * - `time`：按时间自动计圈
   * - `distance`：按距离自动计圈
   * - `positionStart` / `positionLap` / `positionWaypoint` / `positionMarked`：按位置自动计圈
   * - `sessionEnd`：本场 session 结束时收尾的一圈
   * - `fitnessEquipment`：健身器械触发
   *
   * TCX：`Manual` / `Distance` / `Location` / `Time` / `HeartRate`
   */
  trigger?: string;
  /** 本圈覆盖 `points` 的闭区间下标 `[start, end]`。 */
  pointRange?: [number, number];
}

/** 解析选项。 */
export interface ParseOptions {
  /** 数据来源，用作坐标系与厂商特征的推断依据之一。 */
  source?: TrackSource;
  /** 调用方已知的原始坐标系；优先级最高，跳过自动探测。 */
  sourceCoordSystem?: CoordSystem;
}

/** 写出选项。 */
export interface WriteOptions {
  /** 目标文件坐标系；未传时同格式写回沿用原坐标系，跨格式默认 WGS-84。 */
  targetCoordSystem?: CoordSystem;
  /**
   * 原格式保真策略。
   * - `auto`：已映射字段以 Activity 为准并按固定规则逆还原，未映射残余写入 remainder（默认）
   * - `activity`：与 auto 相同，已映射字段均以 Activity 为准
   * - `none`：忽略 preservation
   */
  preservation?: 'auto' | 'activity' | 'none';
}

/** JSON 写出选项。 */
export interface WriteJsonOptions extends WriteOptions {
  /** JSON 缩进空格数，默认 2。 */
  indent?: number;
  /** 是否把 `undefined` 写成 `null`，默认 false。 */
  keepUndefined?: boolean;
  /** 是否输出体积可能很大的 `preservation`，默认 false。 */
  includePreservation?: boolean;
}

/**
 * parser / writer 接受的二进制入参。
 * Node.js `Buffer` 是 `Uint8Array` 子类，运行时可直接传入，不必出现在公开类型里。
 */
export type BinaryInput = Uint8Array | ArrayBuffer;
