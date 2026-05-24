import { normalizeError } from '../client/errors.js';

const MAX_TEXT_CHARS = 60_000;

export interface McpTextResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function jsonResult(value: unknown): McpTextResult {
  return {
    content: [{ type: 'text', text: stringifyForMcp(value) }],
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
