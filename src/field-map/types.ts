import type {
  CoordSystem,
  FileFormat,
  Activity,
  TrackSource,
  FormatTransformMeta,
} from '../types';

/** 字段映射方向能力 */
export type MapDirection = 'both' | 'importOnly' | 'exportOnly';

export type FieldUnit =
  | 'm'
  | 'm/s'
  | 'sec'
  | 'bpm'
  | 'rpm'
  | 'spm'
  | 'kcal'
  | 'deg'
  | 'semicircles';

export interface FieldMapEntry {
  /** 语义键，跨格式统一 */
  semantic: string;
  /** 核心落点：summary.* / points[].* / laps[].*；null 表示仅存 extensions */
  core: string | null;
  unit?: FieldUnit;
  fit: string | null;
  /**
   * TCX 原生路径。一条字符串，或按优先级排列的多条候选（先命中先用）。
   * 写出时优先用 preservation 记录的命中路径与 `*` 实际键。
   */
  tcx: string | readonly string[] | null;
  gpx: string | null;
  requiredIn?: Array<'fit' | 'tcx' | 'gpx'>;
  direction: MapDirection;
}

export interface SplitOptions {
  source: TrackSource;
  /** 解析阶段已识别的原始坐标系；未传则按 source 推断。 */
  sourceCoordSystem?: CoordSystem;
  /** 解析阶段已知的 meta 片段（如 cadenceScaled） */
  meta?: Partial<FormatTransformMeta>;
}

export interface SplitResult {
  core: Activity;
  extensions: Record<string, unknown>;
  meta: FormatTransformMeta;
}

/** deriver 函数：读整个 raw 或当前 target，返回纠正后的值。 */
export type DeriveFn = (context: DeriveContext) => unknown;

/**
 * deriver 的输入：split 之后的 core + 格式原生对象。
 * 数组路径（如 `laps[].durationSec`）会为每个对象子项各调一次，并带上该子项与下标。
 */
export interface DeriveContext {
  raw: unknown;
  core: Activity;
  /** 当前写入目标（summary / 某个 lap / 某个 point / Activity 根对象等）。 */
  target: Record<string, unknown>;
  /** 位于数组路径时的下标；标量路径不设。 */
  index?: number;
}

/**
 * 跨格式推导表条目，形态对齐 FIELD_REGISTRY。
 * `core` 可为 `summary.*` / `laps[].*` / `points[].*` 或任意嵌套属性。
 * fit / tcx / gpx 为函数；该格式无需特殊处理时为 null。
 */
export interface DeriveEntry {
  semantic: string;
  core: string;
  fit: DeriveFn | null;
  tcx: DeriveFn | null;
  gpx: DeriveFn | null;
}

export interface MergeAlignment {
  schemaVersion: number;
  pointCount: number;
}

export interface MergeOptions {
  targetFormat: FileFormat;
  alignment?: MergeAlignment;
}

export type PathSegment =
  | { kind: 'prop'; name: string; array: boolean; wildcard?: boolean }
  | { kind: 'attr'; name: string };
