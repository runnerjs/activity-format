import { isPlainObject } from '../src/field-map/path-util';

const SAMPLE_LIMIT = 3;

export type DiffKind = 'missing' | 'extra' | 'format' | 'numeric' | 'text';

export interface DiffSample {
  kind: DiffKind;
  path: string;
  original?: unknown;
  after?: unknown;
}

export interface FieldDiffGroup {
  path: string;
  missing: number;
  extra: number;
  format: number;
  numeric: number;
  text: number;
  maxAbsDelta?: number;
  samples: DiffSample[];
}

export interface XmlTreeDiff {
  originalLeafCount: number;
  afterLeafCount: number;
  groups: FieldDiffGroup[];
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function collectTcxTrackpoints(tree: Record<string, unknown>): unknown[] {
  const root = tree.TrainingCenterDatabase;
  if (!isPlainObject(root)) return [];
  const activities = asArray(root.Activities);
  const points: unknown[] = [];
  for (const activitiesNode of activities) {
    if (!isPlainObject(activitiesNode)) continue;
    for (const activity of asArray(activitiesNode.Activity)) {
      if (!isPlainObject(activity)) continue;
      for (const lap of asArray(activity.Lap)) {
        if (!isPlainObject(lap)) continue;
        for (const track of asArray(lap.Track)) {
          if (!isPlainObject(track)) continue;
          points.push(...asArray(track.Trackpoint));
        }
      }
    }
  }
  return points;
}

function collectLeaves(
  node: unknown,
  path: string,
  out: Map<string, unknown>,
): void {
  if (node === undefined) return;
  if (node === null || typeof node !== 'object') {
    if (path) out.set(path, node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      collectLeaves(item, `${path}[${index}]`, out);
    });
    return;
  }
  const record = node as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    if (path) out.set(path, record);
    return;
  }
  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key;
    collectLeaves(record[key], childPath, out);
  }
}

function normalizeIndexedPath(path: string): string {
  return path.replace(/\[\d+\]/g, '[]');
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function valuesEqual(original: unknown, after: unknown): boolean {
  return original === after || String(original) === String(after);
}

function classifyValueDiff(
  original: unknown,
  after: unknown,
): { kind: 'format' | 'numeric' | 'text'; delta?: number } {
  const originalNum = toFiniteNumber(original);
  const afterNum = toFiniteNumber(after);
  if (originalNum !== undefined && afterNum !== undefined) {
    if (originalNum === afterNum) {
      return { kind: 'format' };
    }
    return { kind: 'numeric', delta: Math.abs(originalNum - afterNum) };
  }
  return { kind: 'text' };
}

function pushSample(group: FieldDiffGroup, sample: DiffSample): void {
  if (group.samples.length < SAMPLE_LIMIT) {
    group.samples.push(sample);
  }
}

/**
 * 按叶子路径对比两棵 xml2js 树，忽略同级字段顺序。
 */
export function diffXmlTrees(
  original: Record<string, unknown>,
  after: Record<string, unknown>,
): XmlTreeDiff {
  const originalLeaves = new Map<string, unknown>();
  const afterLeaves = new Map<string, unknown>();
  collectLeaves(original, '', originalLeaves);
  collectLeaves(after, '', afterLeaves);

  const groups = new Map<string, FieldDiffGroup>();
  const ensureGroup = (path: string): FieldDiffGroup => {
    const existing = groups.get(path);
    if (existing) return existing;
    const created: FieldDiffGroup = {
      path,
      missing: 0,
      extra: 0,
      format: 0,
      numeric: 0,
      text: 0,
      samples: [],
    };
    groups.set(path, created);
    return created;
  };

  const allPaths = new Set([...originalLeaves.keys(), ...afterLeaves.keys()]);
  for (const path of allPaths) {
    const originalValue = originalLeaves.get(path);
    const afterValue = afterLeaves.get(path);
    const group = ensureGroup(normalizeIndexedPath(path));
    if (originalValue === undefined) {
      group.extra += 1;
      pushSample(group, { kind: 'extra', path, after: afterValue });
      continue;
    }
    if (afterValue === undefined) {
      group.missing += 1;
      pushSample(group, { kind: 'missing', path, original: originalValue });
      continue;
    }
    if (valuesEqual(originalValue, afterValue)) continue;
    const classified = classifyValueDiff(originalValue, afterValue);
    group[classified.kind] += 1;
    if (classified.delta !== undefined) {
      group.maxAbsDelta = Math.max(group.maxAbsDelta ?? 0, classified.delta);
    }
    pushSample(group, {
      kind: classified.kind,
      path,
      original: originalValue,
      after: afterValue,
    });
  }

  return {
    originalLeafCount: originalLeaves.size,
    afterLeafCount: afterLeaves.size,
    groups: [...groups.values()]
      .filter(
        (group) =>
          group.missing + group.extra + group.format + group.numeric + group.text >
          0,
      )
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export function formatXmlTreeDiff(label: string, diff: XmlTreeDiff): string {
  const lines = [
    label,
    `leaves original=${diff.originalLeafCount} after=${diff.afterLeafCount} changedGroups=${diff.groups.length}`,
  ];
  for (const group of diff.groups) {
    const parts = [
      group.missing ? `missing=${group.missing}` : '',
      group.extra ? `extra=${group.extra}` : '',
      group.format ? `format=${group.format}` : '',
      group.numeric ? `numeric=${group.numeric}` : '',
      group.text ? `text=${group.text}` : '',
      group.maxAbsDelta !== undefined ? `maxAbsDelta=${group.maxAbsDelta}` : '',
    ].filter((part) => part.length > 0);
    lines.push(`- ${group.path}: ${parts.join(' ')}`);
    for (const sample of group.samples) {
      lines.push(
        `    ${sample.kind} ${sample.path} original=${JSON.stringify(sample.original)} after=${JSON.stringify(sample.after)}`,
      );
    }
  }
  return lines.join('\n');
}
