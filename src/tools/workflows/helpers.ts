import { normalizeError } from "../../client/errors.js";
import {
  DEEP_RESEARCH_MAX_INLINE_WAIT_SECONDS,
  inlineRequestTimeoutMs,
  pollEnrichment,
  pollOperation,
} from "../../client/polling.js";
import { stableIdempotencyKey } from "../../client/idempotency.js";
import { isTerminalStatus, readStatus } from "../../client/operation-status.js";
import type {
  HttpMethod,
  TheHogRequest,
  TheHogToolClient,
} from "../../client/thehog-client.js";
import { readAsyncId } from "../primitives/endpoint-tool.js";
import { asyncContinuation } from "../async-continuation.js";
import type { ToolInput } from "../types.js";
import type { WorkflowContext, WorkflowStepResult } from "./types.js";

export type WorkflowPollKind = "operation" | "enrichment";

export interface WorkflowRequestOptions {
  step: string;
  method: HttpMethod;
  path: string;
  body?: unknown;
  query?: Record<string, unknown>;
  idempotencyKey?: string;
  poll?: WorkflowPollKind;
  waitForResult?: boolean;
  timeoutSeconds?: number;
  correlationKey?: string;
}

export function createWorkflowContext(name: string): WorkflowContext {
  return {
    name,
    warnings: [],
    childOperationIds: [],
    requestIds: [],
  };
}

export function workflowStatus(
  ctx: WorkflowContext,
  completedSteps: number,
): string {
  if (completedSteps === 0) return "failed";
  return ctx.warnings.length > 0 ? "partial_success" : "success";
}

export async function requestWorkflowStep(
  client: TheHogToolClient,
  ctx: WorkflowContext,
  options: WorkflowRequestOptions,
): Promise<WorkflowStepResult> {
  const startedAtMs = Date.now();
  const request: TheHogRequest = {
    method: options.method,
    path: options.path,
    query: options.query,
    body: options.body,
    idempotencyKey: options.idempotencyKey,
    ...(options.poll && options.waitForResult !== false
      ? { timeoutMs: inlineRequestTimeoutMs(options.timeoutSeconds) }
      : {}),
  };
  const response = await client.request(request);
  if (response.requestId) {
    ctx.requestIds.push(response.requestId);
  }
  const correlationKey = readWorkflowCorrelationKey(options);

  const operationId = readAsyncId(response.data, "operation");
  if (operationId) {
    ctx.childOperationIds.push(operationId);
  }
  const asyncId = readAsyncId(response.data, options.poll);

  if (options.poll && options.waitForResult !== false && asyncId) {
    const pollOptions =
      typeof options.timeoutSeconds === "number"
        ? { timeoutSeconds: options.timeoutSeconds, startedAtMs }
        : { startedAtMs };
    const pollResult =
      options.poll === "enrichment"
        ? await pollEnrichment(client, asyncId, pollOptions)
        : await pollOperation(client, asyncId, pollOptions);
    return {
      initial: response.data,
      final: pollResult.final,
      requestId: response.requestId,
      asyncId,
      pollCompleted: !pollResult.timedOut,
      timedOut: pollResult.timedOut,
      pollAttempts: pollResult.attempts,
      nextPollAfterMs: pollResult.nextPollAfterMs,
      idempotencyKey: options.idempotencyKey ?? null,
      correlationKey,
    };
  }

  return {
    initial: response.data,
    final: response.data,
    requestId: response.requestId,
    asyncId,
    pollCompleted: false,
    idempotencyKey: options.idempotencyKey ?? null,
    correlationKey,
  };
}

