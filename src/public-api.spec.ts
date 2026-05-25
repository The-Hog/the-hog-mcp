import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod/v4';
import {
  primitiveTools,
  registerToolDefinitions,
  workflowTools,
  type McpToolDefinition,
  type TheHogToolClient,
  type TheHogResponse,
  type ToolRequestContext,
} from './index.js';

test('root package exports shared tool definitions for remote MCP reuse', () => {
  assert.ok(primitiveTools.length > 0);
  assert.ok(workflowTools.length > 0);
  assert.ok(primitiveTools.some((tool) => tool.name === 'search_people'));
  assert.ok(workflowTools.some((tool) => tool.name === 'build_prospect_list'));
  assert.equal(typeof registerToolDefinitions, 'function');
});

test('root package exposes only the intended runtime library surface', async () => {
  const runtimeExports = Object.keys(await import('./index.js')).sort();
  assert.deepEqual(runtimeExports, [
    'primitiveTools',
    'registerPrimitiveTools',
    'registerToolDefinitions',
    'registerWorkflowTools',
    'workflowTools',
  ]);
});

test('tool registration resolves clients per request context', async () => {
  const requests: Array<{ requestId: string; request: unknown }> = [];
  const clientFor = (requestId: string): TheHogToolClient => ({
    request: async <T = unknown>(
      request: Parameters<TheHogToolClient['request']>[0],
    ): Promise<TheHogResponse<T>> => {
      requests.push({ requestId, request });
      return {
        data: { accepted: true, requestId } as T,
        status: 202,
        requestId,
      };
    },
    createIdempotencyKey: (prefix = 'remote') => `${prefix}_${requestId}`,
  });
  const clientsByRequestId = new Map<string, TheHogToolClient>([
    ['req_remote_1', clientFor('req_remote_1')],
    ['req_remote_2', clientFor('req_remote_2')],
  ]);
  const registered = {
    handler: undefined as
      | ((input: unknown, context: ToolRequestContext) => Promise<unknown>)
      | undefined,
  };
  const server = {
    registerTool: (
      _name: string,
      _config: unknown,
      callback: (input: unknown, context: ToolRequestContext) => Promise<unknown>,
    ) => {
      registered.handler = callback;
    },
  };
  const tools: McpToolDefinition[] = [
    {
      name: 'remote_test_tool',
      description: 'Tests remote client reuse.',
      inputSchema: { query: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      execute: async (input, scopedClient) => {
        const response = await scopedClient.request({
          method: 'POST',
          path: '/api/v1/search',
          body: input,
          idempotencyKey: scopedClient.createIdempotencyKey('remote_test_tool'),
        });
        return { response: response.data, requestId: response.requestId };
      },
    },
  ];

  registerToolDefinitions(server as never, tools, {
    getClient: (context) => {
      const client = clientsByRequestId.get(String(context.requestId));
      if (!client) {
        throw new Error(`No client for request ${String(context.requestId)}.`);
      }
      return client;
    },
  });

  const registeredHandler = registered.handler;
  assert.equal(typeof registeredHandler, 'function');
  if (!registeredHandler) {
    throw new Error('Expected tool handler to be registered.');
  }
  const result1 = (await registeredHandler(
    { query: 'founders' },
    fakeContext('req_remote_1'),
  )) as {
    content: Array<{ text?: string }>;
  };
  const result2 = (await registeredHandler(
    { query: 'engineers' },
    fakeContext('req_remote_2'),
  )) as {
    content: Array<{ text?: string }>;
  };
  const payload1 = JSON.parse(result1.content[0]?.text ?? '{}') as {
    ok?: boolean;
    requestId?: string;
    response?: unknown;
  };
  const payload2 = JSON.parse(result2.content[0]?.text ?? '{}') as {
    ok?: boolean;
    requestId?: string;
    response?: unknown;
  };
  assert.equal(payload1.ok, true);
  assert.equal(payload1.requestId, 'req_remote_1');
  assert.equal(payload2.ok, true);
  assert.equal(payload2.requestId, 'req_remote_2');
  assert.deepEqual(requests, [
    {
      requestId: 'req_remote_1',
      request: {
        method: 'POST',
        path: '/api/v1/search',
        body: { query: 'founders' },
        idempotencyKey: 'remote_test_tool_req_remote_1',
      },
    },
    {
      requestId: 'req_remote_2',
      request: {
        method: 'POST',
        path: '/api/v1/search',
        body: { query: 'engineers' },
        idempotencyKey: 'remote_test_tool_req_remote_2',
      },
    },
  ]);
});

function fakeContext(requestId: string): ToolRequestContext {
  return {
    requestId,
    signal: new AbortController().signal,
    sendNotification: async () => undefined,
    sendRequest: async () => {
      throw new Error('sendRequest is not used in this test.');
    },
  } as ToolRequestContext;
}
