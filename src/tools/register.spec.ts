import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod/v4';
import { registerToolDefinitions } from './register.js';
import type { TheHogToolClient } from '../client/thehog-client.js';
import type { McpToolDefinition } from './types.js';

test('failed workflow results are returned as MCP tool errors', async () => {
  let handler: unknown;
  let config: {
    annotations?: unknown;
  } = {};
  const server = {
    registerTool: (
      _name: string,
      toolConfig: unknown,
      callback: (input: unknown) => Promise<unknown>,
    ) => {
      config = toolConfig as typeof config;
      handler = callback;
    },
  };
  const tools: McpToolDefinition[] = [
    {
      name: 'build_prospect_list',
      description: 'Build a prospect list.',
      inputSchema: {
        query: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      execute: async () => ({
        workflow: 'build_prospect_list',
        status: 'failed',
        warnings: [{ step: 'companies', message: 'Search failed.' }],
      }),
    },
  ];

  registerToolDefinitions(server as never, tools, { getClient: () => stubClient });

  assert.equal(typeof handler, 'function');
  assert.deepEqual(config.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  });
  const result = (await (handler as (input: unknown, context: unknown) => Promise<unknown>)(
    {
      query: 'security startups',
    },
    {},
  )) as McpTextResult;
  const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
    ok?: boolean;
    tool?: string;
  };
  assert.equal(result.isError, true);
  assert.equal(payload.ok, false);
  assert.equal(payload.tool, 'build_prospect_list');
});

test('failed operation payloads returned by primitive status tools remain successful tool calls', async () => {
  let handler: unknown;
  const server = {
    registerTool: (
      _name: string,
      _config: unknown,
      callback: (input: unknown) => Promise<unknown>,
    ) => {
      handler = callback;
    },
  };
  const tools: McpToolDefinition[] = [
    {
      name: 'get_operation',
      description: 'Get an operation.',
      inputSchema: {
        id: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      execute: async () => ({
        id: 'op_1',
        status: 'failed',
        error: { message: 'The upstream operation failed.' },
      }),
    },
  ];

  registerToolDefinitions(server as never, tools, { getClient: () => stubClient });

  assert.equal(typeof handler, 'function');
  const result = (await (handler as (input: unknown, context: unknown) => Promise<unknown>)(
    {
      id: 'op_1',
    },
    {},
  )) as McpTextResult;
  const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
    ok?: boolean;
  };
  assert.equal(result.isError, undefined);
  assert.equal(payload.ok, true);
});

test('registered tools preserve explicit ok:false payloads', async () => {
  let handler: unknown;
  const server = {
    registerTool: (
      _name: string,
      _config: unknown,
      callback: (input: unknown) => Promise<unknown>,
    ) => {
      handler = callback;
    },
  };
  const tools: McpToolDefinition[] = [
    {
      name: 'explicit_failure_tool',
      description: 'test',
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      execute: async () => ({ ok: false, status: 'failed' }),
    },
  ];

  registerToolDefinitions(server as never, tools, { getClient: () => stubClient });

  assert.equal(typeof handler, 'function');
  const result = (await (handler as (input: unknown, context: unknown) => Promise<unknown>)(
    {},
    {},
  )) as McpTextResult;
  const payload = JSON.parse(result.content[0]?.text ?? '{}') as { ok?: boolean };
  assert.equal(payload.ok, false);
});

test('registered tool output strips provider fallback and planner internals', async () => {
  let handler: unknown;
  const server = {
    registerTool: (
      _name: string,
      _config: unknown,
      callback: (input: unknown) => Promise<unknown>,
    ) => {
      handler = callback;
    },
  };
  const tools: McpToolDefinition[] = [
    {
      name: 'sanitized_tool',
      description: 'test',
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      execute: async () => ({
        status: 'failed',
        error: {
          message: 'All scraping providers failed.',
          code: 'all_scraping_providers_failed',
          providersAttempted: ['apify-harvest-linkedin-profile-search'],
          providerErrors: [{ provider: 'apify', reason: 'timed out' }],
          fallbackReason: 'provider failed',
          plannerMode: 'relaxed',
        },
        note: 'A cloud provider partner is listed in the public profile.',
      }),
    },
  ];

  registerToolDefinitions(server as never, tools, { getClient: () => stubClient });

  assert.equal(typeof handler, 'function');
  const result = (await (handler as (input: unknown, context: unknown) => Promise<unknown>)(
    {},
    {},
  )) as McpTextResult;
  const text = result.content[0]?.text ?? '';
  assert.doesNotMatch(text, /fallback|planner|apify|scraping/i);
  assert.match(text, /request could not complete/i);
  assert.match(text, /cloud provider partner/);
});

interface McpTextResult {
  content: Array<{ text?: string }>;
  isError?: boolean;
}

const stubClient: TheHogToolClient = {
  request: async () => {
    throw new Error('stubClient.request is not used in this test.');
  },
  createIdempotencyKey: () => {
    throw new Error('stubClient.createIdempotencyKey is not used in this test.');
  },
};
