import assert from 'node:assert/strict';
import test from 'node:test';
import { safePrinterText } from './safePrinterText.js';

test('removes ESC/POS, terminal and multiline control data', () => {
  assert.equal(safePrinterText('Kund\u001b[2J\nrad två\u0000'), 'Kund rad två');
});

test('bounds legacy database text', () => {
  assert.equal(safePrinterText('A'.repeat(500), 20), 'A'.repeat(20));
});
