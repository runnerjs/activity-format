import { garminProductToLabel } from '../config/garmin-product';
import {
  CODOON_CREATOR_PATTERN,
  isCodoonPlaceholderName,
  parseCodoonGpxDescStartTime,
  readCodoonDescStartTime,
  readGpxCreator,
  readGpxMetadataText,
} from '../parsers/codoon-gpx.util';
import { toNum } from '../parsers/types';
import type { Activity, FileFormat, FormatTransformMeta } from '../types';
import {
  deriveDurationSecFromPoints,
  estimateActivityDistanceM,
  pickReasonableDistanceM,
} from '../utils/track-point';
import { toTimeMs } from './lap-point-range';
import { asArray, isPlainObject, parsePath, resolvePathValue, unwrapXmlLeaf } from './path-util';
import { formatPathKey } from './registry';
import type { DeriveContext, DeriveEntry, DeriveFn, PathSegment } from './types';

const GARMIN_MANUFACTURERS = new Set([
  'garmin',
  'dynastream',
  'dynastream_oem',
]);

/**
 * 跨格式推导表：semantic ↔ core ↔ 各格式纠正函数。
 *
 * 与 FIELD_REGISTRY 对齐；值为函数而非路径。null 表示该格式不做特殊处理。
 * `core` 不限于 summary：`laps[].*`、`points[].*` 以及任意嵌套属性均可。
 * 在 parseFit / parseGpx / parseTcx 于 split 之后调用，补全或纠正注册表取值。
 */
export const DERIVE_REGISTRY: DeriveEntry[] = [
  {
    semantic: 'startTime',
    core: 'summary.startTime',
    fit: null,
    tcx: null,
    gpx: deriveGpxStartTime,
  },
  {
    semantic: 'endTime',
    core: 'summary.endTime',
    fit: deriveFitEndTime,
    tcx: null,
    gpx: null,
  },
  {
    semantic: 'durationSec',
    core: 'summary.durationSec',
    fit: deriveFitDurationSec,
    tcx: deriveXmlDurationSec,
    gpx: deriveXmlDurationSec,
  },
  {
    semantic: 'distance2dM',
    core: 'summary.distance2dM',
    fit: deriveFitDistance2dM,
    tcx: deriveXmlDistance2dM,
    gpx: deriveXmlDistance2dM,
  },
  {
    semantic: 'avgPaceSecPerKm',
    core: 'summary.avgPaceSecPerKm',
    fit: deriveAvgPaceSecPerKm,
    tcx: deriveAvgPaceSecPerKm,
    gpx: deriveAvgPaceSecPerKm,
  },
  {
    semantic: 'deviceManufacturer',
    core: 'summary.deviceManufacturer',
    fit: deriveFitDeviceManufacturer,
    tcx: null,
    gpx: null,
  },
  {
    semantic: 'deviceModel',
    core: 'summary.deviceModel',
    fit: deriveFitDeviceModel,
    tcx: null,
    gpx: null,
  },
  {
    semantic: 'activityName',
    core: 'summary.name',
    fit: null,
    tcx: null,
    gpx: deriveGpxActivityName,
  },
  {
    semantic: 'activeDurationSec',
    core: 'summary.activeDurationSec',
    fit: deriveActiveDurationSec,
    tcx: deriveActiveDurationSec,
    gpx: deriveActiveDurationSec,
  },
  {
    semantic: 'maxAltitudeM',
    core: 'summary.maxAltitudeM',
    fit: deriveMaxAltitudeM,
    tcx: deriveMaxAltitudeM,
    gpx: deriveMaxAltitudeM,
  },
  {
    semantic: 'minAltitudeM',
    core: 'summary.minAltitudeM',
    fit: deriveMinAltitudeM,
    tcx: deriveMinAltitudeM,
    gpx: deriveMinAltitudeM,
  },
];

