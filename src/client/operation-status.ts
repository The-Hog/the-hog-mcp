export const ASYNC_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "pending",
  "running",
  "processing",
  "in_progress",
  "started",
  "scheduled",
]);

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "succeeded",
  "completed",
  "complete",
  "failed",
  "error",
  "cancelled",
  "canceled",
  "partial_success",
  "expired",
  "not_found",
  "unauthorized",
  "malformed",
]);

export function readStatus(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { status?: unknown; data?: { status?: unknown } };
  if (typeof record.status === "string") {
    return record.status.toLowerCase();
  }
  if (typeof record.data?.status === "string") {
    return record.data.status.toLowerCase();
  }
  return null;
}

export function isAsyncStatus(status: string | null): boolean {
  return status !== null && ASYNC_STATUSES.has(status);
}

export function isTerminalStatus(status: string | null): boolean {
  return status !== null && TERMINAL_STATUSES.has(status);
}
