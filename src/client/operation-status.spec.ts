import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAsyncStatus,
  isTerminalStatus,
  readStatus,
} from './operation-status.js';

test('readStatus normalizes top-level and nested statuses', () => {
  assert.equal(readStatus({ status: 'Succeeded' }), 'succeeded');
  assert.equal(readStatus({ data: { status: 'PARTIAL_SUCCESS' } }), 'partial_success');
  assert.equal(readStatus({ data: { status: 123 } }), null);
  assert.equal(readStatus(null), null);
});

test('operation status classification keeps async and terminal sets disjoint', () => {
  assert.equal(isAsyncStatus('queued'), true);
  assert.equal(isAsyncStatus('running'), true);
  assert.equal(isAsyncStatus('succeeded'), false);
  assert.equal(isTerminalStatus('queued'), false);
  assert.equal(isTerminalStatus('succeeded'), true);
  assert.equal(isTerminalStatus('failed'), true);
});