/**
 * 按当前格式选出 DERIVE_REGISTRY 中的函数，覆盖 split 已抽出的 core 字段。
 *
 * core 路径与 FIELD_REGISTRY 相同：`summary.*`、`laps[].*`、`points[].*` 或任意嵌套属性。
 * 路径中的数组段会逐项调用 deriver（仅对象类型子项）。
 * 该格式列为 null 或函数返回 undefined 时保留原值；值有变化则记入 derivedFields。
 * @param core split 产出的 Activity，就地改写命中字段
 * @param raw 格式原生对象（FIT messages / GPX·TCX xml 树）
 * @param format 文件格式，用于选取 fit / tcx / gpx 列
 * @param meta 解析 meta，追加 derivedFields
 * @returns 无返回值
 */
export function applyDerivers(
  core: Activity,
  raw: unknown,
  format: FileFormat,
  meta: FormatTransformMeta,
): void {
  applyDeriveEntries(DERIVE_REGISTRY, core, raw, format, meta);
}

/**
 * @deprecated 使用 {@link applyDerivers}；行为相同，已支持任意 core 路径。
 */
export const applySummaryDerivers = applyDerivers;

/**
 * 对给定推导表按格式列逐条应用（供测试注入条目；生产路径走 {@link applyDerivers}）。
 * @param entries 推导表
 * @param core split 产出的 Activity
 * @param raw 格式原生对象
 * @param format 文件格式
 * @param meta 解析 meta
 * @returns 无返回值
 */
export function applyDeriveEntries(
  entries: readonly DeriveEntry[],
  core: Activity,
  raw: unknown,
  format: FileFormat,
  meta: FormatTransformMeta,
): void {
  const key = formatPathKey(format);
  for (const entry of entries) {
    const derive = entry[key];
    if (!derive) continue;
    applyDeriveEntry(entry.core, derive, core, raw, meta);
  }
}

/**
 * 按一条 core 路径收集写入目标并调用 deriver。
 * 末段必须是对象上的属性名；中间的 `[]` 段会对每个对象子项各调一次。
 * @param corePath registry 风格路径
 * @param derive 当前格式的推导函数
 * @param core Activity
 * @param raw 格式原生对象
 * @param meta 解析 meta
 * @returns 无返回值
 */
function applyDeriveEntry(
  corePath: string,
  derive: DeriveFn,
  core: Activity,
  raw: unknown,
  meta: FormatTransformMeta,
): void {
  const segments = parsePath(corePath);
  if (segments.length === 0) return;
  const fieldSegment = segments[segments.length - 1];
  // 末段须为对象属性（如 `durationSec`），不能是 `laps[]` 这种数组本身
  if (fieldSegment.kind !== 'prop' || fieldSegment.array) return;

  const field = fieldSegment.name;
  const parents = collectParentTargets(core, segments.slice(0, -1));
  let changed = false;
  for (const { target, index } of parents) {
    const context: DeriveContext = { raw, core, target, index };
    const next = derive(context);
    if (next === undefined) continue;
    const current = target[field];
    if (current !== next) changed = true;
    assignDerivedField(target, field, next);
  }
  if (changed) recordDerivedField(meta, corePath);
}

/**
 * 沿 core 路径走到末字段的父节点列表。
 * 遇到 `[]` 则展开数组；非对象子项跳过。
 * @param root Activity 根
 * @param parentSegments 不含末字段的路径段
 * @returns 可写入的目标对象及可选下标
 */
function collectParentTargets(
  root: unknown,
  parentSegments: PathSegment[],
): Array<{ target: Record<string, unknown>; index?: number }> {
  let nodes: Array<{ node: unknown; index?: number }> = [{ node: root }];
  for (const segment of parentSegments) {
    if (segment.kind !== 'prop') return [];
    const next: Array<{ node: unknown; index?: number }> = [];
    for (const { node } of nodes) {
      if (!isPlainObject(node)) continue;
      const value = node[segment.name];
      if (segment.array) {
        if (!Array.isArray(value)) continue;
        value.forEach((item, index) => {
          next.push({ node: item, index });
        });
      } else if (value !== undefined) {
        next.push({ node: value });
      }
    }
    nodes = next;
  }
  return nodes.flatMap(({ node, index }) =>
    isPlainObject(node) ? [{ target: node, index }] : [],
  );
}

