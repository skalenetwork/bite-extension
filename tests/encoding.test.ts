import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bytesToHex,
  bytesToUtf8,
  ensure0x,
  hexToBytes,
  strip0x,
  toArrayBuffer,
  utf8ToBytes,
} from '../src/services/encoding.ts';

test('encoding helpers round-trip hex and utf8', () => {
  const original = '0x0123abcd';
  const bytes = hexToBytes(original);

  assert.equal(bytesToHex(bytes), '0123abcd');
  assert.equal(ensure0x(bytesToHex(bytes)), original);
  assert.equal(strip0x(original), '0123abcd');

  const text = 'BITE confidential';
  const encoded = utf8ToBytes(text);
  assert.equal(bytesToUtf8(encoded), text);
  assert.equal(toArrayBuffer(encoded).byteLength, encoded.byteLength);
});

test('hex helper handles empty values safely', () => {
  assert.equal(ensure0x(''), '0x');
  assert.equal(strip0x('0x'), '');
  assert.equal(bytesToHex(hexToBytes('0x')), '');
});
