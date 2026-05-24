import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;

const PUBLIC_FILES = [
  'package.json',
  'README.md',
  'SECURITY.md',
  'src',
  'dist-test',
];

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
  for (const entry of PUBLIC_FILES) {
    await collectTextFiles(join(ROOT, entry), files);
  }
  return files.sort();
}

async function collectTextFiles(path: string, output: string[]): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true }).catch(
    async (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return [];
      }
      output.push(path);
      return [];
    },
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
