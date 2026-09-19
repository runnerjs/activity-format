import { isPlainObject, isConcretePathMapped } from './path-util';

/**
 * 从原始对象差集剔除已映射路径，得到 extensions（remainder）。
 *
 * 按 registry 路径递归下降，命中的字段丢弃，其余保持原层级；
 * 数组元素被剔空时用 null 占位，以维持与 core.points 的索引对齐。
 * @param node 当前递归节点（首次调用传入完整 raw）
 * @param mappedPaths 当前格式已映射字段路径集合（含 `[]` / `$.attr` / `*:local`）
 * @param path 当前节点相对根的路径，默认空字符串
 * @returns 剔除后的子树；整棵被掏空时返回 undefined
 */
export function deepStrip(
  node: unknown,
  mappedPaths: Set<string>,
  path = '',
): unknown | undefined {
  if (node === null || node === undefined) {
    return node;
  }

  if (Array.isArray(node)) {
    // 数组路径统一带 []，与 registry 的 `recordMesgs[]` 等形式对齐
    const arrayPath = path.endsWith('[]') || path === '' ? path : `${path}[]`;
    const kept = node.map((element) =>
      deepStrip(element, mappedPaths, arrayPath),
    );
    // 全部元素被剔除则整段数组视为空
    if (kept.every((value) => value === undefined)) {
      return undefined;
    }
    // 单个元素被剔除时用 null 占位，避免后续 merge 错位
    return kept.map((value) => (value === undefined ? null : value));
  }

  if (isPlainObject(node)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      // xml2js 属性桶 `$` 单独按 `path.$.attr` 判断是否已映射
      if (key === '$') {
        if (!isPlainObject(value)) continue;
        const rest = Object.fromEntries(
          Object.entries(value).filter(([attrName]) => {
            const attrPath = path ? `${path}.$.${attrName}` : `$.${attrName}`;
            return !mappedPaths.has(attrPath);
          }),
        );
        if (Object.keys(rest).length > 0) {
          out.$ = rest;
        }
        continue;
      }

      const childPath = path ? `${path}.${key}` : key;
      const arrayChildPath = `${childPath}[]`;
      // 标量路径或数组路径任一命中 registry，整段子树丢弃
      if (
        isConcretePathMapped(childPath, mappedPaths) ||
        isConcretePathMapped(arrayChildPath, mappedPaths)
      ) {
        continue;
      }
      const kept = deepStrip(value, mappedPaths, childPath);
      if (kept !== undefined) {
        out[key] = kept;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  // 叶子标量且未被上层剔除，原样保留
  return node;
}
