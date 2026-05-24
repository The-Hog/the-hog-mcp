import assert from 'node:assert/strict';
import test from 'node:test';
import { primitiveTools } from './definitions.js';

test('delete monitor requires confirmation', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'delete_monitor');
  assert.ok(tool);
  await assert.rejects(
    () =>
      tool.execute(
        { id: 'mon_1' },
        {
          request: async () => ({ data: null, status: 204, requestId: null }),
          createIdempotencyKey: () => 'idem',
        } as never,
      ),
    /confirm: true/,
  );
});

test('async primitive tools strip MCP controls, set idempotency, and poll when requested', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'search_companies');
  assert.ok(tool);

  const requests: Array<{
    method: string;
    path: string;
    body?: unknown;
    idempotencyKey?: string;
  }> = [];
  const result = await tool.execute(
    {
      query: 'AI infrastructure companies',
      limit: 5,
      waitForResult: true,
      timeoutSeconds: 5,
      idempotencyKey: 'idem_123',
    },
    {
      request: async (request: {
        method: string;
        path: string;
        body?: unknown;
        idempotencyKey?: string;
      }) => {
        requests.push(request);
        if (request.method === 'POST') {
          return {
            data: { operationId: 'op_123', status: 'queued' },
            status: 202,
            requestId: 'req_123',
          };
        }
        return {
          data: { id: 'op_123', status: 'completed', data: [{ name: 'Example' }] },
          status: 200,
          requestId: 'req_poll',
        };
      },
      createIdempotencyKey: () => 'generated_idem',
    } as never,
  );

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], {
    method: 'POST',
    path: '/api/v1/companies/search',
    query: undefined,
    body: { query: 'AI infrastructure companies', limit: 5 },
    idempotencyKey: 'idem_123',
  });
  assert.deepEqual(requests[1], {
    method: 'GET',
    path: '/api/operations/op_123',
    timeoutMs: 5000,
  });
  assert.deepEqual(result, {
    initial: { operationId: 'op_123', status: 'queued' },
    final: { id: 'op_123', status: 'completed', data: [{ name: 'Example' }] },
    timedOut: false,
    pollAttempts: 1,
    requestId: 'req_123',
  });
});

test('start_deep_research schema matches the public request body', () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'start_deep_research');
  assert.ok(tool);
  assert.deepEqual(Object.keys(tool.inputSchema).sort(), [
    'idempotencyKey',
    'inputAnchors',
    'model',
    'prompt',
    'schema',
    'timeoutSeconds',
    'urls',
    'waitForResult',
  ]);
});

test('enrichment polling uses the enrichment ID from queued responses', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'enrich_contacts');
  assert.ok(tool);

  const paths: string[] = [];
  await tool.execute(
    {
      identifiers: [{ linkedin_url: 'https://www.linkedin.com/in/example' }],
      fields: ['contact.email'],
      waitForResult: true,
      timeoutSeconds: 5,
    },
    {
      request: async (request: { method: string; path: string }) => {
        paths.push(request.path);
        if (request.method === 'POST') {
          return {
            data: {
              id: 'enrich_123',
              operationId: 'op_123',
              status: 'queued',
            },
            status: 202,
            requestId: 'req_enrich',
          };
        }
        return {
          data: { id: 'enrich_123', status: 'completed', data: [] },
          status: 200,
          requestId: 'req_poll',
        };
      },
      createIdempotencyKey: () => 'generated_idem',
    } as never,
  );

  assert.deepEqual(paths, ['/api/enrichments', '/api/enrichments/enrich_123']);
});
