import assert from 'node:assert/strict';
import test from 'node:test';
import { asyncContinuation } from './async-continuation.js';

test('asyncContinuation never emits non-finite polling handoff values', () => {
  for (const pollAfterMs of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    const continuation = asyncContinuation({
      kind: 'operation',
      id: 'op_1',
      pollAfterMs,
    });

    assert.equal(continuation.pollAfterSeconds, 10);
    assert.equal(Number.isFinite(continuation.pollAfterSeconds), true);
    assert.deepEqual(continuation.nextInput, { id: 'op_1' });
  }
});

test('asyncContinuation clamps negative polling hints to one second', () => {
  const continuation = asyncContinuation({
    kind: 'search',
    id: 'search_1',
    pollAfterMs: -500,
  });

  assert.deepEqual(continuation, {
    status: 'still_running',
    still_running: true,
    searchId: 'search_1',
    nextTool: 'get_search_result',
    nextInput: { id: 'search_1' },
    pollAfterSeconds: 1,
    message: 'The request is still running. Use get_search_result with this ID to continue.',
  });
});
