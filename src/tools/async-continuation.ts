import type { PollKind } from "./primitives/types.js";

export const MAX_RECOMMENDED_POLL_SECONDS = 180;

export interface AsyncContinuationInput {
  kind: PollKind;
  id: string;
  requestId?: string | null;
  pollAfterMs?: number;
  idempotencyKey?: string | null;
  correlationKey?: string | null;
  maxRecommendedPollSeconds?: number;
}

export function asyncContinuation({
  kind,
  id,
  requestId,
  pollAfterMs,
  idempotencyKey,
  correlationKey,
  maxRecommendedPollSeconds,
}: AsyncContinuationInput): Record<string, unknown> {
  const idField =
    kind === "enrichment"
      ? "enrichmentId"
      : kind === "search"
        ? "searchId"
        : "operationId";
  const nextTool =
    kind === "enrichment"
      ? "get_enrichment"
      : kind === "search"
        ? "get_search_result"
        : "get_operation";
  const safePollAfterMs =
    typeof pollAfterMs === "number" && Number.isFinite(pollAfterMs)
      ? pollAfterMs
      : 10_000;
  const pollAfterSeconds = Math.max(1, Math.ceil(safePollAfterMs / 1_000));
  const safeMaxRecommendedPollSeconds =
    typeof maxRecommendedPollSeconds === "number" &&
    Number.isFinite(maxRecommendedPollSeconds) &&
    maxRecommendedPollSeconds > 0
      ? Math.ceil(maxRecommendedPollSeconds)
      : MAX_RECOMMENDED_POLL_SECONDS;
  return {
    status: "still_running",
    still_running: true,
    [idField]: id,
    nextTool,
    nextInput: { id },
    pollAfterSeconds,
    maxRecommendedPollSeconds: safeMaxRecommendedPollSeconds,
    message:
      `The request is still running. Poll ${nextTool} with ${idField} "${id}" ` +
      `until it reaches a terminal status, or until maxRecommendedPollSeconds elapses. ` +
      `Do not reissue the original tool call; that can start duplicate paid work.`,
    ...(requestId ? { requestId } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(correlationKey ? { correlationKey } : {}),
  };
}
