const SECRET_PATTERNS = [
  /hog_(?:live|test)_[A-Za-z0-9_-]+/g,
  /ak_[A-Za-z0-9_-]+/g,
  /sk_[A-Za-z0-9_-]+/g,
];

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key)) {
      redacted[key] = '[REDACTED]';
      continue;
    }
    redacted[key] = redactSecrets(child);
  }
  return redacted;
}

export function redactString(value: string): string {
  return SECRET_PATTERNS.reduce(
    (next, pattern) => next.replace(pattern, '[REDACTED]'),
    value,
  );
}

function isSecretKey(key: string): boolean {
  return /authorization|api.?key|access.?key|secret|token|password/i.test(key);
}
