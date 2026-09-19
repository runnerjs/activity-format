/** FIT Profile 常见 enum 字符串（@garmin/fitsdk Encoder 仅接受合法值）。 */
const FIT_MANUFACTURERS = new Set([
  'garmin',
  'suunto',
  'coros',
  'polar',
  'development',
  'wahoo',
  'zwift',
  'cycling',
  'dynastream',
  'dynastream_oem',
  'tacx',
]);

const FIT_SPORTS = new Set([
  'generic',
  'running',
  'cycling',
  'swimming',
  'walking',
  'hiking',
  'trail_running',
  'mountain_biking',
  'training',
]);

/**
 * 把厂商字符串规范为 Encoder 可接受的 manufacturer enum。
 * @param value 任意值
 * @returns 白名单内的小写厂商名；未知字符串回退 `development`；非字符串返回 undefined
 */
function sanitizeFitManufacturer(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const lower = value.trim().toLowerCase();
  if (FIT_MANUFACTURERS.has(lower)) {
    return lower;
  }
  return 'development';
}

/**
 * 把运动类型规范为 Encoder 可接受的 sport enum。
 * @param value 任意值
 * @returns 白名单 sport；含 run/bike/cycl 时模糊映射；其余默认 `running`
 */
function sanitizeFitSport(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const lower = value.trim().toLowerCase();
  if (FIT_SPORTS.has(lower)) {
    return lower;
  }
  if (lower.includes('run')) {
    return 'running';
  }
  if (lower.includes('bike') || lower.includes('cycl')) {
    return 'cycling';
  }
  return 'running';
}

/**
 * 把未知时间值转成有效 Date，供 timestamp / startTime 等字段写入。
 * @param value Date / ISO 字符串 / 时间戳
 * @returns 有效 Date；无法解析则 undefined
 */
function sanitizeFitTimestamp(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return undefined;
}

/**
 * 提取有限数字，NaN / Infinity 丢弃。
 * @param value 任意值
 * @returns 有限 number，否则 undefined
 */
function sanitizeFitNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

/**
 * 提取非空字符串并截断，避免 Encoder 因过长字符串失败。
 * @param value 任意值
 * @param maxLen 最大长度，默认 64
 * @returns 修剪并截断后的字符串；空串返回 undefined
 */
function sanitizeFitString(value: unknown, maxLen = 64): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * 清洗单条 FIT message，剔除 Encoder 无法写入的字段/取值。
 *
 * 按字段名分别处理 manufacturer、sport、时间、product 等；
 * 其余只保留 number / 非空 string / boolean / Date。
 * localTimestamp 是 FIT localDateTime uint32，不当作 JS Date 清洗。
 * @param message merge 或规范化后的单条消息
 * @returns 可安全交给 Encoder.onMesg 的字段字典
 */
export function sanitizeFitMessage(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(message)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (key === 'manufacturer') {
      const manufacturer = sanitizeFitManufacturer(value);
      if (manufacturer) {
        sanitized[key] = manufacturer;
      }
      continue;
    }

    if (key === 'sport' || key === 'subSport') {
      const sport = sanitizeFitSport(value);
      if (sport) {
        sanitized[key] = sport;
      }
      continue;
    }

    if (
      key === 'timestamp' ||
      key === 'startTime' ||
      key === 'timeCreated' ||
      key === 'startTimestamp'
    ) {
      const date = sanitizeFitTimestamp(value);
      if (date) {
        sanitized[key] = date;
      }
      continue;
    }

    if (key === 'product' || key.endsWith('Product')) {
      const num = sanitizeFitNumber(value);
      if (num !== undefined) {
        sanitized[key] = Math.round(num);
      }
      continue;
    }

    if (key === 'productName') {
      const name = sanitizeFitString(value, 20);
      if (name) {
        sanitized[key] = name;
      }
      continue;
    }

    if (typeof value === 'number') {
      const num = sanitizeFitNumber(value);
      if (num !== undefined) {
        sanitized[key] = num;
      }
      continue;
    }

    if (typeof value === 'string') {
      const str = sanitizeFitString(value);
      if (str) {
        sanitized[key] = str;
      }
      continue;
    }

    if (typeof value === 'boolean') {
      sanitized[key] = value;
      continue;
    }

    if (value instanceof Date) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
