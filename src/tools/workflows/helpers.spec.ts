import assert from 'node:assert/strict';
import test from 'node:test';
import {
  continuationForStep,
  createWorkflowContext,
  runWorkflowStep,
  workflowIdempotencyKey,
} from './helpers.js';

test('workflow idempotency keys preserve distinct step suffixes', () => {
  const longKey = 'x'.repeat(256);
  const client = {
    createIdempotencyKey: () => 'generated',
  };

  const companies = workflowIdempotencyKey(
    client as never,
    { idempotencyKey: longKey },
    'build_prospect_list',
    'companies',
  );
  const people = workflowIdempotencyKey(
    client as never,
    { idempotencyKey: longKey },
    'build_prospect_list',
    'people',
  );

  assert.equal(companies.length, 256);
  assert.equal(people.length, 256);
  assert.notEqual(companies, people);
  assert.equal(companies.endsWith('_build_prospect_list_companies'), true);
  assert.equal(people.endsWith('_build_prospect_list_people'), true);
});

test('workflow idempotency keys ignore MCP control fields when generated', () => {
  const client = {
    createIdempotencyKey: () => 'generated',
  };

  const base = workflowIdempotencyKey(
    client as never,
    { query: 'global mobility', limit: 5 },
    'research_person',
    'research',
  );
  const withControls = workflowIdempotencyKey(
    client as never,
    {
      query: 'global mobility',
      limit: 5,
      waitForResult: true,
      timeoutSeconds: 1,
      idempotencyKey: '',
    },
    'research_person',
    'research',
  );

  assert.equal(base, withControls);
});

test('continuationForStep uses explicit poll completion instead of object identity', () => {
  const shared = { id: 'op_1', status: 'queued' };

  assert.equal(
    continuationForStep(
      {
        initial: shared,
        final: shared,
        requestId: 'req_1',
        asyncId: 'op_1',
        pollCompleted: true,
      },
      'operation',
    ),
    null,
  );

  assert.deepEqual(
    continuationForStep(
      {
        initial: shared,
        final: shared,
        requestId: 'req_1',
        asyncId: 'op_1',
        pollCompleted: false,
      },
      'operation',
    ),
    {
      status: 'still_running',
      still_running: true,
      operationId: 'op_1',
      nextTool: 'get_operation',
      nextInput: { id: 'op_1' },
      pollAfterSeconds: 10,
      message: 'The request is still running. Use get_operation with this ID to continue.',
      requestId: 'req_1',
    },
  );
});

test('timeout warnings point to the step async ID, not only child operation IDs', async () => {
  const ctx = createWorkflowContext('test_workflow');
  await runWorkflowStep(
    {
      request: async (request: { method: string }) => {
        if (request.method === 'POST') {
          return {
            data: { id: 'enrich_1', operationId: 'op_1', status: 'queued' },
            status: 202,
            requestId: 'req_1',
          };
        }
        return {
          data: { id: 'enrich_1', status: 'queued' },
          status: 200,
          requestId: 'req_poll',
        };
      },
    } as never,
    ctx,
    {
      step: 'enrich_contacts',
      method: 'POST',
      path: '/api/enrichments',
      poll: 'enrichment',
      timeoutSeconds: 1,
    },
  );

  assert.deepEqual(ctx.childOperationIds, ['op_1']);
  assert.equal(ctx.warnings[0]?.asyncId, 'enrich_1');
  assert.match(ctx.warnings[0]?.message ?? '', /async ID/);
});
