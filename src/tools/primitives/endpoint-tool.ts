import {
  pollEnrichment,
  pollOperation,
  pollSearchResult,
} from '../../client/polling.js';
import {
  isAsyncStatus,
  isTerminalStatus,
  readStatus,
} from '../../client/operation-status.js';
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
    annotations: {
      readOnlyHint: method === 'GET',
      destructiveHint: options.requireConfirm === true || method === 'DELETE',
      idempotentHint:
        method === 'GET' || (options.idempotent === true && options.requireConfirm !== true),
      openWorldHint: options.openWorld ?? method !== 'GET',
      ...options.annotations,
    },
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

      const pollTarget = readPollTarget(response.data, options.poll);
      if (pollTarget && shouldPoll(input, response.status, response.data, options.poll)) {
        const pollResult =
          pollTarget.kind === 'search'
            ? await pollSearchResult(client, pollTarget.id, readPollOptions(input))
            : pollTarget.kind === 'enrichment'
              ? await pollEnrichment(client, pollTarget.id, readPollOptions(input))
              : await pollOperation(client, pollTarget.id, readPollOptions(input));
        return decorateResult(options, input, {
          initial: response.data,
          final: pollResult.final,
          timedOut: pollResult.timedOut,
          pollAttempts: pollResult.attempts,
          requestId: response.requestId,
        });
      }

      return decorateResult(options, input, {
        response: response.data,
        requestId: response.requestId,
      });
    },
  };
}

function decorateResult(
  options: EndpointToolOptions,
  input: ToolInput,
  result: unknown,
): unknown {
  return options.decorateResult ? options.decorateResult(result, input) : result;
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

function shouldPoll(
  input: ToolInput,
  responseStatus: number,
  responseData: unknown,
  configuredPoll: PollKind | undefined,
): boolean {
  if (input.waitForResult === false) {
    return false;
  }
  const status = readStatus(responseData);
  if (isTerminalStatus(status)) {
    return false;
  }
  if (input.waitForResult === true) {
    return true;
  }
  if (configuredPoll) {
    return true;
  }
  return isAsyncOperationResponse(responseStatus, responseData);
}

function readPollTarget(
  value: unknown,
  configuredPoll: PollKind | undefined,
): { kind: PollKind; id: string } | null {
  if (configuredPoll) {
    const id = readAsyncId(value, configuredPoll);
    return id ? { kind: configuredPoll, id } : null;
  }

  const operationId = readOperationId(value);
  return operationId ? { kind: 'operation', id: operationId } : null;
}

function isAsyncResponse(responseStatus: number, responseData: unknown): boolean {
  if (responseStatus === 202) {
    return true;
  }
  return isAsyncStatus(readStatus(responseData));
}

function isAsyncOperationResponse(responseStatus: number, responseData: unknown): boolean {
  return readOperationId(responseData) !== null && isAsyncResponse(responseStatus, responseData);
}

function readOperationId(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as { operationId?: unknown; data?: { operationId?: unknown } };
  if (typeof record.operationId === 'string') {
    return record.operationId;
  }
  if (typeof record.data?.operationId === 'string') {
    return record.data.operationId;
  }
  return null;
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