/**
 * 把发生变化的 core 路径记入 derivedFields（同路径只记一次）。
 * @param meta 解析 meta
 * @param corePath registry 风格路径
 * @returns 无返回值
 */
function recordDerivedField(meta: FormatTransformMeta, corePath: string): void {
  if (!meta.derivedFields.includes(corePath)) {
    meta.derivedFields.push(corePath);
  }
}

/**
 * FIT 时长：Σ session.totalTimerTime → activity → Σ lap → elapsed → 墙钟。
 * @param context split 后的 core + FIT messages
 * @returns 秒（保留亚秒小数）
 */
function deriveFitDurationSec(context: DeriveContext): unknown {
  const raw = asRecord(context.raw);
  if (!raw) return undefined;
  const sessions = asArray(raw.sessionMesgs);
  const laps = asArray(raw.lapMesgs);
  const activity = asRecord(asArray(raw.activityMesgs)[0]);
  const records = asArray(raw.recordMesgs);

  return (
    sumPositiveField(sessions, 'totalTimerTime') ??
    toPositive(activity?.totalTimerTime) ??
    sumPositiveField(laps, 'totalTimerTime') ??
    sumPositiveField(sessions, 'totalElapsedTime') ??
    deriveFitWallClockSec(activity, sessions, records, context.core)
  );
}

/**
 * GPX / TCX 时长：注册表已有正数则不改；否则用首末点墙钟。
 * @param context split 后的 core + xml 树
 * @returns 秒
 */
function deriveXmlDurationSec(context: DeriveContext): unknown {
  const current = toPositive(context.core.summary.durationSec);
  if (current !== undefined) return undefined;
  return deriveDurationSecFromPoints(context.core.points) ?? undefined;
}

/**
 * FIT 距离：session 声明、末点累计、注册表结果与折线估算交叉校验。
 * @param context split 后的 core + FIT messages
 * @returns 米
 */
function deriveFitDistance2dM(context: DeriveContext): unknown {
  const raw = asRecord(context.raw);
  const sessionDistance = sumPositiveField(asArray(raw?.sessionMesgs), 'totalDistance');
  const lastDist = context.core.points[context.core.points.length - 1]?.dist;
  return (
    pickReasonableDistanceM(
      [sessionDistance, lastDist, context.core.summary.distance2dM],
      estimateActivityDistanceM(context.core.points),
    ) ?? undefined
  );
}

/**
 * GPX / TCX 距离：注册表距离、末点 dist 与折线估算取合理值。
 * @param context split 后的 core + xml 树
 * @returns 米
 */
function deriveXmlDistance2dM(context: DeriveContext): unknown {
  const lastDist = context.core.points[context.core.points.length - 1]?.dist;
  return (
    pickReasonableDistanceM(
      [context.core.summary.distance2dM, lastDist],
      estimateActivityDistanceM(context.core.points),
    ) ?? undefined
  );
}

/**
 * 平均配速（秒/公里）。三种格式都没有原生字段。
 *
 * 优先用设备给出的 `avgSpeedMps`（FIT session.avgSpeed）；
 * 否则用计时时长 / 平面距离：`durationSec * 1000 / distance2dM`。
 * 用 `durationSec`（不含暂停）而不是 `activeDurationSec`，避免暂停把配速算慢。
 * @param context split 后的 core
 * @returns 秒/公里；已有值或算不出时为 undefined
 */
function deriveAvgPaceSecPerKm(context: DeriveContext): unknown {
  if (toPositive(context.core.summary.avgPaceSecPerKm) !== undefined) {
    return undefined;
  }
  const speed = toPositive(context.core.summary.avgSpeedMps);
  if (speed !== undefined) {
    return 1000 / speed;
  }
  const duration = toPositive(context.core.summary.durationSec);
  const distance = toPositive(context.core.summary.distance2dM);
  if (duration === undefined || distance === undefined) {
    return undefined;
  }
  return (duration * 1000) / distance;
}

