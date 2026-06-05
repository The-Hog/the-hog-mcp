import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { pollBackoffMsForAttempt, pollOperation } from './polling.js';
import { TheHogApiError } from './errors.js';

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

test('pollOperation treats nested data.status as terminal', async () => {
  const result = await pollOperation(
    {
      request: async () => ({
        data: { id: 'op_1', data: { status: 'succeeded', results: [] } },
        status: 200,
        requestId: 'req_1',
      }),
    } as never,
    'op_1',
    { timeoutSeconds: 1, intervalMs: 250 },
  );

  assert.equal(result.timedOut, false);
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.final, {
    id: 'op_1',
    data: { status: 'succeeded', results: [] },
  });
});

test('pollOperation continues past nested non-terminal status', async () => {
  let calls = 0;
  const result = await pollOperation(
    {
      request: async () => {
        calls += 1;
        return {
          data:
            calls === 1
              ? { id: 'op_1', data: { status: 'running' } }
              : { id: 'op_1', data: { status: 'succeeded', results: ['done'] } },
          status: 200,
          requestId: 'req_1',
        };
      },
    } as never,
    'op_1',
    { timeoutSeconds: 1, intervalMs: 250 },
  );

  assert.equal(result.timedOut, false);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.final, {
    id: 'op_1',
    data: { status: 'succeeded', results: ['done'] },
  });
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
  assert.equal(result.nextPollAfterMs, 250);
  assert.deepEqual(result.final, { id: 'op_1', status: 'running' });
});

test('pollOperation uses 2s -> 5s -> 10s default polling backoff', () => {
  assert.equal(pollBackoffMsForAttempt(1), 2_000);
  assert.equal(pollBackoffMsForAttempt(2), 5_000);
  assert.equal(pollBackoffMsForAttempt(3), 10_000);
  assert.equal(pollBackoffMsForAttempt(10), 10_000);
});

test('pollOperation falls back to safe timing defaults for non-finite options', async () => {
  const requests: Array<{ timeoutMs?: number }> = [];
  const result = await pollOperation(
    {
      request: async (request: { timeoutMs?: number }) => {
        requests.push(request);
        return {
          data: { id: 'op_1', status: 'completed' },
          status: 200,
          requestId: 'req_1',
        };
      },
    } as never,
    'op_1',
    { timeoutSeconds: Number.POSITIVE_INFINITY, intervalMs: Number.NaN },
  );

  assert.equal(result.timedOut, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.nextPollAfterMs, 2_000);
  assert.equal(
    typeof requests[0]?.timeoutMs === 'number' && Number.isFinite(requests[0].timeoutMs),
    true,
  );
});

test('pollOperation backs off and continues after a 429 poll response', async () => {
  let attempts = 0;
  const result = await pollOperation(
    {
      request: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new TheHogApiError(
            'Too many poll requests',
            429,
            'req_rate_limited',
            { message: 'Too many poll requests' },
            1,
          );
        }
        return {
          data: { id: 'op_1', status: 'succeeded' },
          status: 200,
          requestId: 'req_2',
        };
      },
    } as never,
    'op_1',
    { timeoutSeconds: 1, intervalMs: 250 },
  );

  assert.equal(result.timedOut, false);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.final, { id: 'op_1', status: 'succeeded' });
});

test('pollOperation waits for Retry-After before polling again after a 429', async (t) => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  t.after(() => mock.timers.reset());

  const requestTimes: number[] = [];
  let attempts = 0;
  const resultPromise = pollOperation(
    {
      request: async () => {
        requestTimes.push(Date.now());
        attempts += 1;
        if (attempts === 1) {
          throw new TheHogApiError(
            'Too many poll requests',
            429,
            'req_rate_limited',
            { message: 'Too many poll requests' },
            1_000,
          );
        }
        return {
          data: { id: 'op_1', status: 'succeeded' },
          status: 200,
          requestId: 'req_2',
        };
      },
    } as never,
    'op_1',
    { timeoutSeconds: 3, intervalMs: 250 },
  );

  await flushMicrotasks();
  assert.deepEqual(requestTimes, [0]);

  mock.timers.tick(999);
  await flushMicrotasks();
  assert.deepEqual(requestTimes, [0]);

  mock.timers.tick(1);
  await flushMicrotasks();

  const result = await resultPromise;
  assert.equal(result.timedOut, false);
  assert.equal(result.attempts, 2);
  assert.equal(result.nextPollAfterMs, 1_000);
  assert.deepEqual(requestTimes, [0, 1_000]);
});

test('pollOperation returns Retry-After cadence when 429 persists through timeout', async () => {
  const result = await pollOperation(
    {
      request: async () => {
        throw new TheHogApiError(
          'Too many poll requests',
          429,
          'req_rate_limited',
          { message: 'Too many poll requests' },
          250,
        );
      },
    } as never,
    'op_1',
    { timeoutSeconds: 0.001 },
  );

  assert.equal(result.timedOut, true);
  assert.equal(result.nextPollAfterMs, 250);
  assert.deepEqual(result.final, {
    status: 'rate_limited',
    error: {
      status: 429,
      message: 'Too many poll requests',
      requestId: 'req_rate_limited',
      retryAfterSeconds: 1,
    },
  });
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
