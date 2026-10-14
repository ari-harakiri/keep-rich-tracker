import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractTextFromBuffer } from '../paystub-reader-core.mjs';

const fixture = new Uint8Array(await readFile(new URL('./simulated-paystub.pdf', import.meta.url)));
const text = await extractTextFromBuffer(fixture);

for (const expected of [
  'Pay Date: 10/16/2026',
  'Pay Period: 10/01/2026 - 10/15/2026',
  'Hours Worked 80.00',
  'Commission 30.00',
  'Gross Pay 1600.00',
  'Net Pay 1300.00'
]) {
  assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

console.log('paystub reader: simulated PDF extracted successfully');
