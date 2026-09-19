import { asArray, isPlainObject, unwrapXmlLeaf } from '../field-map/path-util';
import { toTimeMs } from '../field-map/lap-point-range';
import { isValidTrackTimestampMs } from '../utils/track-point';

/**
 * 清洗 xml2js 点数组：丢掉非法时间戳，按时间升序排列。
 *
 * 与 FIT `sanitizeFitRecordMesgs` 对齐：不因缺 GPS 丢点。
 * 无时间元素的点保留（咕咚 GPX 无 trkpt/time），排在有合法时间的点之后并保持原相对顺序。
 * 有时间但无法解析、或年份不在 2000–2100 的点丢掉。
 *
 * @param points xml2js 点节点列表（trkpt / Trackpoint）
 * @param readTimeMs 从节点读取 epoch 毫秒；缺时间为 undefined
 * @returns 清洗后的新数组，不改入参数组引用以外的节点对象
 */
export function sanitizeXmlPointArray(
  points: unknown[],
  readTimeMs: (point: unknown) => number | undefined,
): unknown[] {
  const decorated = points.map((point, index) => ({
    point,
    index,
    timeMs: readTimeMs(point),
  }));
  const kept = decorated.filter((item) => {
    // 无时间：保留。有时间但 toTimeMs 失败：NaN，丢掉。
    if (item.timeMs === undefined) {
      return true;
    }
    if (!Number.isFinite(item.timeMs)) {
      return false;
    }
    return isValidTrackTimestampMs(item.timeMs);
  });
  kept.sort((left, right) => {
    const leftKey = left.timeMs ?? Number.POSITIVE_INFINITY;
    const rightKey = right.timeMs ?? Number.POSITIVE_INFINITY;
    if (leftKey !== rightKey) {
      return leftKey - rightKey;
    }
    return left.index - right.index;
  });
  return kept.map((item) => item.point);
}

/**
 * 从 xml2js 元素读取时间毫秒。
 *
 * @param node 点节点
 * @param elementName GPX 为 `time`，TCX 为 `Time`
 * @returns 缺元素为 undefined；有元素但无法解析为 NaN；否则为 epoch 毫秒
 */
export function readXmlElementTimeMs(
  node: unknown,
  elementName: string,
): number | undefined {
  if (!isPlainObject(node)) {
    return undefined;
  }
  const values = asArray(node[elementName]);
  if (values.length === 0) {
    return undefined;
  }
  const text = xmlLeafText(values[0]);
  if (!text) {
    return undefined;
  }
  const timeMs = toTimeMs(text);
  return timeMs === undefined ? Number.NaN : timeMs;
}

/**
 * 过滤 GPX 各 trkseg 的 trkpt：非法时间丢掉，段内按时间排序。
 * 就地写回 raw，保证 split 的 core 与 remainder 从同一数组投影。
 *
 * @param raw xml2js GPX 树
 * @returns 清洗后仍保留的 trkpt 总数
 */
export function sanitizeGpxRawTrackpoints(raw: unknown): number {
  if (!isPlainObject(raw)) {
    return 0;
  }
  const gpx = raw.gpx;
  if (!isPlainObject(gpx)) {
    return 0;
  }
  let count = 0;
  for (const trk of asArray(gpx.trk)) {
    if (!isPlainObject(trk)) {
      continue;
    }
    for (const trkseg of asArray(trk.trkseg)) {
      if (!isPlainObject(trkseg)) {
        continue;
      }
      const cleaned = sanitizeXmlPointArray(
        asArray(trkseg.trkpt),
        (point) => readXmlElementTimeMs(point, 'time'),
      );
      trkseg.trkpt = cleaned;
      count += cleaned.length;
    }
  }
  return count;
}

/**
 * 过滤 TCX 各 Track 的 Trackpoint：非法时间丢掉，Track 内按时间排序。
 * 就地写回 raw，保证 split 的 core 与 remainder 从同一数组投影。
 *
 * @param raw xml2js TCX 树
 * @returns 清洗后仍保留的 Trackpoint 总数
 */
export function sanitizeTcxRawTrackpoints(raw: unknown): number {
  if (!isPlainObject(raw)) {
    return 0;
  }
  const tcd = raw.TrainingCenterDatabase;
  if (!isPlainObject(tcd)) {
    return 0;
  }
  let count = 0;
  for (const activitiesWrapper of asArray(tcd.Activities)) {
    if (!isPlainObject(activitiesWrapper)) {
      continue;
    }
    for (const activity of asArray(activitiesWrapper.Activity)) {
      if (!isPlainObject(activity)) {
        continue;
      }
      for (const lap of asArray(activity.Lap)) {
        if (!isPlainObject(lap)) {
          continue;
        }
        for (const track of asArray(lap.Track)) {
          if (!isPlainObject(track)) {
            continue;
          }
          const cleaned = sanitizeXmlPointArray(
            asArray(track.Trackpoint),
            (point) => readXmlElementTimeMs(point, 'Time'),
          );
          track.Trackpoint = cleaned;
          count += cleaned.length;
        }
      }
    }
  }
  return count;
}

/**
 * 把 xml2js 叶子收成可 parse 的时间文本。
 * @param value 元素数组项，可能是字符串或 `{ _: text }`
 * @returns 去空白文本；无法取值时为空串
 */
function xmlLeafText(value: unknown): string {
  const leaf = unwrapXmlLeaf(value);
  if (typeof leaf === 'string' || typeof leaf === 'number') {
    return String(leaf).trim();
  }
  if (leaf instanceof Date) {
    return leaf.toISOString();
  }
  if (isPlainObject(leaf) && leaf._ !== undefined) {
    return String(leaf._).trim();
  }
  if (leaf === undefined || leaf === null) {
    return '';
  }
  return String(leaf).trim();
}
