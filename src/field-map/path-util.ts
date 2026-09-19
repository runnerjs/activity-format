import type { PathSegment } from './types';

/**
 * 判断值是否为普通对象（非 null、非数组）。
 * @param value 任意输入
 * @returns 可作为 `Record<string, unknown>` 使用时为 true
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * 去掉 XML 元素的命名空间前缀，得到 local name。
 * @param key 对象键，如 `ns3:hr` 或 `hr`
 * @returns 无前缀的本地名，如 `hr`
 */
export function xmlLocalName(key: string): string {
  const colon = key.lastIndexOf(':');
  return colon >= 0 ? key.slice(colon + 1) : key;
}

/**
 * 判断对象键是否匹配路径段（支持 `*:localName` 通配）。
 * @param key 实际对象键
 * @param segment 解析后的路径段
 * @returns 匹配则为 true
 */
export function matchObjectKey(key: string, segment: PathSegment): boolean {
  if (segment.kind !== 'prop') {
    return key === segment.name;
  }
  if (segment.wildcard) {
    return xmlLocalName(key) === segment.name;
  }
  return key === segment.name;
}

/**
 * 解析 registry 路径 DSL（附录 A）。
 *
 * 支持 `prop`、`prop[]`、`$:attr` / `$.attr`、`*:localName`。
 * @param path 点分路径字符串，如 `gpx.trk[].trkpt[].$.lat`
 * @returns 有序路径段；空字符串返回空数组
 */
export function parsePath(path: string): PathSegment[] {
  if (!path) return [];
  const segments: PathSegment[] = [];
  const parts = path.split('.');
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    // `$` 后紧跟属性名：`Activity.$.Sport` → attr Sport
    if (part === '$') {
      const next = parts[i + 1];
      if (next) {
        segments.push({ kind: 'attr', name: next });
        i += 1;
      }
      continue;
    }
    // 兼容 `$.lat` 写成单段的情况
    if (part.startsWith('$.')) {
      segments.push({ kind: 'attr', name: part.slice(2) });
      continue;
    }
    if (part.endsWith('[]')) {
      const namePart = part.slice(0, -2);
      if (namePart.startsWith('*:')) {
        segments.push({
          kind: 'prop',
          name: namePart.slice(2),
          array: true,
          wildcard: true,
        });
      } else {
        segments.push({ kind: 'prop', name: namePart, array: true });
      }
      continue;
    }
    if (part.startsWith('*:')) {
      segments.push({
        kind: 'prop',
        name: part.slice(2),
        array: false,
        wildcard: true,
      });
      continue;
    }
    segments.push({ kind: 'prop', name: part, array: false });
  }
  return segments;
}

/**
 * xml2js 配置 B 下单元素数组取 [0]，还原为标量叶子。
 * @param value 路径读到的原始值
 * @returns 单元素非对象数组则解包；否则原值
 */
export function unwrapXmlLeaf(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.length === 1 && !isPlainObject(value[0])) {
      return value[0];
    }
  }
  return value;
}

/**
 * 把单值或数组规范成数组。
 * @param value 单值、数组、undefined 或 null
 * @returns 空输入为 `[]`；单值包成单元素数组
 */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

type PropHit = { value: unknown; wildcardKey?: string };

function readPropHits(node: unknown, segment: PathSegment): PropHit[] {
  if (segment.kind === 'attr') {
    if (!isPlainObject(node)) return [];
    const bucket = node.$;
    if (!isPlainObject(bucket)) return [];
    const value = bucket[segment.name];
    return value === undefined ? [] : [{ value }];
  }
  if (!isPlainObject(node)) return [];
  if (segment.wildcard) {
    const matched: PropHit[] = [];
    for (const [key, raw] of Object.entries(node)) {
      // `$` 是属性桶，不当作子元素；键需匹配 local name
      if (key === '$' || !matchObjectKey(key, segment)) continue;
      const values = segment.array ? asArray(raw) : [unwrapXmlLeaf(raw)];
      for (const value of values) {
        matched.push({ value, wildcardKey: key });
      }
    }
    return matched;
  }
  const raw = node[segment.name];
  if (raw === undefined) return [];
  if (segment.array) {
    return asArray(raw).map((value) => ({ value }));
  }
  return [{ value: unwrapXmlLeaf(raw) }];
}

