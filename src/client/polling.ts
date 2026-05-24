import type { TheHogClient } from './thehog-client.js';

export interface PollOptions {
  timeoutSeconds?: number;
  intervalMs?: number;
}

export interface PollResult {
  final: unknown;
  timedOut: boolean;
  attempts: number;
}

const DEFAULT_TIMEOUT_SECONDS = 90;
const DEFAULT_INTERVAL_MS = 2_000;
const TERMINAL_STATUSES = new Set([
  'succeeded',
  'completed',
  'complete',
  'failed',
  'error',
  'cancelled',
  'canceled',
  'partial_success',
]);

export async function pollOperation(
  client: TheHogClient,
  operationId: string,
  options: PollOptions = {},
): Promise<PollResult> {
  return pollPath(client, `/api/operations/${encodeURIComponent(operationId)}`, options);
}

export async function pollSearchResult(
  client: TheHogClient,
  searchId: string,
  options: PollOptions = {},
): Promise<PollResult> {
  return pollPath(client, `/api/v1/search/${encodeURIComponent(searchId)}`, options);
}

export async function pollEnrichment(
  client: TheHogClient,
  enrichmentId: string,
  options: PollOptions = {},
): Promise<PollResult> {
  return pollPath(client, `/api/enrichments/${encodeURIComponent(enrichmentId)}`, options);
}

async function pollPath(
  client: TheHogClient,
  path: string,
  options: PollOptions,
): Promise<PollResult> {
  const timeoutSeconds = finiteNumberOrDefault(
    options.timeoutSeconds,
    DEFAULT_TIMEOUT_SECONDS,
  );
  const intervalValueMs = finiteNumberOrDefault(options.intervalMs, DEFAULT_INTERVAL_MS);
  const timeoutMs = Math.max(1, timeoutSeconds) * 1_000;
  const intervalMs = Math.max(250, intervalValueMs);
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let latest: unknown = null;

  while (Date.now() < deadline) {
    attempts += 1;
    const timeoutMs = Math.max(1, deadline - Date.now());
    const response = await client.request({ method: 'GET', path, timeoutMs });
    latest = response.data;
    const status = readStatus(latest);
    if (status && TERMINAL_STATUSES.has(status)) {
      return { final: latest, timedOut: false, attempts };
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }

  return { final: latest, timedOut: true, attempts };
}

function readStatus(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const status = (value as { status?: unknown }).status;
  return typeof status === 'string' ? status.toLowerCase() : null;
}

function finiteNumberOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