/**
 * FIT 厂商：只取 creator / deviceIndex 0（否则 file_id），不扫全部 deviceInfo。
 * 各条 deviceInfo 的 manufacturer 留在 remainder，避免一对多映射把配件行剥掉。
 * @param context split 后的 core + FIT messages
 * @returns 厂商名或数字 ID 的字符串
 */
function deriveFitDeviceManufacturer(context: DeriveContext): unknown {
  const source = pickFitDeviceSource(context.raw);
  if (!source) return undefined;
  const manufacturer = source.manufacturer;
  if (typeof manufacturer === 'string') {
    return readNonEmptyString(manufacturer);
  }
  if (typeof manufacturer === 'number' && Number.isFinite(manufacturer)) {
    return String(manufacturer);
  }
  return undefined;
}

/**
 * FIT 设备型号：creator / deviceIndex 0 的 productName 或 garminProduct。
 * 不写入 registry，避免把每条 deviceInfo 的 productName 从 remainder 剔除。
 * @param context split 后的 core + FIT messages
 * @returns 显示名
 */
function deriveFitDeviceModel(context: DeriveContext): unknown {
  const source = pickFitDeviceSource(context.raw);
  if (!source) return undefined;

  const productName = readNonEmptyString(source.productName);
  if (productName) return productName;

  const manufacturer = String(source.manufacturer ?? '').toLowerCase();
  if (GARMIN_MANUFACTURERS.has(manufacturer)) {
    const label = garminProductToLabel(
      (source.garminProduct ?? source.product) as string | number,
    );
    if (label) return label;
  }

  if (source.product !== undefined && source.product !== null && source.product !== '') {
    return String(source.product);
  }
  return undefined;
}

/**
 * GPX 活动名：优先 `trk/name`，没有再用 `metadata/name`。
 * creator 为咕咚且名称为占位值、desc 含时间时，用 desc 作为名称。
 * @param context split 后的 core + GPX 树
 * @returns 活动名；没有可用名称则为 undefined
 */
function deriveGpxActivityName(context: DeriveContext): unknown {
  const trkName = readGpxXmlText(context.raw, 'gpx.trk[].name');
  const metaName = readGpxXmlText(context.raw, 'gpx.metadata[].name');
  const picked = trkName ?? metaName;
  if (isCodoonGpxCreator(context) && isCodoonPlaceholderName(picked)) {
    const desc = readGpxMetadataText(context.raw, 'desc');
    if (desc && parseCodoonGpxDescStartTime(desc)) {
      return desc;
    }
  }
  if (picked && !isCodoonPlaceholderName(picked)) return picked;
  return undefined;
}

/**
 * 咕咚本地 GPX：creator 匹配且 desc 含时间时，用 desc 覆盖 startTime。
 * 只填开始时间，不填 endTime、不改轨迹点。已有 trkpt/time 时不改。
 * @param context split 后的 core + GPX 树
 * @returns UTC ISO；不满足条件则为 undefined
 */
function deriveGpxStartTime(context: DeriveContext): unknown {
  if (!isCodoonGpxCreator(context)) return undefined;
  return readCodoonDescStartTime(context.raw) ?? undefined;
}

/**
 * FIT 结束时间：`session.startTime + totalElapsedTime`（含暂停的墙钟结束）。
 * Garmin 明确要求不要把 session.timestamp 当作结束时间（消息写入时刻）。
 * 算不出 elapsed 时保留注册表从 timestamp 读到的值。
 * @param context split 后的 core + FIT messages
 * @returns UTC ISO；无法计算则为 undefined
 */
function deriveFitEndTime(context: DeriveContext): unknown {
  const startMs = toTimeMs(context.core.summary.startTime);
  if (startMs === undefined) return undefined;
  const raw = asRecord(context.raw);
  const elapsedSec = sumPositiveField(asArray(raw?.sessionMesgs), 'totalElapsedTime');
  if (elapsedSec === undefined) return undefined;
  return new Date(startMs + elapsedSec * 1000).toISOString();
}

