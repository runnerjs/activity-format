/**
 * Round-trip 测试断言工具（L1–L3）。
 * 规范见 .cursor/plans/数据管理-导出功能2.md 附录 E。
 */

/**
 * 判断值是否为普通对象（非 null、非数组）。
 * @param value 任意输入
 * @returns 可作为 `Record<string, unknown>` 使用时为 true
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 收集 JSON 树的全部叶子路径，数组下标归一为 `[]`。
 * @param node 当前节点
 * @param prefix 当前路径前缀
 * @param out 累积用的路径集合（可复用）
 * @returns 叶子路径集合
 */
export function collectLeafPaths(
  node: unknown,
  prefix = '',
  out = new Set<string>(),
): Set<string> {
  if (node === null || node === undefined) {
    if (prefix) out.add(prefix);
    return out;
  }
  if (Array.isArray(node)) {
    if (node.length === 0 && prefix) {
      out.add(prefix);
      return out;
    }
    // 下标归一为 []，只比较结构不比较具体索引
    node.forEach((el) => collectLeafPaths(el, `${prefix}[]`, out));
    return out;
  }
  if (isPlainObject(node)) {
    const keys = Object.keys(node);
    if (keys.length === 0 && prefix) {
      out.add(prefix);
      return out;
    }
    for (const [k, v] of Object.entries(node)) {
      collectLeafPaths(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  if (prefix) out.add(prefix);
  return out;
}

/**
 * L1：断言两棵 JSON 树的叶子路径全集严格相等。
 * @param actual 实际对象
 * @param expected 期望对象
 * @returns 无返回值；路径集合不等时 Jest 失败
 */
export function assertLeafPathsEqual(
  actual: unknown,
  expected: unknown,
): void {
  const actualPaths = collectLeafPaths(actual);
  const expectedPaths = collectLeafPaths(expected);
  expect(actualPaths).toEqual(expectedPaths);
}

/**
 * L2：断言两个数组长度一致，且逐元素 key 集合（或类型）一致。
 * @param actual 实际数组
 * @param expected 期望数组
 * @param label 失败信息前缀，默认 `array`
 * @returns 无返回值
 */
export function assertArrayStructureEqual(
  actual: readonly unknown[] | undefined,
  expected: readonly unknown[] | undefined,
  label = 'array',
): void {
  if (actual === undefined && expected === undefined) return;
  expect(actual?.length).toBe(expected?.length ?? 0);
  if (!actual || !expected) return;
  actual.forEach((item, index) => {
    if (item === null && expected[index] === null) return;
    if (item === null || expected[index] === null) {
      expect(item).toEqual(expected[index]);
      return;
    }
    if (isPlainObject(item) && isPlainObject(expected[index])) {
      expect(Object.keys(item).sort()).toEqual(
        Object.keys(expected[index] as Record<string, unknown>).sort(),
      );
      return;
    }
    expect(typeof item).toBe(typeof expected[index]);
  });
}

export interface NumericToleranceOptions {
  /** 坐标（度数）容差，默认 1e-5 */
  coordinateDeg?: number;
  /** DECIMAL(8,2) 容差，默认 0.005 */
  decimal8_2?: number;
  /** DECIMAL(10,2) 容差，默认 0.005 */
  decimal10_2?: number;
  /** INTEGER 容差，默认 0.5 */
  integer?: number;
  /** SMALLINT 容差，默认 0.5 */
  smallint?: number;
}

const DEFAULT_TOLERANCE: Required<NumericToleranceOptions> = {
  coordinateDeg: 1e-5,
  decimal8_2: 0.005,
  decimal10_2: 0.005,
  integer: 0.5,
  smallint: 0.5,
};

export type NumericFieldKind =
  | 'exact'
  | 'coordinateDeg'
  | 'decimal8_2'
  | 'decimal10_2'
  | 'integer'
  | 'smallint';

/**
 * L3：按字段类型带容差比较两个叶子值。
 * @param actual 实际叶子
 * @param expected 期望叶子
 * @param kind 未指定时对 number 使用 exact（extensions 原值精确相等）
 * @param options 覆盖默认容差
 * @returns 无返回值；超出容差时 Jest 失败
 */
export function assertNumericEqual(
  actual: unknown,
  expected: unknown,
  kind: NumericFieldKind = 'exact',
  options: NumericToleranceOptions = {},
): void {
  const tol = { ...DEFAULT_TOLERANCE, ...options };
  if (actual === expected) return;
  if (actual === null || expected === null) {
    expect(actual).toBe(expected);
    return;
  }
  if (typeof actual !== 'number' || typeof expected !== 'number') {
    expect(actual).toEqual(expected);
    return;
  }
  if (kind === 'exact') {
    expect(actual).toBe(expected);
    return;
  }
  const delta = tol[kind];
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(delta);
}

/**
 * 递归比较两棵 JSON 树（L3 容差），路径用于报错定位。
 * @param actual 实际节点
 * @param expected 期望节点
 * @param resolveKind 按路径决定数值容差类型
 * @param path 当前路径，默认空
 * @param options 覆盖默认容差
 * @returns 无返回值
 */
export function assertDeepEqualWithTolerance(
  actual: unknown,
  expected: unknown,
  resolveKind?: (path: string) => NumericFieldKind,
  path = '',
  options: NumericToleranceOptions = {},
): void {
  if (actual === expected) return;

  if (actual === null || expected === null) {
    expect(actual).toBe(expected);
    return;
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((item, i) => {
      assertDeepEqualWithTolerance(
        item,
        expected[i],
        resolveKind,
        `${path}[]`,
        options,
      );
    });
    return;
  }

  if (isPlainObject(actual) && isPlainObject(expected)) {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      const childPath = path ? `${path}.${key}` : key;
      assertDeepEqualWithTolerance(
        actual[key],
        expected[key],
        resolveKind,
        childPath,
        options,
      );
    }
    return;
  }

  const kind = resolveKind?.(path) ?? 'exact';
  assertNumericEqual(actual, expected, kind, options);
}
