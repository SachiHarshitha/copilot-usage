import * as assert from 'assert';
import {
  escapeXml,
  formatNumber,
  excelSerialDate,
  excelSerialDateTime,
  cellRef,
  findRow,
  renderRow,
  replaceSheetData,
  stripCachedFormulaValues,
  setCellText,
  getCellText,
} from '../export/sheetXml';

const SHEET = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<x:sheetData>',
  '<x:row r="4" ht="20"><x:c r="A4" t="str" s="3"><x:v>Model</x:v></x:c><x:c r="B4" s="3" t="str"><x:v>Requests</x:v></x:c></x:row>',
  '<x:row r="5"><x:c r="A5" t="str" s="4"><x:v>seed</x:v></x:c><x:c r="B5" s="5" t="n"><x:v>1</x:v></x:c><x:c r="I5" s="6"/></x:row>',
  '</x:sheetData>',
  '</x:worksheet>',
].join('');

suite('Export: XML primitives', () => {
  test('escapeXml encodes markup and drops illegal control characters', () => {
    assert.strictEqual(escapeXml('a & b <c> "d"'), 'a &amp; b &lt;c&gt; &quot;d&quot;');
    assert.strictEqual(escapeXml('ok\u0000\u0007end'), 'okend');
    assert.strictEqual(escapeXml('keep\ttab\nnewline'), 'keep\ttab\nnewline');
  });

  test('formatNumber avoids exponent notation and float noise', () => {
    assert.strictEqual(formatNumber(0), '0');
    assert.strictEqual(formatNumber(1234567), '1234567');
    assert.strictEqual(formatNumber(-42), '-42');
    assert.strictEqual(formatNumber(9007199254740991), '9007199254740991');
    assert.strictEqual(formatNumber(0.1 + 0.2), '0.3');
    assert.strictEqual(formatNumber(Number.NaN), '0');
    assert.strictEqual(formatNumber(Number.POSITIVE_INFINITY), '0');
  });

  test('excelSerialDate matches known Excel serial numbers', () => {
    assert.strictEqual(excelSerialDate(new Date(2024, 0, 1)), 45292);
    assert.strictEqual(excelSerialDate(new Date(2025, 5, 15)), 45823);
    assert.strictEqual(excelSerialDate(new Date(2025, 5, 16)) - excelSerialDate(new Date(2025, 5, 15)), 1);
  });

  test('excelSerialDate is stable across a DST transition', () => {
    // Consecutive local calendar days must stay exactly one serial apart even when the
    // wall clock shifts, otherwise daily rows drift by a day in some timezones.
    const days = [
      new Date(2025, 2, 29),
      new Date(2025, 2, 30), // EU DST start
      new Date(2025, 2, 31),
      new Date(2025, 9, 25),
      new Date(2025, 9, 26), // EU DST end
      new Date(2025, 9, 27),
    ];
    for (let i = 1; i < days.length; i++) {
      const delta = excelSerialDate(days[i]) - excelSerialDate(days[i - 1]);
      const expected = Math.round((days[i].getTime() - days[i - 1].getTime()) / 86400000);
      if (expected === 1) {
        assert.strictEqual(delta, 1, `serial gap wrong around ${days[i].toDateString()}`);
      }
    }
  });

  test('excelSerialDateTime carries the time of day as a fraction', () => {
    const noon = excelSerialDateTime(new Date(2024, 0, 1, 12, 0, 0));
    assert.ok(Math.abs(noon - 45292.5) < 1e-6, `expected 45292.5, got ${noon}`);
  });

  test('cellRef builds A1 references', () => {
    assert.strictEqual(cellRef('A', 5), 'A5');
    assert.strictEqual(cellRef('AB', 120), 'AB120');
  });

  test('findRow returns the row element and throws when it is missing', () => {
    assert.ok(findRow(SHEET, 5).includes('r="A5"'));
    assert.throws(() => findRow(SHEET, 99), /row 99/);
  });

  test('renderRow renumbers, substitutes and preserves styles and filler cells', () => {
    const rendered = renderRow(findRow(SHEET, 5), 7, {
      A: { kind: 'text', value: 'gpt-4o & friends' },
      B: { kind: 'number', value: 250 },
    });

    assert.ok(rendered.startsWith('<x:row r="7"'), rendered);
    assert.ok(rendered.includes('r="A7"'));
    assert.ok(rendered.includes('r="B7"'));
    // Styles from the template cell survive.
    assert.ok(rendered.includes('s="4"'));
    assert.ok(rendered.includes('s="5"'));
    // The background filler cell is untouched apart from its reference.
    assert.ok(rendered.includes('<x:c r="I7" s="6"/>'));
    // Text is written as an inline string and escaped.
    assert.ok(rendered.includes('t="inlineStr"'));
    assert.ok(rendered.includes('gpt-4o &amp; friends'));
    assert.ok(rendered.includes('<x:v>250</x:v>'));
    // The old values are gone.
    assert.ok(!rendered.includes('seed'));
  });

  test('renderRow writes formulas with a cached result', () => {
    const rendered = renderRow(findRow(SHEET, 5), 5, {
      B: { kind: 'formula', formula: 'C5+D5', cached: 9 },
    });
    assert.ok(rendered.includes('<x:f>C5+D5</x:f><x:v>9</x:v>'));
  });

  test('renderRow keeps a template formula and replaces only its cached value', () => {
    const withFormula = '<x:row r="19"><x:c r="B19" s="7"><x:f>SUM(B5:B18)</x:f><x:v>0</x:v></x:c></x:row>';
    const rendered = renderRow(withFormula, 19, { B: { kind: 'cached', value: 1234 } });
    assert.ok(rendered.includes('<x:f>SUM(B5:B18)</x:f>'));
    assert.ok(rendered.includes('<x:v>1234</x:v>'));
    assert.ok(!rendered.includes('<x:v>0</x:v>'));
  });

  test('replaceSheetData swaps the row block and leaves the rest of the sheet alone', () => {
    const out = replaceSheetData(SHEET, '<x:row r="1"/>');
    assert.ok(out.includes('<x:sheetData><x:row r="1"/></x:sheetData>'));
    assert.ok(out.includes('</x:worksheet>'));
    assert.ok(!out.includes('r="A5"'));
  });

  test('stripCachedFormulaValues removes stale results but keeps the formulas', () => {
    const xml = '<x:c r="A1"><x:f>1+1</x:f><x:v>999</x:v></x:c><x:c r="B1" t="n"><x:v>7</x:v></x:c>';
    const out = stripCachedFormulaValues(xml);
    assert.ok(out.includes('<x:f>1+1</x:f>'));
    assert.ok(!out.includes('999'));
    // A plain literal keeps its value.
    assert.ok(out.includes('<x:v>7</x:v>'));
  });

  test('setCellText and getCellText round-trip through a template cell', () => {
    const updated = setCellText(SHEET, 'A5', 'Range: 30d & up');
    assert.strictEqual(getCellText(updated, 'A5'), 'Range: 30d & up');
    assert.ok(updated.includes('&amp;'));
  });
});
