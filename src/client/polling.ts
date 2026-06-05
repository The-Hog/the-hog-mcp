import { isTerminalStatus, readStatus } from './operation-status.js';
import type { TheHogToolClient } from './thehog-client.js';
import { TheHogApiError } from './errors.js';

export interface PollOptions {
  timeoutSeconds?: number;
  intervalMs?: number;
}

export interface PollResult {
  final: unknown;
  timedOut: boolean;
  attempts: number;
  nextPollAfterMs: number;
}

const DEFAULT_TIMEOUT_SECONDS = 90;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 10_000;
const POLL_BACKOFF_MS = [2_000, 5_000, 10_000] as const;

export async function pollOperation(
  client: TheHogToolClient,
  operationId: string,
  options: PollOptions = {},
): Promise<PollResult> {
  return pollPath(client, `/api/operations/${encodeURIComponent(operationId)}`, options);
}

export async function pollSearchResult(
  client: TheHogToolClient,
  searchId: string,
  options: PollOptions = {},
): Promise<PollResult> {
  return pollPath(client, `/api/v1/search/${encodeURIComponent(searchId)}`, options);
}

export async function pollEnrichment(
  client: TheHogToolClient,
  enrichmentId: string,
  options: PollOptions = {},
): Promise<PollResult> {
  return pollPath(client, `/api/enrichments/${encodeURIComponent(enrichmentId)}`, options);
}

async function pollPath(
  client: TheHogToolClient,
  path: string,
  options: PollOptions,
): Promise<PollResult> {
  const timeoutSeconds = finiteNumberOrDefault(
    options.timeoutSeconds,
    DEFAULT_TIMEOUT_SECONDS,
  );
  const intervalMs =
    typeof options.intervalMs === 'number' && Number.isFinite(options.intervalMs)
      ? Math.max(250, options.intervalMs)
      : null;
  const timeoutMs = Math.max(1, timeoutSeconds) * 1_000;
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let latest: unknown = null;
  let nextPollAfterMs = intervalMs ?? POLL_BACKOFF_MS[0];

  while (Date.now() < deadline) {
    attempts += 1;
    const timeoutMs = Math.max(1, deadline - Date.now());
    let response;
    try {
      response = await client.request({ method: 'GET', path, timeoutMs });
    } catch (error) {
      if (error instanceof TheHogApiError && error.status === 429) {
        nextPollAfterMs = Math.max(
          250,
          error.retryAfterMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS,
        );
        latest = {
          status: 'rate_limited',
          error: {
            status: 429,
            message: error.message,
            requestId: error.requestId,
            retryAfterSeconds: Math.ceil(nextPollAfterMs / 1_000),
          },
        };
        await sleepUntilDeadline(
          nextPollAfterMs,
          deadline,
        );
        continue;
      }
      throw error;
    }
    latest = response.data;
    const status = readStatus(latest);
    if (isTerminalStatus(status)) {
      return { final: latest, timedOut: false, attempts, nextPollAfterMs };
    }
    nextPollAfterMs = intervalMs ?? pollBackoffMsForAttempt(attempts);
    await sleepUntilDeadline(nextPollAfterMs, deadline);
  }

  return { final: latest, timedOut: true, attempts, nextPollAfterMs };
}

function finiteNumberOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function pollBackoffMsForAttempt(attempts: number): number {
  const index = Math.max(0, Math.min(POLL_BACKOFF_MS.length - 1, attempts - 1));
  return POLL_BACKOFF_MS[index];
}

function sleepUntilDeadline(ms: number, deadline: number): Promise<void> {
  return sleep(Math.min(ms, Math.max(0, deadline - Date.now())));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
