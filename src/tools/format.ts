import { normalizeError } from '../client/errors.js';

const MAX_TEXT_CHARS = 60_000;
const INTERNAL_DEBUG_KEYS = new Set([
  'fallback',
  'fallbackUsed',
  'fallbackReason',
  'fallback_reason',
  'provider',
  'providers',
  'providerAttempts',
  'providerAttemptsById',
  'provider_attempts',
  'provider_attempts_by_id',
  'providerErrors',
  'providerFailures',
  'providerOutcome',
  'provider_errors',
  'provider_failures',
  'provider_outcome',
  'planner',
  'plannerMode',
  'planner_mode',
]);
const INTERNAL_DEBUG_VALUE_PATTERNS = [
  /all[_\s-]*(?:x|web|search|crawler)[_\s-]*providers?[_\s-]*failed/i,
  /all[_\s-]*(?:web[_\s-]*)?scraping[_\s-]*providers?[_\s-]*failed/i,
  /upstream[_\s-]*scraper[_\s-]*provider[_\s-]*failed/i,
  /queued[_\s-]*contact[_\s-]*provider[_\s-]*execution[_\s-]*failed/i,
  /harvest[_\s-]*linkedin/i,
  /planner[_\s-]*mode/i,
  /fallback[_\s-]*(used|reason|relaxed)/i,
];
const PUBLIC_INTERNAL_MESSAGE =
  'The request could not complete. Try again later or resume with the provided ID if available.';

export interface McpTextResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function jsonResult(value: unknown): McpTextResult {
  return {
    content: [{ type: 'text', text: stringifyForMcp(stripInternalDebugFields(value)) }],
  };
}

export function jsonErrorResult(value: unknown): McpTextResult {
  return {
    ...jsonResult(value),
    isError: true,
  };
}

export function errorResult(error: unknown): McpTextResult {
  return jsonErrorResult({ ok: false, error: normalizeError(error) });
}

export function stringifyForMcp(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= MAX_TEXT_CHARS) {
    return text;
  }
  const wrap = (previewLength: number) =>
    JSON.stringify(
      {
        truncated: true,
        maxChars: MAX_TEXT_CHARS,
        preview: text.slice(0, previewLength),
      },
      null,
      2,
    );
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (wrap(mid).length <= MAX_TEXT_CHARS) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return wrap(low);
}

export function stripInternalDebugFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripInternalDebugFields);
  }
  if (typeof value === 'string') {
    return isInternalDebugValue(value) ? PUBLIC_INTERNAL_MESSAGE : value;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isInternalDebugKey(key)) {
      continue;
    }
    output[key] = stripInternalDebugFields(child);
  }
  return output;
}

function isInternalDebugValue(value: string): boolean {
  return INTERNAL_DEBUG_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function isInternalDebugKey(key: string): boolean {
  return (
    INTERNAL_DEBUG_KEYS.has(key) ||
    /^fallback[A-Z_]/.test(key) ||
    /^fallback_/.test(key) ||
    /^provider[A-Z_]/.test(key) ||
    /^provider_/.test(key) ||
    /^providers[A-Z_]/.test(key) ||
    /^providers_/.test(key) ||
    /^planner[A-Z_]/.test(key) ||
    /^planner_/.test(key)
  );
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
