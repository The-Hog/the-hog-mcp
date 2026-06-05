import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function loadLocalEvalEnv(): void {
  for (const file of localEnvCandidates()) {
    if (!existsSync(file)) continue;
    const values = parseDotEnv(readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function flagEnabled(name: string): boolean {
  const value = process.env[name]?.toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function localEnvCandidates(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, '.env.local'),
    join(cwd, '..', '.env.local'),
    join(cwd, '..', '..', '.env.local'),
  ].map((file) => resolve(file));
}

function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = unquote(trimmed.slice(index + 1).trim());
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      out[key] = value;
    }
  }
  return out;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
