import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
