export interface TheHogMcpConfig {
  apiBaseUrl: string;
  accessKey: string;
  secretKey: string;
  requestTimeoutMs?: number;
}

const DEFAULT_API_BASE_URL = 'https://developer.thehog.ai';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TheHogMcpConfig {
  const apiBaseUrl = normalizeBaseUrl(
    env.THEHOG_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  );
  const accessKey = nonEmpty(env.THEHOG_ACCESS_KEY);
  const secretKey = nonEmpty(env.THEHOG_SECRET_KEY);
  const requestTimeoutMs = optionalPositiveInteger(env.THEHOG_REQUEST_TIMEOUT_MS);

  if ((accessKey && !secretKey) || (!accessKey && secretKey)) {
    throw new Error(
      'THEHOG_ACCESS_KEY and THEHOG_SECRET_KEY must be set together.',
    );
  }

  if (!(accessKey && secretKey)) {
    throw new Error(
      'Missing The Hog API credentials. Set both THEHOG_ACCESS_KEY and THEHOG_SECRET_KEY.',
    );
  }

  return {
    apiBaseUrl,
    accessKey,
    secretKey,
    ...(requestTimeoutMs ? { requestTimeoutMs } : {}),
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  const url = new URL(trimmed);
  if (url.protocol !== 'https:' && !isLocalhost(url)) {
    throw new Error('THEHOG_API_BASE_URL must be HTTPS unless it targets localhost.');
  }
  return url.toString().replace(/\/$/, '');
}

function isLocalhost(url: URL): boolean {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
}

function optionalPositiveInteger(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('THEHOG_REQUEST_TIMEOUT_MS must be a positive integer.');
  }
  return parsed;
}
