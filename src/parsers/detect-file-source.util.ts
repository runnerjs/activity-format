import {
  COORD_SYSTEM,
  FILE_FORMAT,
  TRACK_SOURCE,
} from '../constants';
import type { BinaryInput, CoordSystem, FileFormat, TrackSource } from '../types';
import {
  CODOON_CREATOR_PATTERN,
  CODOON_GPX_NAME_PATTERN,
} from './codoon-gpx.util';
import { decodeFitBuffer } from './fit-decoder';
import { sanitizeXmlAmpersands } from './xml-sanitize.util';
import { decodeUtf8 } from '../utils/bytes';

export interface FileSourceDetection {
  /** 解析后的文件来源（导出平台），不会是 auto。 */
  source: TrackSource;
  /** 文件内原始坐标系。 */
  sourceCoordSystem: CoordSystem;
  /** 是否含记录设备信息（手表/手环等）。 */
  hasRecordingDevice: boolean;
}

const JOYRUN_TCX_NOTES = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_\d+$/;

/**
 * 判断来源是否为「自动探测」哨兵值。
 * @param source 解析选项或探测结果中的来源
 * @returns true 表示尚未指定具体平台，需要走文件内容探测
 */
export function isAutoTrackSource(source: TrackSource): boolean {
  return source === TRACK_SOURCE.auto;
}

/**
 * 根据文件来源、格式与是否含设备信息，推断原始坐标系。
 * @param source 已确定的设备/平台来源（不应为 auto）
 * @param fileFormat 文件格式（fit / gpx / tcx）
 * @param hasRecordingDevice 文件是否含手表/手环等记录设备信息
 * @returns 推断出的原始坐标系（gcj02 或 wgs84）
 */
export function resolveSourceCoordSystem(
  source: TrackSource,
  fileFormat: FileFormat,
  hasRecordingDevice: boolean,
): CoordSystem {
  // 微信运动、Joyrun 导出坐标默认在 GCJ-02
  if (source === TRACK_SOURCE.wechat || source === TRACK_SOURCE.joyrun) {
    return COORD_SYSTEM.gcj02;
  }
  if (source === TRACK_SOURCE.codoon) {
    // 咕咚本地 GPX（无设备）为 GCJ-02；经平台同步导出的 FIT/TCX（有设备）为 WGS-84
    if (fileFormat === FILE_FORMAT.gpx && !hasRecordingDevice) {
      return COORD_SYSTEM.gcj02;
    }
    return COORD_SYSTEM.wgs84;
  }
  return COORD_SYSTEM.wgs84;
}

/**
 * 从文件内容推断文件来源与坐标系（轻量解析，不构建完整 Activity）。
 * 仅在 source=auto 或需推导坐标系时调用。
 * @param input 文件内容（Uint8Array / ArrayBuffer）
 * @param fileFormat 已识别的文件格式，决定走哪条探测路径
 * @returns source、sourceCoordSystem、hasRecordingDevice
 */
export async function detectFileSource(
  input: BinaryInput,
  fileFormat: FileFormat,
): Promise<FileSourceDetection> {
  if (fileFormat === FILE_FORMAT.gpx) {
    return detectGpxFileSource(input);
  }
  if (fileFormat === FILE_FORMAT.tcx) {
    return detectTcxFileSource(input);
  }
  if (fileFormat === FILE_FORMAT.fit) {
    return detectFitFileSource(input);
  }
  // 未知格式按手工录入处理，坐标系按 manual + 无设备推断
  return fallbackDetection(TRACK_SOURCE.manual, fileFormat, false);
}

/**
 * 组装探测结果：补齐由 source/格式/设备信息推断出的坐标系。
 * @param source 已判定的平台来源
 * @param fileFormat 文件格式
 * @param hasRecordingDevice 是否含记录设备信息
 * @returns 完整的 FileSourceDetection
 */
function fallbackDetection(
  source: TrackSource,
  fileFormat: FileFormat,
  hasRecordingDevice: boolean,
): FileSourceDetection {
  return {
    source,
    hasRecordingDevice,
    sourceCoordSystem: resolveSourceCoordSystem(
      source,
      fileFormat,
      hasRecordingDevice,
    ),
  };
}

/**
 * 从 GPX 的 creator / metadata name 推断平台来源。
 * @param input GPX 文件内容
 * @returns 探测结果；GPX 导出通常无独立设备消息，hasRecordingDevice 为 false
 */
