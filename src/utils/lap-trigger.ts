/** TCX `TriggerMethod` 合法值。 */
const TCX_TRIGGER_METHODS = [
  'Manual',
  'Distance',
  'Location',
  'Time',
  'HeartRate',
] as const;

/** FIT `lapTrigger`（fitsdk camelCase）合法值。 */
const FIT_LAP_TRIGGERS = [
  'manual',
  'time',
  'distance',
  'positionStart',
  'positionLap',
  'positionWaypoint',
  'positionMarked',
  'sessionEnd',
  'fitnessEquipment',
] as const;

const FIT_TO_TCX: Record<string, (typeof TCX_TRIGGER_METHODS)[number]> = {
  manual: 'Manual',
  time: 'Time',
  distance: 'Distance',
  positionStart: 'Location',
  positionLap: 'Location',
  positionWaypoint: 'Location',
  positionMarked: 'Location',
  sessionEnd: 'Manual',
  fitnessEquipment: 'Manual',
};

const TCX_TO_FIT: Record<string, (typeof FIT_LAP_TRIGGERS)[number]> = {
  Manual: 'manual',
  Time: 'time',
  Distance: 'distance',
  Location: 'positionLap',
  HeartRate: 'manual',
};

/**
 * 把任意切圈触发值收成合法 TCX `TriggerMethod`。
 * 已是 TCX 枚举则原样返回；FIT camelCase 按语义对应；无法识别时为 `Manual`。
 * @param value core.trigger 或 raw 叶子
 * @returns TCX 枚举字符串
 */
export function toTcxTriggerMethod(value: unknown): string {
  const text = normalizeTriggerText(value);
  if (!text) return 'Manual';
  if (isTcxTriggerMethod(text)) return text;
  const fromFit = FIT_TO_TCX[text] ?? FIT_TO_TCX[text.toLowerCase()];
  if (fromFit) return fromFit;
  const titled = titleCaseTrigger(text);
  if (isTcxTriggerMethod(titled)) return titled;
  return 'Manual';
}

/**
 * 把任意切圈触发值收成合法 FIT `lapTrigger`。
 * 已是 FIT 枚举则原样返回；TCX PascalCase 按语义对应；无法识别时为 `manual`。
 * @param value core.trigger 或 raw 叶子
 * @returns FIT camelCase 字符串
 */
export function toFitLapTrigger(value: unknown): string {
  const text = normalizeTriggerText(value);
  if (!text) return 'manual';
  if (isFitLapTrigger(text)) return text;
  const fromTcx = TCX_TO_FIT[text];
  if (fromTcx) return fromTcx;
  const lower = text.toLowerCase();
  if (isFitLapTrigger(lower)) return lower;
  return 'manual';
}

function normalizeTriggerText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isTcxTriggerMethod(
  value: string,
): value is (typeof TCX_TRIGGER_METHODS)[number] {
  return (TCX_TRIGGER_METHODS as readonly string[]).includes(value);
}

function isFitLapTrigger(
  value: string,
): value is (typeof FIT_LAP_TRIGGERS)[number] {
  return (FIT_LAP_TRIGGERS as readonly string[]).includes(value);
}

function titleCaseTrigger(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
