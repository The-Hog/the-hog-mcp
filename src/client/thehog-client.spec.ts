import assert from 'node:assert/strict';
import test from 'node:test';
import { TheHogClient, type FetchLike } from './thehog-client.js';
import { TheHogApiError } from './errors.js';

test('request sends bearer auth, idempotency, and JSON body', async () => {
  const apiKey = ['hog', 'live', 'test-key'].join('_');
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'x-request-id': 'req_1' },
    });
  };
  const client = new TheHogClient(
    { apiBaseUrl: 'https://developer.thehog.ai', apiKey },
    fetchImpl,
  );

  const result = await client.request({
    method: 'POST',
    path: '/api/v1/companies/search',
    body: { query: 'acme', limit: undefined },
    idempotencyKey: 'idem_1',
  });

  assert.equal(result.requestId, 'req_1');
  assert.equal(seen.length, 1);
  const headers = seen[0].init.headers as Headers;
  assert.deepEqual([...headers.keys()].sort(), [
    'accept',
    'authorization',
    'content-type',
    'idempotency-key',
    'user-agent',
  ]);
  assert.equal(headers.get('authorization'), `Bearer ${apiKey}`);
  assert.equal(headers.get('idempotency-key'), 'idem_1');
  assert.equal(seen[0].init.body, '{"query":"acme"}');
});

test('request sends access and secret key auth', async () => {
  const accessKey = ['ak', 'test-key'].join('_');
  const secretKey = ['sk', 'test-key'].join('_');
  const capturedHeaders: Headers[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    capturedHeaders.push(init?.headers as Headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const client = new TheHogClient(
    {
      apiBaseUrl: 'https://developer.thehog.ai',
      accessKey,
      secretKey,
    },
    fetchImpl,
  );

  await client.request({ method: 'GET', path: '/api/operations/op_1' });

  const headers = capturedHeaders[0];
  assert.equal(headers?.get('x-access-key'), accessKey);
  assert.equal(headers?.get('x-secret-key'), secretKey);
  assert.equal(headers?.get('authorization'), null);
});

test('request throws sanitized API error', async () => {
  const apiKey = ['hog', 'live', 'test-key'].join('_');
  const leakedKey = ['hog', 'live', 'should-redact'].join('_');
  const fetchImpl: FetchLike = async () =>
    new Response(
      JSON.stringify({
        statusCode: 401,
        message: `bad key ${leakedKey}`,
      }),
      { status: 401, headers: { 'x-request-id': 'req_bad' } },
    );
  const client = new TheHogClient(
    { apiBaseUrl: 'https://developer.thehog.ai', apiKey },
    fetchImpl,
  );

  await assert.rejects(
    () => client.request({ method: 'GET', path: '/api/operations/op_1' }),
    (error) => {
      assert.ok(error instanceof TheHogApiError);
      assert.equal(error.status, 401);
      assert.equal(error.requestId, 'req_bad');
      assert.match(JSON.stringify(error.toJSON()), /REDACTED/);
      assert.equal(JSON.stringify(error.toJSON()).includes(leakedKey), false);
      return true;
    },
  );
});

test('request redacts non-Error thrown values', async () => {
  const leakedKey = ['hog', 'live', 'non-error'].join('_');
  const fetchImpl: FetchLike = async () => {
    throw `failed with ${leakedKey}`;
  };
  const client = new TheHogClient(
    {
      apiBaseUrl: 'https://developer.thehog.ai',
      apiKey: ['hog', 'live', 'test-key'].join('_'),
    },
    fetchImpl,
  );

  await assert.rejects(
    () => client.request({ method: 'GET', path: '/api/operations/op_1' }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /REDACTED/);
      assert.equal(error.message.includes(leakedKey), false);
      return true;
    },
  );
});

test('request timeout covers response body reads', async () => {
  let aborted = false;
  const fetchImpl: FetchLike = async (_url, init) =>
    ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () =>
        new Promise<string>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    }) as Response;
  const client = new TheHogClient(
    {
      apiBaseUrl: 'https://developer.thehog.ai',
      apiKey: ['hog', 'live', 'test-key'].join('_'),
      requestTimeoutMs: 5,
    },
    fetchImpl,
  );

  await assert.rejects(
    () => client.request({ method: 'GET', path: '/api/operations/op_1' }),
    /timed out after 5ms/,
  );
  assert.equal(aborted, true);
});

test('request aborts when the timeout is reached', async () => {
  const fetchImpl: FetchLike = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  const client = new TheHogClient(
    {
      apiBaseUrl: 'https://developer.thehog.ai',
      apiKey: ['hog', 'live', 'test-key'].join('_'),
      requestTimeoutMs: 5,
    },
    fetchImpl,
  );

  await assert.rejects(
    () => client.request({ method: 'GET', path: '/api/operations/op_1' }),
    /timed out after 5ms/,
  );
});