function detectGpxFileSource(input: BinaryInput): FileSourceDetection {
  // 先修裸 &，再按文本正则读属性，避免未转义 XML 导致匹配失败
  const xml = sanitizeXmlAmpersands(decodeUtf8(input));
  const creator = readXmlAttribute(xml, 'gpx', 'creator') ?? '';
  const metadataName = readFirstXmlText(xml, 'name') ?? '';

  if (/suunto/i.test(creator)) {
    return fallbackDetection(TRACK_SOURCE.suunto, FILE_FORMAT.gpx, false);
  }
  if (
    CODOON_CREATOR_PATTERN.test(creator) ||
    CODOON_GPX_NAME_PATTERN.test(metadataName)
  ) {
    return fallbackDetection(TRACK_SOURCE.codoon, FILE_FORMAT.gpx, false);
  }
  if (/garmin/i.test(creator)) {
    return fallbackDetection(TRACK_SOURCE.garmin, FILE_FORMAT.gpx, false);
  }
  return fallbackDetection(TRACK_SOURCE.manual, FILE_FORMAT.gpx, false);
}

/**
 * 从 TCX Notes 推断平台来源。
 * @param input TCX 文件内容
 * @returns Joyrun 匹配 Notes 日期格式；否则默认佳明
 */
function detectTcxFileSource(input: BinaryInput): FileSourceDetection {
  const xml = sanitizeXmlAmpersands(decodeUtf8(input));
  // Joyrun Notes 形如 2016-05-22_09-24-35_数字
  const notes = readFirstXmlText(xml, 'Notes') ?? readFirstXmlText(xml, 'notes') ?? '';
  if (JOYRUN_TCX_NOTES.test(notes.trim())) {
    return fallbackDetection(TRACK_SOURCE.joyrun, FILE_FORMAT.tcx, false);
  }
  return fallbackDetection(TRACK_SOURCE.garmin, FILE_FORMAT.tcx, false);
}

/**
 * 从 FIT deviceInfo / fileId 的 manufacturer 推断平台来源。
 * @param input FIT 文件内容
 * @returns 含设备信息时 hasRecordingDevice 为 true；解码失败则回退 manual
 */
async function detectFitFileSource(input: BinaryInput): Promise<FileSourceDetection> {
  try {
    const { messages } = await decodeFitBuffer(input);
    const deviceInfo = messages.deviceInfoMesgs?.[0] as
      | Record<string, unknown>
      | undefined;
    const fileId = messages.fileIdMesgs?.[0] as Record<string, unknown> | undefined;
    // 优先 deviceInfo，其次 fileId；空字符串表示文件未写厂商
    const manufacturer = String(
      deviceInfo?.manufacturer ?? fileId?.manufacturer ?? '',
    ).toLowerCase();

    if (manufacturer.includes('garmin')) {
      return fallbackDetection(TRACK_SOURCE.garmin, FILE_FORMAT.fit, true);
    }
    if (manufacturer.includes('suunto')) {
      return fallbackDetection(TRACK_SOURCE.suunto, FILE_FORMAT.fit, true);
    }
    if (manufacturer) {
      // 有厂商但未识别为已知平台，按手工/其他设备处理
      return fallbackDetection(TRACK_SOURCE.manual, FILE_FORMAT.fit, true);
    }
    // 无厂商字段的 FIT 常见于 Joyrun 再导出
    return fallbackDetection(TRACK_SOURCE.joyrun, FILE_FORMAT.fit, false);
  } catch {
    return fallbackDetection(TRACK_SOURCE.manual, FILE_FORMAT.fit, false);
  }
}

/**
 * 用正则读取 XML 起始标签上的属性值（轻量探测，不全量解析）。
 * @param xml XML 文本
 * @param tag 标签名（如 gpx）
 * @param attr 属性名（如 creator）
 * @returns 去空白后的属性值；未匹配时为 null
 */
function readXmlAttribute(xml: string, tag: string, attr: string): string | null {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`, 'i');
  const match = xml.match(pattern);
  return match?.[1]?.trim() ?? null;
}

/**
 * 读取 XML 中第一个指定标签的文本内容。
 * @param xml XML 文本
 * @param tag 标签名（如 name / Notes）
 * @returns 去掉 CDATA 包装后的文本；未匹配时为 null
 */
function readFirstXmlText(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(pattern);
  if (!match?.[1]) {
    return null;
  }
  // 部分导出把文本包在 CDATA 里，探测时需展开
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
}
