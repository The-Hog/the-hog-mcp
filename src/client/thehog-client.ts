import { randomUUID } from 'node:crypto';
import type { TheHogMcpConfig } from '../config.js';
import { TheHogApiError } from './errors.js';
import { redactSecrets } from './redaction.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface TheHogRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface TheHogResponse<T = unknown> {
  data: T;
  status: number;
  requestId: string | null;
}

export interface TheHogToolClient {
  request<T = unknown>(request: TheHogRequest): Promise<TheHogResponse<T>>;
  createIdempotencyKey(prefix?: string): string;
}

export type FetchLike = typeof fetch;

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export class TheHogClient implements TheHogToolClient {
  constructor(
    private readonly config: TheHogMcpConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async request<T = unknown>(request: TheHogRequest): Promise<TheHogResponse<T>> {
    const url = this.buildUrl(request.path, request.query);
    const headers = this.buildHeaders(request);
    const timeoutMs = Math.max(
      1,
      request.timeoutMs ?? this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: 'manual',
      signal: controller.signal,
      ...(request.body === undefined
        ? {}
        : { body: JSON.stringify(stripUndefined(request.body)) }),
    };

    let response: Response;
    let payload: unknown;
    try {
      response = await this.fetchImpl(url, init);
      payload = await readResponseBody(response);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`The Hog API request timed out after ${timeoutMs}ms.`);
      }
      const safeMessage =
        error instanceof Error
          ? String(redactSecrets(error.message))
          : String(redactSecrets(String(error)));
      throw new Error(`The Hog API request failed before receiving a response: ${safeMessage}`);
    } finally {
      clearTimeout(timeout);
    }

    const requestId = response.headers.get('x-request-id');
    if (response.status >= 300 && response.status < 400) {
      throw new TheHogApiError(
        `The Hog API returned HTTP ${response.status}; redirects are not followed by this MCP client.`,
        response.status,
        requestId,
        payload,
      );
    }
    if (!response.ok) {
      const message = errorMessageForResponse(response.status, payload);
      throw new TheHogApiError(message, response.status, requestId, payload);
    }

    return {
      data: payload as T,
      status: response.status,
      requestId,
    };
  }

  createIdempotencyKey(prefix = 'mcp'): string {
    return `${prefix}_${randomUUID()}`;
  }

  private buildUrl(path: string, query: Record<string, unknown> = {}): string {
    const url = new URL(path, `${this.config.apiBaseUrl}/`);
    for (const [key, value] of Object.entries(query)) {
      if (!shouldIncludeQueryValue(value)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (!shouldIncludeQueryValue(item)) {
            continue;
          }
          url.searchParams.append(key, String(item));
        }
        continue;
      }
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private buildHeaders(request: TheHogRequest): Headers {
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    headers.set('User-Agent', '@thehog/mcp');
    if (request.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (request.idempotencyKey) {
      headers.set('Idempotency-Key', request.idempotencyKey);
    }

    headers.set('X-Access-Key', this.config.accessKey);
    headers.set('X-Secret-Key', this.config.secretKey);
    return headers;
  }
}

function shouldIncludeQueryValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) {
      next[key] = stripUndefined(child);
    }
  }
  return next;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessageForResponse(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const maybeMessage = (body as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }
  return `The Hog API request failed with HTTP ${status}`;
}
