/**
 * Brings a template workbook into the shape the exporter patches.
 *
 * The template is authored in Excel, and every Excel save rewrites the package: worksheets lose
 * the `x:` namespace prefix, literal text moves into the shared string table, and a calculation
 * chain part appears. None of that changes what the template *means*, so it is normalised here
 * once instead of being special-cased in every reader and writer.
 */

import { XlsxParts, readPart, writePart } from './xlsxPackage';

const SHARED_STRINGS = 'xl/sharedStrings.xml';
const CALC_CHAIN = 'xl/calcChain.xml';
const CONTENT_TYPES = '[Content_Types].xml';
const WORKBOOK = 'xl/workbook.xml';
const WORKBOOK_RELS = 'xl/_rels/workbook.xml.rels';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Flatten `<si>` entries, concatenating rich-text runs into one string. */
function readSharedStrings(parts: XlsxParts): string[] {
  if (!parts[SHARED_STRINGS]) {
    return [];
  }
  const xml = readPart(parts, SHARED_STRINGS);
  return [...xml.matchAll(/<(?:x:)?si>([\s\S]*?)<\/(?:x:)?si>/g)].map(item =>
    [...item[1].matchAll(/<(?:x:)?t\b[^>]*>([\s\S]*?)<\/(?:x:)?t>/g)].map(run => run[1]).join(''),
  );
}

/**
 * Rewrite `t="s"` cells as inline strings. Rows are cloned and renumbered during export, so a
 * cell that only holds an index into a shared table cannot be read or rewritten in place.
 */
function inlineSharedStrings(sheetXml: string, strings: string[]): string {
  return sheetXml.replace(
    /<(x:)?c\b([^>]*)>\s*<(?:x:)?v>(\d+)<\/(?:x:)?v>\s*<\/(?:x:)?c>/g,
    (match, prefix: string | undefined, attrs: string, index: string) => {
      if (!/\bt="s"/.test(attrs)) {
        return match;
      }
      const text = strings[Number(index)];
      if (text === undefined) {
        return match;
      }
      const p = prefix ?? '';
      const kept = attrs.replace(/\s*\bt="s"/, '');
      return `<${p}c${kept} t="inlineStr"><${p}is><${p}t xml:space="preserve">${escapeXml(text)}</${p}t></${p}is></${p}c>`;
    },
  );
}

/**
 * Drop the calculation chain. It indexes formulas by cell, and the exporter moves formulas to
 * different rows, so a stale chain is exactly the kind of inconsistency Excel offers to repair.
 */
function dropCalcChain(parts: XlsxParts): void {
  if (!parts[CALC_CHAIN]) {
    return;
  }
  delete parts[CALC_CHAIN];

  if (parts[CONTENT_TYPES]) {
    writePart(
      parts,
      CONTENT_TYPES,
      readPart(parts, CONTENT_TYPES).replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ''),
    );
  }
  if (parts[WORKBOOK_RELS]) {
    writePart(
      parts,
      WORKBOOK_RELS,
      readPart(parts, WORKBOOK_RELS).replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/g, ''),
    );
  }
}

/** The dashboard is formula driven and ships without cached results, so viewers must recalculate. */
function forceFullCalcOnLoad(parts: XlsxParts): void {
  const xml = readPart(parts, WORKBOOK);
  if (/fullCalcOnLoad="1"/.test(xml)) {
    return;
  }

  const existing = xml.match(/<(x:)?calcPr\b[^>]*\/>/);
  if (existing) {
    const patched = existing[0].replace(/\s*\/>$/, ' fullCalcOnLoad="1"/>');
    writePart(parts, WORKBOOK, xml.replace(existing[0], () => patched));
    return;
  }

  writePart(
    parts,
    WORKBOOK,
    xml.replace(/<\/(x:)?workbook>/, (_match, prefix: string | undefined) => {
      const p = prefix ?? '';
      return `<${p}calcPr calcId="191029" fullCalcOnLoad="1"/></${p}workbook>`;
    }),
  );
}

export function normalizeTemplate(parts: XlsxParts): void {
  const strings = readSharedStrings(parts);
  if (strings.length > 0) {
    for (const name of Object.keys(parts)) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
        continue;
      }
      writePart(parts, name, inlineSharedStrings(readPart(parts, name), strings));
    }
  }

  dropCalcChain(parts);
  forceFullCalcOnLoad(parts);
}
