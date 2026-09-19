import { isPlainObject } from './path-util';

/**
 * 将 extensions（overlay）深度合并进 reverseMap 骨架（base）。
 *
 * overlay 优先：同路径叶子以 overlay 为准；数组按索引对齐，
 * overlay 元素为 null/undefined 时回退到 base，以配合 deepStrip 的占位。
 * @param base reverseMap 写出的格式原生对象
 * @param overlay split 留下的 remainder
 * @returns 合并后的新对象（不修改入参）
 */
export function deepMerge(base: unknown, overlay: unknown): unknown {
  // overlay 缺省则沿用骨架
  if (overlay === null || overlay === undefined) {
    return base;
  }
  // 骨架缺省则整段采用 remainder
  if (base === null || base === undefined) {
    return overlay;
  }

  if (Array.isArray(base) && Array.isArray(overlay)) {
    // 取较长一侧，避免 remainder 多出的元素被丢掉
    const length = Math.max(base.length, overlay.length);
    const merged: unknown[] = [];
    for (let i = 0; i < length; i += 1) {
      const overlayItem = overlay[i];
      // deepStrip 用 null 占位表示该元素已映射进 core，保留 reverseMap 值
      if (overlayItem === null || overlayItem === undefined) {
        merged[i] = base[i];
        continue;
      }
      // 骨架无此下标（导出时点数变少等），直接采用 remainder
      if (base[i] === undefined) {
        merged[i] = overlayItem;
        continue;
      }
      merged[i] = deepMerge(base[i], overlayItem);
    }
    return merged;
  }

  if (isPlainObject(base) && isPlainObject(overlay)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      if (value === undefined) continue;
      // 同键递归合并，新键直接写入
      if (key in out) {
        out[key] = deepMerge(out[key], value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  // 类型不一致时 overlay 覆盖（例如骨架是对象、remainder 是标量）
  return overlay;
}
