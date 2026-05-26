import { isTerminalStatus, readStatus } from './operation-status.js';
import type { TheHogToolClient } from './thehog-client.js';

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
    if (isTerminalStatus(status)) {
      return { final: latest, timedOut: false, attempts };
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }

  return { final: latest, timedOut: true, attempts };
}

function finiteNumberOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
