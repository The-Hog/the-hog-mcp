import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { packageVersion } from './package-info.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as {
  bin?: Record<string, string>;
  bugs?: {
    url?: string;
  };
  files?: string[];
  homepage?: string;
  license?: string;
  name?: string;
  private?: boolean;
  publishConfig?: {
    access?: string;
    registry?: string;
  };
  repository?: {
    type?: string;
    url?: string;
  };
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
};

test('packageVersion reads package metadata', () => {
  assert.match(packageVersion, /^\d+\.\d+\.\d+$/);
});

test('package metadata is safe to publish publicly', () => {
  assert.equal(packageJson.name, '@thehog/mcp');
  assert.equal(packageJson.license, 'MIT');
  assert.equal(packageJson.homepage, 'https://docs.thehog.ai/guides/use-mcp');
  assert.equal(packageJson.private, false);
  assert.deepEqual(packageJson.bugs, {
    url: 'https://github.com/The-Hog/the-hog-mcp/issues',
  });
  assert.deepEqual(packageJson.publishConfig, {
    access: 'public',
    registry: 'https://registry.npmjs.org',
  });
  assert.deepEqual(packageJson.repository, {
    type: 'git',
    url: 'git+https://github.com/The-Hog/the-hog-mcp.git',
  });
  assert.deepEqual(packageJson.bin, {
    'thehog-mcp': 'dist/index.js',
  });
  assert.deepEqual(packageJson.files, ['dist', 'LICENSE', 'README.md', 'package.json']);
  assert.deepEqual(packageJson.engines, {
    node: '>=22',
  });
  assert.equal(
    packageJson.scripts?.['release:check'],
    'npm test && npm run test:openapi && npm run pack:dry-run',
  );
  assert.equal(
    packageJson.scripts?.prepublishOnly,
    'npm test && npm run test:openapi && npm run pack:dry-run',
  );
  assert.equal(
    packageJson.scripts?.test,
    'tsc -p tsconfig.spec.json && node scripts/run-tests.mjs',
  );
  assert.equal(
    packageJson.scripts?.['pack:dry-run'],
    'npm run build && npm pack --dry-run --ignore-scripts',
  );
});
