export const SPORT_TYPE = {
  run: 1, // 跑步
  bike: 2, // 骑行
  swim: 3, // 游泳
  hike: 4, // 徒步
  trailRun: 5, // 越野跑
  droneFlight: 6, // 无人机飞行
  paragliding: 7, // 滑翔伞
  skiing: 8, // 滑雪
} as const;

export const TRACK_SOURCE = {
  auto: 0, // 自动探测（解析选项哨兵值，非真实平台）
  wechat: 1, // 微信运动
  joyrun: 2, // Joyrun（悦跑圈）
  garmin: 3, // 佳明（Garmin）
  suunto: 4, // 颂拓（Suunto）
  manual: 5, // 手工录入或未知来源
  codoon: 6, // 咕咚
} as const;

export const FILE_FORMAT = {
  fit: 1, // Garmin FIT 二进制格式
  tcx: 2, // Training Center XML
  gpx: 3, // GPS Exchange Format
  other: 4, // 未识别或其他格式
} as const;

export const COORD_SYSTEM = {
  wgs84: 1, // WGS-84 全球 GPS 坐标系
  gcj02: 2, // GCJ-02 国测局偏移坐标（火星坐标）
} as const;

export const ALTITUDE_REF = {
  ellipsoid: 1, // 椭球高（相对 WGS-84 椭球面）
  msl: 2, // 平均海平面高（正高）
  agl: 3, // 离地高度（Above Ground Level）
} as const;

export const PARSE_STATUS = {
  pending: 0, // 待解析
  success: 1, // 解析成功
  failed: 2, // 解析失败
} as const;