/**
 * 根属性 creator 是否像咕咚（含 codoon / ledong）。
 * @param context 含 summary.creator 或 raw gpx@creator
 * @returns 匹配则为 true
 */
function isCodoonGpxCreator(context: DeriveContext): boolean {
  const creator =
    context.core.summary.creator?.trim() || readGpxCreator(context.raw);
  return CODOON_CREATOR_PATTERN.test(creator);
}

/**
 * 含暂停的墙钟时长。
 * FIT 已从 `totalElapsedTime` 映射则保留；TCX / GPX 无独立字段时与 `durationSec` 对齐。
 * @param context split 后的 core
 * @returns 秒；已有值时不覆盖
 */
function deriveActiveDurationSec(context: DeriveContext): unknown {
  if (toPositive(context.core.summary.activeDurationSec) !== undefined) {
    return undefined;
  }
  return toPositive(context.core.summary.durationSec);
}

/**
 * 最高海拔：已有 session 值则保留，否则取圈级 max，再否则取点级 `ele`。
 * @param context split 后的 core
 * @returns 米
 */
function deriveMaxAltitudeM(context: DeriveContext): unknown {
  if (toFiniteNumber(context.core.summary.maxAltitudeM) !== undefined) {
    return undefined;
  }
  return (
    extremaFromValues(
      context.core.laps.map((lap) => lap.maxAltitudeM),
      'max',
    ) ?? extremaFromValues(
      context.core.points.map((point) => point.ele),
      'max',
    )
  );
}

/**
 * 最低海拔：已有 session 值则保留，否则取圈级 min，再否则取点级 `ele`。
 * @param context split 后的 core
 * @returns 米
 */
function deriveMinAltitudeM(context: DeriveContext): unknown {
  if (toFiniteNumber(context.core.summary.minAltitudeM) !== undefined) {
    return undefined;
  }
  return (
    extremaFromValues(
      context.core.laps.map((lap) => lap.minAltitudeM),
      'min',
    ) ?? extremaFromValues(
      context.core.points.map((point) => point.ele),
      'min',
    )
  );
}

/**
 * 从可选数值列表取最大或最小的有限值。
 * @param values 可能缺省的海拔列表
 * @param mode 取最大或最小
 * @returns 极值；没有任何有限值时为 undefined
 */
function extremaFromValues(
  values: readonly (number | undefined)[],
  mode: 'max' | 'min',
): number | undefined {
  let found: number | undefined;
  for (const value of values) {
    if (value === undefined || !Number.isFinite(value)) continue;
    if (found === undefined) {
      found = value;
      continue;
    }
    found = mode === 'max' ? Math.max(found, value) : Math.min(found, value);
  }
  return found;
}

/**
 * 提取有限数字（含 0 与负数，海拔可用）。
 * @param value 任意输入
 * @returns 有限 number；否则 undefined
 */
function toFiniteNumber(value: unknown): number | undefined {
  const numberValue = toNum(value);
  return numberValue !== undefined && Number.isFinite(numberValue)
    ? numberValue
    : undefined;
}

/**
 * 墙钟兜底：(activity.timestamp ?? 末点) − (首 session.startTime ?? 首点)。
 * @param activity 第一条 activity 消息
 * @param sessions session 消息
 * @param records 已清洗的 record 消息
 * @param core 已抽出的 Activity
 * @returns 秒
 */
function deriveFitWallClockSec(
  activity: Record<string, unknown> | undefined,
  sessions: unknown[],
  records: unknown[],
  core: Activity,
): number | undefined {
  const firstSession = asRecord(sessions[0]);
  const firstRecord = asRecord(records[0]);
  const lastRecord = asRecord(records[records.length - 1]);
  const startMs =
    toTimeMs(firstSession?.startTime) ??
    toTimeMs(firstRecord?.timestamp) ??
    toTimeMs(core.points[0]?.t);
  const endMs =
    toTimeMs(activity?.timestamp) ??
    toTimeMs(lastRecord?.timestamp) ??
    toTimeMs(core.points[core.points.length - 1]?.t);
  if (startMs === undefined || endMs === undefined || endMs <= startMs) {
    return undefined;
  }
  return (endMs - startMs) / 1000;
}

