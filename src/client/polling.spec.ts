import assert from 'node:assert/strict';
import test from 'node:test';
import { pollOperation } from './polling.js';

test('pollOperation treats partial_success as terminal', async () => {
  const requests: Array<{ method: string; path: string; timeoutMs?: number }> = [];
  const result = await pollOperation(
    {
      request: async (request: { method: string; path: string; timeoutMs?: number }) => {
        requests.push(request);
        return {
          data: { id: 'op_1', status: 'partial_success' },
          status: 200,
          requestId: 'req_1',
        };
      },
    } as never,
    'op_1',
    { timeoutSeconds: 1, intervalMs: 250 },
  );

  assert.equal(result.timedOut, false);
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.final, { id: 'op_1', status: 'partial_success' });
  assert.equal(requests[0]?.method, 'GET');
  assert.equal(requests[0]?.path, '/api/operations/op_1');
  assert.equal(typeof requests[0]?.timeoutMs, 'number');
});

test('pollOperation returns timedOut after non-terminal responses', async () => {
  const result = await pollOperation(
    {
      request: async () => {
        return {
          data: { id: 'op_1', status: 'running' },
          status: 200,
          requestId: 'req_1',
        };
      },
    } as never,
    'op_1',
    { timeoutSeconds: 0.001, intervalMs: 250 },
  );

  assert.equal(result.timedOut, true);
  assert.equal(result.attempts > 0, true);
  assert.deepEqual(result.final, { id: 'op_1', status: 'running' });
});