/**
 * 在当前节点上读取一个路径段，返回所有匹配子节点。
 * @param node 当前遍历节点
 * @param segment 要读取的路径段
 * @returns 匹配到的子值列表；无法下降时为空数组
 */
function readProp(node: unknown, segment: PathSegment): unknown[] {
  return readPropHits(node, segment).map((hit) => hit.value);
}

/**
 * 按路径收集所有叶子值（跨数组笛卡尔展开）。
 * @param root 遍历起点
 * @param path registry 路径 DSL
 * @returns 所有命中叶子；路径为空时返回 `[root]`
 */
export function resolvePathValues(root: unknown, path: string): unknown[] {
  const segments = parsePath(path);
  if (segments.length === 0) return [root];

  let nodes: unknown[] = [root];
  for (const segment of segments) {
    const next: unknown[] = [];
    for (const node of nodes) {
      next.push(...readProp(node, segment));
    }
    nodes = next;
    if (nodes.length === 0) return [];
  }
  return nodes.map((value) => unwrapXmlLeaf(value));
}

/**
 * 按路径收集末级节点（当前实现与 `resolvePathValues` 相同）。
 * @param root 遍历起点
 * @param path registry 路径 DSL
 * @returns 末级节点列表
 */
export function resolvePathNodes(root: unknown, path: string): unknown[] {
  return resolvePathValues(root, path);
}

/**
 * 读取路径上的第一个叶子值。
 * @param root 遍历起点
 * @param path registry 路径；以 `$.` 开头时视为当前节点属性
 * @returns 首个命中值；未命中为 undefined
 */
export function resolvePathValue(root: unknown, path: string): unknown {
  if (path.startsWith('$.')) {
    const attr = path.slice(2);
    if (isPlainObject(root) && isPlainObject(root.$)) {
      return root.$[attr];
    }
    return undefined;
  }
  const values = resolvePathValues(root, path);
  return values.length > 0 ? values[0] : undefined;
}

/**
 * 按顺序尝试多条路径，返回首个命中值（用于 GPX extensions 多形态 fallback）。
 * @param root 遍历起点
 * @param paths 候选路径，从前到后尝试
 * @returns 第一个非 undefined 的值；全部未命中为 undefined
 */
export function resolvePathValueFirst(
  root: unknown,
  paths: readonly string[],
): unknown {
  return resolvePathHitFirst(root, paths)?.value;
}

/** 路径解析命中：叶子值、所用路径、以及 `*:local` 段匹配到的实际键。 */
export interface PathResolveHit {
  value: unknown;
  path: string;
  wildcards: string[];
}

/**
 * 按路径读取第一个叶子，并记录通配段匹配到的对象键。
 * @param root 遍历起点
 * @param path registry 路径 DSL
 * @returns 命中结果；未命中为 undefined
 */
export function resolvePathHit(
  root: unknown,
  path: string,
): PathResolveHit | undefined {
  if (path.startsWith('$.')) {
    const value = resolvePathValue(root, path);
    return value === undefined ? undefined : { value, path, wildcards: [] };
  }
  const segments = parsePath(path);
  if (segments.length === 0) {
    return { value: root, path, wildcards: [] };
  }

  type WalkState = { node: unknown; wildcards: string[] };
  let states: WalkState[] = [{ node: root, wildcards: [] }];
  for (const segment of segments) {
    const next: WalkState[] = [];
    for (const state of states) {
      for (const hit of readPropHits(state.node, segment)) {
        next.push({
          node: hit.value,
          wildcards:
            hit.wildcardKey === undefined
              ? state.wildcards
              : [...state.wildcards, hit.wildcardKey],
        });
      }
    }
    states = next;
    if (states.length === 0) return undefined;
  }
  const first = states[0];
  const value = unwrapXmlLeaf(first.node);
  if (value === undefined) return undefined;
  return { value, path, wildcards: first.wildcards };
}

