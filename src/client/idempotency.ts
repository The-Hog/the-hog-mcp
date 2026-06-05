import { createHash } from 'node:crypto';

export function stableIdempotencyKey(prefix: string, payload: unknown): string {
  const normalizedPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'mcp';
  const digest = createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')
    .slice(0, 32);
  return `${normalizedPrefix}_${digest}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) {
      sorted[key] = sortValue(child);
    }
  }
  return sorted;
}
