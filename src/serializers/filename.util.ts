/** 文件名非法字符（Windows / macOS 通用）。 */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * 将活动名称清理为安全的文件名片段。
 * @param name 原始活动名称
 * @returns 去除非法字符并截断后的名称，空值时返回 `活动`
 */
export function sanitizeFileBaseName(name: string): string {
  const trimmed = name.trim().replace(INVALID_FILENAME_CHARS, '_');
  const collapsed = trimmed.replace(/\s+/g, ' ');
  return collapsed.length > 0 ? collapsed.slice(0, 80) : '活动';
}

/**
 * 把 ISO 时间格式化为 `YYYYMMDD_HHmmss`（UTC，与入库 ISO 一致）。
 * @param iso ISO 8601 时间字符串
 * @returns 如 `20260710_224953`
 */
export function formatActivityTimestamp(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}_${h}${min}${s}`;
}

/**
 * 生成导出 zip 文件名：`YYYYMMDD.zip`（导出当天 UTC 日期）。
 * @param date 基准时间，默认当前时刻
 * @returns 如 `20260905.zip`
 */
export function formatExportZipName(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}.zip`;
}

/**
 * 生成活动导出文件名（活动名 + UTC 时间戳 + 扩展名，同批次重名自动追加序号）。
 * @param activityName 活动名称
 * @param startTimeIso 活动开始时间（ISO 8601）
 * @param ext 文件扩展名（不含点）
 * @param usedNames 同批次已用文件名集合，用于去重（会被就地写入）
 * @returns 唯一导出文件名，如 `Morning Run_20260710_224953.gpx`
 */
export function buildExportFileName(
  activityName: string,
  startTimeIso: string,
  ext: string,
  usedNames: Set<string>,
): string {
  const base = `${sanitizeFileBaseName(activityName)}_${formatActivityTimestamp(startTimeIso)}`;
  let candidate = `${base}.${ext}`;
  let seq = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${seq}.${ext}`;
    seq += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * `buildExportFileName` 的别名，保持历史调用名。
 * @param activityName 活动名称
 * @param startTimeIso 活动开始时间（ISO 8601）
 * @param ext 文件扩展名（不含点）
 * @param usedNames 同批次已用文件名集合，用于去重
 * @returns 唯一导出文件名
 */
export const buildFileName = buildExportFileName;

/**
 * 生成 RFC 5987 Content-Disposition 附件头（ASCII 回退 + UTF-8 扩展）。
 * @param filename 导出文件名（可含中文）
 * @returns 如 `attachment; filename="..." ` 或带 `filename*=UTF-8''...` 的头值
 */
export function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/"/g, '');
  const encoded = encodeURIComponent(safe);
  if (/^[\x20-\x7E]+$/.test(safe)) {
    return `attachment; filename="${safe}"`;
  }
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