export async function runWorkflowStep(
  client: TheHogToolClient,
  ctx: WorkflowContext,
  options: WorkflowRequestOptions,
): Promise<WorkflowStepResult | null> {
  try {
    const result = await requestWorkflowStep(client, ctx, options);
    if (result.timedOut) {
      const asyncId = result.asyncId;
      const resumeTool =
        options.poll === "enrichment" ? "get_enrichment" : "get_operation";
      if (!asyncId) {
        ctx.warnings.push({
          step: options.step,
          message:
            "Timed out while waiting for this step, but it is still processing on the server.",
        });
        return result;
      }

      ctx.warnings.push({
        step: options.step,
        message:
          `Timed out while waiting for this step, but it is still processing on the server. ` +
          `Re-attach by calling the ${resumeTool} tool with async ID "${asyncId}" to fetch ` +
          `the result once it is ready; re-attaching does not consume additional credits. ` +
          `Do not re-issue this call, which would start new work and incur new credits.`,
        asyncId,
        status: "still_running" as const,
        nextTool: resumeTool,
        nextInput: { id: asyncId },
        ...(result.idempotencyKey
          ? { idempotencyKey: result.idempotencyKey }
          : {}),
        ...(result.correlationKey
          ? { correlationKey: result.correlationKey }
          : {}),
      });
    }
    return result;
  } catch (error) {
    ctx.warnings.push({
      step: options.step,
      message: "The workflow could not complete this step.",
      error: normalizeError(error),
    });
    return null;
  }
}

export function waitForResult(input: ToolInput): boolean {
  return input.waitForResult !== false;
}

export function timeoutSeconds(input: ToolInput): number | undefined {
  return typeof input.timeoutSeconds === "number"
    ? input.timeoutSeconds
    : undefined;
}

export function workflowIdempotencyKey(
  client: TheHogToolClient,
  input: ToolInput,
  workflowName: string,
  step: string,
): string {
  if (typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()) {
    const suffix = `_${workflowName}_${step}`;
    const clean = input.idempotencyKey.trim();
    return `${clean.slice(0, Math.max(1, 256 - suffix.length))}${suffix}`;
  }
  void client;
  return stableIdempotencyKey(`${workflowName}_${step}`, {
    workflow: workflowName,
    step,
    input: omitWorkflowControlFields(input),
  });
}

export function omitWorkflowControlFields(
  input: ToolInput,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      key === "waitForResult" ||
      key === "timeoutSeconds" ||
      key === "idempotencyKey" ||
      key === "correlationKey"
    ) {
      continue;
    }
    output[key] = value;
  }
  return output;
}

export function extractItems(
  value: unknown,
  preferredKeys: string[] = [],
): unknown[] {
  const queue = unwrapKnownContainers(value);
  const keys = [
    ...preferredKeys,
    "data",
    "results",
    "items",
    "companies",
    "people",
  ];
  for (const current of queue) {
    if (!isRecord(current)) continue;
    for (const key of keys) {
      const child = current[key];
      if (Array.isArray(child)) {
        return child;
      }
    }
  }
  return [];
}

export function compactForAnchor(value: unknown, maxChars = 12_000): unknown {
  const text = JSON.stringify(value);
  if (text.length <= maxChars) {
    return value;
  }
  return {
    truncated: true,
    preview: text.slice(0, maxChars),
  };
}

export function uniqueStrings(
  values: Array<string | null | undefined>,
): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = value?.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

export function readString(value: unknown, keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const child = value[key];
    if (typeof child === "string" && child.trim()) {
      return child.trim();
    }
  }
  return null;
}

export function readNestedString(
  value: unknown,
  paths: string[][],
): string | null {
  for (const path of paths) {
    let current = value;
    for (const key of path) {
      if (!isRecord(current)) {
        current = null;
        break;
      }
      current = current[key];
    }
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }
  return null;
}

export function toUrl(value: string): string {
  const clean = value.trim();
  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }
  return `https://${clean}`;
}

export function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numberValue =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.trunc(numberValue)));
}

export function workflowSummary(
  ctx: WorkflowContext,
  completedSteps: number,
): {
  workflow: string;
  status: string;
  childOperationIds: string[];
  requestIds: string[];
  warnings: typeof ctx.warnings;
} {
  return {
    workflow: ctx.name,
    status: workflowStatus(ctx, completedSteps),
    childOperationIds: [...new Set(ctx.childOperationIds)],
    requestIds: [...new Set(ctx.requestIds)],
    warnings: ctx.warnings,
  };
}