/**
 * 取手表本体 device_info，而不是 GPS / 心率带。
 * @param raw FIT messages
 * @returns creator 或 file_id 消息
 */
function pickFitDeviceSource(raw: unknown): Record<string, unknown> | undefined {
  const root = asRecord(raw);
  if (!root) return undefined;
  const devices = asArray(root.deviceInfoMesgs)
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => item !== undefined);
  const creator = devices.find((device) => isCreatorDeviceIndex(device.deviceIndex));
  return creator ?? devices[0] ?? asRecord(asArray(root.fileIdMesgs)[0]);
}

const DERIVED_STRING_FIELDS = new Set([
  'deviceModel',
  'name',
  'creator',
  'startTime',
  'endTime',
  'trigger',
  't',
  'deviceManufacturer',
]);

const DERIVED_FLOAT_FIELDS = new Set([
  'durationSec',
  'activeDurationSec',
  'distance2dM',
  'distanceM',
  'maxAltitudeM',
  'minAltitudeM',
  'avgAltitudeM',
  'avgPaceSecPerKm',
  'avgSpeedMps',
  'maxSpeedMps',
  'avgSpeed',
  'maxSpeed',
  'lat',
  'lon',
  'ele',
  'spd',
  'dist',
]);

/**
 * 把推导结果写入目标对象。名称/型号/触发类按字符串，时长与距离等浮点字段原样写入，其余数字取整。
 * @param target 待改写对象（summary / lap / point / Activity 根等）
 * @param field 字段名
 * @param value deriver 返回值
 * @returns 无返回值
 */
function assignDerivedField(
  target: Record<string, unknown>,
  field: string,
  value: unknown,
): void {
  if (DERIVED_STRING_FIELDS.has(field)) {
    target[field] = String(value);
    return;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    target[field] = value;
    return;
  }
  const numberValue = toNum(value);
  if (numberValue === undefined) {
    target[field] = value;
    return;
  }
  if (DERIVED_FLOAT_FIELDS.has(field)) {
    target[field] = numberValue;
    return;
  }
  target[field] = Math.round(numberValue);
}

/**
 * 读取 GPX xml2js 树上的文本叶子。
 * @param raw GPX 树
 * @param path registry 风格路径
 * @returns trim 后的非空文本；否则 undefined
 */
function readGpxXmlText(raw: unknown, path: string): string | undefined {
  const value = resolvePathValue(raw, path);
  if (value === undefined || value === null) return undefined;
  const text = String(unwrapXmlLeaf(value)).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * 对消息数组中指定字段的正数求和。
 * @param messages FIT 消息列表
 * @param field 字段名
 * @returns 合计；没有任何正数时为 undefined
 */
function sumPositiveField(messages: unknown[], field: string): number | undefined {
  let total = 0;
  let hasValue = false;
  for (const message of messages) {
    const record = asRecord(message);
    const value = toPositive(record?.[field]);
    if (value === undefined) continue;
    total += value;
    hasValue = true;
  }
  return hasValue ? total : undefined;
}

/**
 * 提取大于 0 的有限数字。
 * @param value 任意输入
 * @returns 正数；否则 undefined
 */
function toPositive(value: unknown): number | undefined {
  const numberValue = toNum(value);
  return numberValue !== undefined && numberValue > 0 ? numberValue : undefined;
}

/**
 * 判断 deviceIndex 是否表示手表本体。
 * @param value FIT deviceIndex（creator / 0）
 * @returns 是 creator 则为 true
 */
function isCreatorDeviceIndex(value: unknown): boolean {
  return value === 'creator' || value === 0 || value === '0';
}

/**
 * 读取非空字符串。
 * @param value 任意输入
 * @returns trim 后的字符串；空则 undefined
 */
function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

/**
 * 把未知值收窄为普通对象。
 * @param value 任意输入
 * @returns 对象或 undefined
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}
