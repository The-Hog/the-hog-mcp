import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;

const PUBLIC_REPO_ENTRIES = [
  'package.json',
  'README.md',
  'SECURITY.md',
  'src',
];

const PUBLISHED_ARTIFACT_ENTRIES = ['package.json', 'README.md', 'dist'];

const PRIVATE_BOUNDARY_PATTERNS = [
  /\bprojectId\b/i,
  /\bproject_id\b/i,
  /\bCLERK_[A-Z0-9_]*\b/,
  /\bSUPABASE_[A-Z0-9_]*\b/,
  /\bAWS_[A-Z0-9_]*\b/,
  /\bKMS\b/,
  /\bmcp_connector_installations\b/i,
  /\bmcp_installation_id\b/i,
  /\bservice_role\b/i,
  /\bX-Org-Id\b/i,
  /\bTHEHOG_REMOTE_MCP\b/i,
];

test('public package boundary does not include private remote MCP implementation details', async () => {
  const files = await publicTextFiles();
  assert.ok(
    files.some((file) => relative(ROOT, file).startsWith('dist/')),
    'expected public package boundary scan to include built dist artifacts',
  );
  const violations: string[] = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const pattern of PRIVATE_BOUNDARY_PATTERNS) {
      if (pattern.test(text)) {
        violations.push(`${relative(ROOT, file)} matched ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('package executable is separated from importable library entrypoint', async () => {
  const packageJson = JSON.parse(
    await readFile(join(ROOT, 'package.json'), 'utf8'),
  ) as {
    bin?: Record<string, string>;
    exports?: Record<string, unknown>;
    main?: string;
    types?: string;
  };

  assert.equal(packageJson.main, 'dist/index.js');
  assert.equal(packageJson.types, 'dist/index.d.ts');
  assert.deepEqual(packageJson.bin, {
    'thehog-mcp': 'dist/cli.js',
  });
  assert.deepEqual(packageJson.exports, {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
    },
  });
});

async function publicTextFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const entry of PUBLIC_REPO_ENTRIES) {
    await collectTextFiles(join(ROOT, entry), files);
  }
  for (const entry of PUBLISHED_ARTIFACT_ENTRIES) {
    await collectTextFiles(join(ROOT, entry), files);
  }
  return [...new Set(files)].sort();
}

async function collectTextFiles(path: string, output: string[]): Promise<void> {
  const info = await stat(path);
  if (info.isFile()) {
    const relativePath = relative(ROOT, path);
    if (/\.(spec|test)\./.test(relativePath)) {
      return;
    }
    if (/\.(json|md|ts|tsx|js|mjs|yml|yaml)$/.test(relativePath)) {
      output.push(path);
    }
    return;
  }

  if (!info.isDirectory()) {
    return;
  }

  const entries = await readdir(path, { withFileTypes: true });
  assert.notEqual(
    entries.length,
    0,
    `expected ${relative(ROOT, path)} to contain package boundary files`,
  );

  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(child, output);
      continue;
    }
    if (entry.isFile() && /\.(spec|test)\./.test(entry.name)) {
      continue;
    }
    if (entry.isFile() && /\.(json|md|ts|tsx|js|mjs|yml|yaml)$/.test(entry.name)) {
      output.push(child);
    }
  }
}