/**
 * 按顺序尝试多条路径，返回首个命中（含所用路径与通配键）。
 * @param root 遍历起点
 * @param paths 候选路径，从前到后尝试
 * @returns 第一个命中；全部未命中为 undefined
 */
export function resolvePathHitFirst(
  root: unknown,
  paths: readonly string[],
): PathResolveHit | undefined {
  for (const path of paths) {
    const hit = resolvePathHit(root, path);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

type NormalizedPathSegment = {
  name: string;
  array: boolean;
  wildcard: boolean;
  attr: boolean;
};

/**
 * 把路径规范成可比较的段列表（属性 / 通配 / 数组标记）。
 * @param path registry 或具体路径
 * @returns 规范化段数组
 */
function normalizePathForMatch(path: string): NormalizedPathSegment[] {
  return parsePath(path).map((segment) =>
    segment.kind === 'attr'
      ? { name: segment.name, array: false, wildcard: false, attr: true }
      : {
          name: segment.name,
          array: segment.array,
          wildcard: Boolean(segment.wildcard),
          attr: false,
        },
  );
}

/**
 * 判断具体路径段是否被模式段覆盖。
 * @param concrete 不含通配的实际段
 * @param pattern registry 模式段（可含 wildcard）
 * @returns 属性种类一致且名称匹配则为 true
 */
function pathSegmentMatches(
  concrete: NormalizedPathSegment,
  pattern: NormalizedPathSegment,
): boolean {
  if (concrete.attr !== pattern.attr) return false;
  if (pattern.wildcard) {
    return xmlLocalName(concrete.name) === pattern.name;
  }
  return concrete.name === pattern.name;
}

/**
 * 判断具体路径是否被 registry 通配路径覆盖（供 deepStrip 剔除已映射字段）。
 * @param concretePath 实际对象上的点分路径
 * @param mappedPaths registry 已映射路径集合
 * @returns 精确命中或被 `*:local` 通配覆盖则为 true
 */
export function isConcretePathMapped(
  concretePath: string,
  mappedPaths: Set<string>,
): boolean {
  if (mappedPaths.has(concretePath)) {
    return true;
  }
  const concreteSegments = normalizePathForMatch(concretePath);
  for (const pattern of mappedPaths) {
    // 不含通配的路径已在 Set.has 中处理
    if (!pattern.includes('*:')) continue;
    const patternSegments = normalizePathForMatch(pattern);
    if (patternSegments.length !== concreteSegments.length) continue;
    if (
      patternSegments.every((segment, index) =>
        pathSegmentMatches(concreteSegments[index], segment),
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 深拷贝 plain object / array（不处理循环引用）。
 * @param value 任意值
 * @returns 新对象/数组；标量原样返回
 */
export function deepClone<T>(value: T): T {
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const TypedArray = value.constructor as new (array: ArrayLike<number>) => typeof value;
    return new TypedArray(value as unknown as ArrayLike<number>) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = deepClone(child);
    }
    return out as T;
  }
  return value;
}

/**
 * 在对象上按路径写入值（用于 reverseMap）。
 *
 * `indices` 按路径中数组段出现顺序消费，用于定位 `trk[0].trkpt[i]` 等。
 * @param root 写入起点（就地改写）
 * @param path registry 路径 DSL
 * @param value 要写入的叶子值
 * @param indices 各层数组下标
 * @param options.leafAsXmlArray 叶子是否包成 xml2js 单元素数组，默认 true
 * @param options.wildcardPrefix `*:local` 段写出时使用的 xmlns 前缀
 * @param options.wildcardKeys 解析阶段记下的实际键，按 `*:local` 段顺序覆盖写出键名
 * @returns 无返回值
 */
export function setPathValue(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
  indices: number[],
  options?: {
    leafAsXmlArray?: boolean;
    wildcardPrefix?: string;
    wildcardKeys?: readonly string[];
  },
): void {
  const leafAsXmlArray = options?.leafAsXmlArray ?? true;
  const segments = parsePath(path);
  let cursor: unknown = root;
  let indexPos = 0;
  let wildcardPos = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;

    if (segment.kind === 'attr') {
      if (!isPlainObject(cursor)) return;
      if (!isPlainObject(cursor.$)) cursor.$ = {};
      if (isLast) {
        (cursor.$ as Record<string, unknown>)[segment.name] = value;
      }
      continue;
    }

    if (!isPlainObject(cursor)) return;

    const wildcardKey =
      segment.kind === 'prop' && segment.wildcard
        ? options?.wildcardKeys?.[wildcardPos++]
        : undefined;
    const key = resolveXmlWriteKey(
      cursor,
      segment,
      options?.wildcardPrefix,
      wildcardKey,
    );

    if (segment.array) {
      if (!Array.isArray(cursor[key])) {
        cursor[key] = [];
      }
      const arr = cursor[key] as unknown[];
      const idx = indices[indexPos] ?? 0;
      indexPos += 1;
      // 中间空洞用空对象填上，保证后续段能继续下降
      while (arr.length <= idx) {
        arr.push({});
      }
      if (isLast) {
        arr[idx] = leafAsXmlArray ? wrapXmlLeaf(value) : value;
        return;
      }
      if (!isPlainObject(arr[idx])) {
        arr[idx] = {};
      }
      cursor = arr[idx];
      continue;
    }

    if (isLast) {
      cursor[key] = leafAsXmlArray ? wrapXmlLeaf(value) : value;
      return;
    }
    if (!isPlainObject(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
}

/**
 * 通配路径写出时选用的对象键：已有前缀键优先，否则用 wildcardPrefix。
 * @param cursor 当前节点
 * @param segment 路径段
 * @param wildcardPrefix 如 `ns3` / `gpxtpx`
 * @returns 写入用的键名
 */
function resolveXmlWriteKey(
  cursor: Record<string, unknown>,
  segment: PathSegment,
  wildcardPrefix?: string,
  wildcardKey?: string,
): string {
  if (segment.kind !== 'prop' || !segment.wildcard) {
    return segment.name;
  }
  if (wildcardKey) {
    return wildcardKey;
  }
  for (const existing of Object.keys(cursor)) {
    if (matchObjectKey(existing, segment)) {
      return existing;
    }
  }
  if (wildcardPrefix) {
    return `${wildcardPrefix}:${segment.name}`;
  }
  return segment.name;
}

/**
 * 把标量叶子包成 xml2js 单元素字符串数组。
 * @param value 待写入叶子
 * @returns 对象/空值原样返回；标量变为 `[String(value)]`
 */
function wrapXmlLeaf(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === 'object') {
    return value;
  }
  return [String(value)];
}

/**
 * 创建空的格式根对象，供 reverseMap 往里填字段。
 * @param format 目标格式键
 * @returns 带最小骨架的空对象
 */
export function createEmptyRawRoot(
  format: 'fit' | 'tcx' | 'gpx',
): Record<string, unknown> {
  switch (format) {
    case 'fit':
      return {
        recordMesgs: [],
        lapMesgs: [],
        sessionMesgs: [],
      };
    case 'tcx':
      return {
        TrainingCenterDatabase: {
          Activities: [{ Activity: [{ Lap: [{ Track: [{ Trackpoint: [] }] }] }] }],
        },
      };
    case 'gpx':
      return { gpx: { trk: [{ trkseg: [{ trkpt: [] }] }] } };
    default:
      return {};
  }
}
