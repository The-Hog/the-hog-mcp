import assert from 'node:assert/strict';
import test from 'node:test';
import { errorResult, jsonErrorResult, stringifyForMcp } from './format.js';

test('errorResult marks MCP tool calls as errors', () => {
  const result = errorResult(new Error('failed'));
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? '', /"ok": false/);
});

test('jsonErrorResult marks structured tool payloads as errors', () => {
  const result = jsonErrorResult({ ok: false, workflow: 'example', status: 'failed' });
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? '', /"status": "failed"/);
});

test('stringifyForMcp keeps truncated payloads under the text cap', () => {
  const text = stringifyForMcp({ value: '"'.repeat(80_000) });
  assert.equal(text.length <= 60_000, true);
  assert.match(text, /"truncated":\s*true/);
  assert.match(text, /"preview":/);
});
