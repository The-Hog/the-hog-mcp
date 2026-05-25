import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;

test('publish workflow uses trusted publishing without npm token auth', async () => {
  const workflow = await readFile(
    join(ROOT, '.github/workflows/publish.yml'),
    'utf8',
  );
  const publishJob = workflowJobBlock(workflow, 'publish');

  assert.ok(
    publishJob.includes('id-token: write'),
    'publish job must grant OIDC id-token permission',
  );
  assert.ok(
    publishJob.includes('npm publish --access public --provenance'),
    'publish job must publish with npm provenance',
  );
  assert.equal(
    publishJob.includes('registry-url:'),
    false,
    'publish job must not configure token-style npm registry auth',
  );
  assert.equal(
    workflow.includes('NODE_AUTH_TOKEN') || workflow.includes('NPM_TOKEN'),
    false,
    'workflow must not reference npm token secrets',
  );
});

function workflowJobBlock(workflow: string, jobName: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  assert.notEqual(start, -1, `expected workflow job ${jobName} to exist`);

  const end = lines.findIndex(
    (line, index) => index > start && /^  [A-Za-z0-9_-]+:\s*$/.test(line),
  );
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}
