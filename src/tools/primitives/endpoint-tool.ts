import { z } from "zod/v4";
import {
  inlineRequestTimeoutMs,
  pollEnrichment,
  pollOperation,
  pollSearchResult,
} from "../../client/polling.js";
import { isTerminalStatus, readStatus } from "../../client/operation-status.js";
import { stableIdempotencyKey } from "../../client/idempotency.js";
import { stripUndefined } from "../../client/thehog-client.js";
import { asyncContinuation } from "../async-continuation.js";
import type {
  EndpointToolOptions,
  PollKind,
  PrimitiveToolDefinition,
  ToolInput,
} from "./types.js";

export function endpointTool(
  options: EndpointToolOptions,
): PrimitiveToolDefinition {
  const method = options.method;
  const endpointPath = options.endpointPath;
  const inputSchema = z.object(options.inputSchema).passthrough();
  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    annotations: {
      readOnlyHint: method === "GET",
      destructiveHint: options.requireConfirm === true || method === "DELETE",
      idempotentHint:
        method === "GET" ||
        (options.idempotent === true && options.requireConfirm !== true),
      openWorldHint: options.openWorld ?? method !== "GET",
      ...options.annotations,
    },
    endpoint: { method, path: endpointPath },
    execute: async (rawInput, client) => {
      if (options.requireConfirm && rawInput.confirm !== true) {
        throw new Error("This destructive tool requires confirm: true.");
      }
      const input = inputSchema.parse(rawInput) as ToolInput;
      const startedAtMs = Date.now();
      const path =
        typeof options.path === "function" ? options.path(input) : options.path;
      const body =
        options.body != null
          ? options.body(input)
          : method === "POST" || method === "PATCH"
            ? omitControlFields(input)
            : undefined;
      const query = options.query?.(input);
      const idempotencyKey =
        options.idempotent && method !== "GET"
          ? String(
              input.idempotencyKey ??
                stableIdempotencyKey(options.name, {
                  tool: options.name,
                  method,
                  path,
                  query,
                  body,
                }),
            )
          : undefined;
      const correlationKey = readCorrelationKey(input, idempotencyKey);
      const response = await client.request({
        method,
        path,
        query,
        body,
        idempotencyKey,
        ...(input.waitForResult === true
          ? { timeoutMs: inlineRequestTimeoutMs(input.timeoutSeconds) }
          : {}),
      });

      const pollTarget = readPollTarget(response.data, options.poll);
      if (pollTarget) {
        if (isTerminalStatus(readStatus(response.data))) {
          return { response: response.data, requestId: response.requestId };
        }
        if (input.waitForResult !== true) {
          return asyncContinuation({
            kind: pollTarget.kind,
            id: pollTarget.id,
            requestId: response.requestId,
            pollAfterMs: 10_000,
            idempotencyKey,
            correlationKey,
          });
        }
        const pollResult =
          pollTarget.kind === "search"
            ? await pollSearchResult(
                client,
                pollTarget.id,
                readPollOptions(input, startedAtMs),
              )
            : pollTarget.kind === "enrichment"
              ? await pollEnrichment(
                  client,
                  pollTarget.id,
                  readPollOptions(input, startedAtMs),
                )
              : await pollOperation(
                  client,
                  pollTarget.id,
                  readPollOptions(input, startedAtMs),
                );
        if (pollResult.timedOut) {
          return asyncContinuation({
            kind: pollTarget.kind,
            id: pollTarget.id,
            requestId: response.requestId,
            pollAfterMs: pollResult.nextPollAfterMs,
            idempotencyKey,
            correlationKey,
          });
        }
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
    omit(input, [
      "waitForResult",
      "timeoutSeconds",
      "idempotencyKey",
      "correlationKey",
      "confirm",
    ]),
  ) as Record<string, unknown>;
}

export function omit(
  input: ToolInput,
  keys: string[],
): Record<string, unknown> {
  const skipped = new Set(keys);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!skipped.has(key)) {
      output[key] = value;
    }
  }
  return output;
}

export function pick(
  input: ToolInput,
  keys: string[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) {
      output[key] = input[key];
    }
  }
  return output;
}

function readPollOptions(
  input: ToolInput,
  startedAtMs: number,
): { timeoutSeconds?: number; startedAtMs: number } {
  return {
    ...(typeof input.timeoutSeconds === "number"
      ? { timeoutSeconds: input.timeoutSeconds }
      : {}),
    startedAtMs,
  };
}

function readCorrelationKey(
  input: ToolInput,
  idempotencyKey: string | undefined,
): string | undefined {
  return typeof input.correlationKey === "string" && input.correlationKey.trim()
    ? input.correlationKey.trim()
    : idempotencyKey;
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
  return operationId ? { kind: "operation", id: operationId } : null;
}

function readOperationId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    operationId?: unknown;
    data?: { operationId?: unknown };
  };
  if (typeof record.operationId === "string") {
    return record.operationId;
  }
  if (typeof record.data?.operationId === "string") {
    return record.data.operationId;
  }
  return null;
}

export function readAsyncId(
  value: unknown,
  pollKind: PollKind = "operation",
): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    operationId?: unknown;
    id?: unknown;
    data?: { operationId?: unknown; id?: unknown };
  };
  if (pollKind === "enrichment" || pollKind === "search") {
    if (typeof record.id === "string") return record.id;
    if (typeof record.data?.id === "string") return record.data.id;
  }
  if (typeof record.operationId === "string") return record.operationId;
  if (typeof record.id === "string") return record.id;
  if (typeof record.data?.operationId === "string")
    return record.data.operationId;
  if (typeof record.data?.id === "string") return record.data.id;
  return null;
}
