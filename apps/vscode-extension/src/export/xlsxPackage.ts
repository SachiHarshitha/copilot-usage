/**
 * Minimal read/modify/write access to an .xlsx (OOXML) package.
 *
 * The report is produced by patching a shipped template rather than generating a workbook
 * from scratch: spreadsheet libraries drop charts on a read/write round trip, and the
 * template's value is its four charts, its styling and its formula-driven dashboard.
 * Every part we do not explicitly rewrite is copied through untouched.
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export type XlsxParts = Record<string, Uint8Array>;

export function readXlsx(bytes: Uint8Array): XlsxParts {
  return unzipSync(bytes);
}

export function writeXlsx(parts: XlsxParts): Uint8Array {
  return zipSync(parts, { level: 6 });
}

/** Read a package part as UTF-8 text. Throws when the template does not match expectations. */
export function readPart(parts: XlsxParts, name: string): string {
  const part = parts[name];
  if (!part) {
    throw new Error(`Report template is missing the part "${name}".`);
  }
  return strFromU8(part);
}

export function writePart(parts: XlsxParts, name: string, xml: string): void {
  parts[name] = strToU8(xml);
}
