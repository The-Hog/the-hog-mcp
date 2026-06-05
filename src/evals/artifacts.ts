import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeJsonArtifact(
  dir: string,
  name: string,
  payload: unknown,
): string {
  mkdirSync(dir, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = join(dir, `${safeName}.json`);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return path;
}

export function readJsonArtifacts(dir: string, maxFiles: number): JsonArtifact[] {
  const files = listJsonFiles(dir).slice(0, maxFiles);
  return files.map((path) => ({
    path,
    data: JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>,
  }));
}

export interface JsonArtifact {
  path: string;
  data: Record<string, unknown>;
}

function listJsonFiles(dir: string): string[] {
  const stat = statSync(dir, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsonFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(path);
    }
  }
  return out.sort();
}