export function pollFields(
  input: ToolInput,
): Pick<
  WorkflowRequestOptions,
  "waitForResult" | "timeoutSeconds" | "correlationKey"
> {
  return {
    waitForResult: waitForResult(input),
    timeoutSeconds: timeoutSeconds(input),
    ...correlationFieldFromInput(input),
  };
}

export function deepResearchPollFields(
  input: ToolInput,
): Pick<
  WorkflowRequestOptions,
  "waitForResult" | "timeoutSeconds" | "correlationKey"
> {
  return asyncFirstPollFields(input);
}

export function asyncFirstPollFields(
  input: ToolInput,
): Pick<
  WorkflowRequestOptions,
  "waitForResult" | "timeoutSeconds" | "correlationKey"
> {
  if (input.waitForResult !== true) {
    return { waitForResult: false, ...correlationFieldFromInput(input) };
  }
  const requested =
    timeoutSeconds(input) ?? DEEP_RESEARCH_MAX_INLINE_WAIT_SECONDS;
  return {
    waitForResult: true,
    timeoutSeconds: Math.min(requested, DEEP_RESEARCH_MAX_INLINE_WAIT_SECONDS),
    ...correlationFieldFromInput(input),
  };
}

export function enrichmentPollFields(
  input: ToolInput,
): Pick<
  WorkflowRequestOptions,
  "waitForResult" | "timeoutSeconds" | "correlationKey"
> {
  const requested =
    timeoutSeconds(input) ?? DEEP_RESEARCH_MAX_INLINE_WAIT_SECONDS;
  return {
    waitForResult: true,
    timeoutSeconds: Math.min(requested, DEEP_RESEARCH_MAX_INLINE_WAIT_SECONDS),
    ...correlationFieldFromInput(input),
  };
}

export function pollMetadata(step: WorkflowStepResult | null): {
  timedOut?: boolean;
  pollAttempts?: number;
  asyncId?: string;
} {
  return {
    ...(step?.asyncId ? { asyncId: step.asyncId } : {}),
    ...(step?.timedOut !== undefined ? { timedOut: step.timedOut } : {}),
    ...(step?.pollAttempts !== undefined
      ? { pollAttempts: step.pollAttempts }
      : {}),
  };
}

export function continuationForStep(
  step: WorkflowStepResult | null,
  pollKind: WorkflowPollKind,
): Record<string, unknown> | null {
  if (!step?.asyncId) return null;
  if (step.timedOut !== true && step.pollCompleted) return null;
  if (step.timedOut !== true && isTerminalStepStatus(step.final)) return null;
  return asyncContinuation({
    kind: pollKind,
    id: step.asyncId,
    requestId: step.requestId,
    pollAfterMs: step.nextPollAfterMs,
    idempotencyKey: step.idempotencyKey,
    correlationKey: step.correlationKey,
  });
}

function readWorkflowCorrelationKey(
  options: WorkflowRequestOptions,
): string | null {
  return options.correlationKey?.trim() || options.idempotencyKey || null;
}

function correlationFieldFromInput(
  input: ToolInput,
): Pick<WorkflowRequestOptions, "correlationKey"> {
  return typeof input.correlationKey === "string" && input.correlationKey.trim()
    ? { correlationKey: input.correlationKey.trim() }
    : {};
}

function isTerminalStepStatus(value: unknown): boolean {
  return isTerminalStatus(readStatus(value));
}

function unwrapKnownContainers(value: unknown): unknown[] {
  const output: unknown[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const visited = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > 5) continue;
    if (current.value && typeof current.value === "object") {
      if (visited.has(current.value)) continue;
      visited.add(current.value);
    }
    output.push(current.value);
    if (!isRecord(current.value)) continue;
    for (const key of ["final", "result", "response", "data"]) {
      if (key in current.value) {
        queue.push({ value: current.value[key], depth: current.depth + 1 });
      }
    }
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
