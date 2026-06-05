import type { PollKind } from './primitives/types.js';

export interface AsyncContinuationInput {
  kind: PollKind;
  id: string;
  requestId?: string | null;
  pollAfterMs?: number;
}

export function asyncContinuation({
  kind,
  id,
  requestId,
  pollAfterMs,
}: AsyncContinuationInput): Record<string, unknown> {
  const idField =
    kind === 'enrichment' ? 'enrichmentId' : kind === 'search' ? 'searchId' : 'operationId';
  const nextTool =
    kind === 'enrichment'
      ? 'get_enrichment'
      : kind === 'search'
        ? 'get_search_result'
        : 'get_operation';
  const safePollAfterMs =
    typeof pollAfterMs === 'number' && Number.isFinite(pollAfterMs)
      ? pollAfterMs
      : 10_000;
  const pollAfterSeconds = Math.max(
    1,
    Math.ceil(safePollAfterMs / 1_000),
  );
  return {
    status: 'still_running',
    still_running: true,
    [idField]: id,
    nextTool,
    nextInput: { id },
    pollAfterSeconds,
    message: `The request is still running. Use ${nextTool} with this ID to continue.`,
    ...(requestId ? { requestId } : {}),
  };
}
