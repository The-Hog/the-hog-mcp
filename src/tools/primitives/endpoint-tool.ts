import {
  pollEnrichment,
  pollOperation,
  pollSearchResult,
} from '../../client/polling.js';
import { stripUndefined } from '../../client/thehog-client.js';
import type {
  EndpointToolOptions,
  PollKind,
  PrimitiveToolDefinition,
  ToolInput,
} from './types.js';

export function endpointTool(options: EndpointToolOptions): PrimitiveToolDefinition {
  const method = options.method;
  const endpointPath = options.endpointPath;
  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    endpoint: { method, path: endpointPath },
    execute: async (input, client) => {
      if (options.requireConfirm && input.confirm !== true) {
        throw new Error('This destructive tool requires confirm: true.');
      }
      const path =
        typeof options.path === 'function' ? options.path(input) : options.path;
      const body =
        options.body != null
          ? options.body(input)
          : method === 'POST' || method === 'PATCH'
            ? omitControlFields(input)
            : undefined;
      const response = await client.request({
        method,
        path,
        query: options.query?.(input),
        body,
        idempotencyKey:
          options.idempotent && method !== 'GET'
            ? String(input.idempotencyKey ?? client.createIdempotencyKey(options.name))
            : undefined,
      });

      if (input.waitForResult === true && options.poll) {
        const id = readAsyncId(response.data, options.poll);
        if (!id) {
          return { response: response.data, requestId: response.requestId };
        }
        const pollResult =
          options.poll === 'search'
            ? await pollSearchResult(client, id, readPollOptions(input))
            : options.poll === 'enrichment'
              ? await pollEnrichment(client, id, readPollOptions(input))
              : await pollOperation(client, id, readPollOptions(input));
        return {
          initial: response.data,
          final: pollResult.final,
          timedOut: pollResult.timedOut,
          pollAttempts: pollResult.attempts,
          requestId: response.requestId,
        };
      }

      return { response: response.data, requestId: response.requestId };
    },
  };
}

export function omitControlFields(input: ToolInput): Record<string, unknown> {
  return stripUndefined(
    omit(input, ['waitForResult', 'timeoutSeconds', 'idempotencyKey', 'confirm']),
  ) as Record<string, unknown>;
}

export function omit(input: ToolInput, keys: string[]): Record<string, unknown> {
  const skipped = new Set(keys);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!skipped.has(key)) {
      output[key] = value;
    }
  }
  return output;
}

export function pick(input: ToolInput, keys: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) {
      output[key] = input[key];
    }
  }
  return output;
}

function readPollOptions(input: ToolInput): { timeoutSeconds?: number } {
  return typeof input.timeoutSeconds === 'number'
    ? { timeoutSeconds: input.timeoutSeconds }
    : {};
}

export function readAsyncId(value: unknown, pollKind: PollKind = 'operation'): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as {
    operationId?: unknown;
    id?: unknown;
    data?: { operationId?: unknown; id?: unknown };
  };
  if (pollKind === 'enrichment' || pollKind === 'search') {
    if (typeof record.id === 'string') return record.id;
    if (typeof record.data?.id === 'string') return record.data.id;
  }
  if (typeof record.operationId === 'string') return record.operationId;
  if (typeof record.id === 'string') return record.id;
  if (typeof record.data?.operationId === 'string') return record.data.operationId;
  if (typeof record.data?.id === 'string') return record.data.id;
  return null;
}
