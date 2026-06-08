import assert from 'node:assert/strict';
import test from 'node:test';
import {
  errorResult,
  jsonErrorResult,
  stringifyForMcp,
  stripInternalDebugFields,
} from './format.js';

test('errorResult marks MCP tool calls as errors', () => {
  const result = errorResult(new Error('failed'));
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? '', /"ok": false/);
});

test('jsonErrorResult marks structured tool payloads as errors', () => {
  const result = jsonErrorResult({ ok: false, workflow: 'example', status: 'failed' });
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? '', /"status": "failed"/);
});

test('stringifyForMcp keeps truncated payloads under the text cap', () => {
  const text = stringifyForMcp({ value: '"'.repeat(80_000) });
  assert.equal(text.length <= 60_000, true);
  assert.match(text, /"truncated":\s*true/);
  assert.match(text, /"preview":/);
});

test('stripInternalDebugFields removes provider fallback and planner internals', () => {
  const sanitized = stripInternalDebugFields({
    status: 'failed',
    error: {
      message: 'All scraping providers failed.',
      code: 'all_scraping_providers_failed',
      providersAttempted: ['apify-harvest-linkedin-profile-search'],
      providerErrors: [{ provider: 'apify', reason: 'timed out' }],
      fallbackReason: 'provider failed',
      plannerMode: 'relaxed',
    },
    data: [{ name: 'Example' }],
    note: 'A cloud provider partner is listed in the public profile.',
  });

  const text = JSON.stringify(sanitized);
  assert.doesNotMatch(text, /fallback|planner|apify|scraping/i);
  assert.match(text, /request could not complete/i);
  assert.match(text, /Example/);
  assert.match(text, /cloud provider partner/);
});

test('stripInternalDebugFields preserves public provider-like customer fields and non-plain objects', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const sanitized = stripInternalDebugFields({
    emailProvider: 'Google Workspace',
    identityProvider: 'Okta',
    serviceProvider: 'Acme Cloud',
    company: 'Apify',
    note: 'Customer uses Apify automation for public web research.',
    createdAt,
  }) as Record<string, unknown>;

  assert.equal(sanitized.emailProvider, 'Google Workspace');
  assert.equal(sanitized.identityProvider, 'Okta');
  assert.equal(sanitized.serviceProvider, 'Acme Cloud');
  assert.equal(sanitized.company, 'Apify');
  assert.equal(sanitized.note, 'Customer uses Apify automation for public web research.');
  assert.equal(sanitized.createdAt, createdAt);
});

test('stripInternalDebugFields removes exact internal provider planner and fallback keys', () => {
  const sanitized = stripInternalDebugFields({
    provider: 'internal-vendor',
    providers: ['internal-vendor'],
    provider_errors: ['failed'],
    planner: 'relaxed',
    fallback: true,
    fallback_reason: 'provider failed',
    filtersRelaxed: true,
    filters_relaxed: true,
    visible: 'ok',
  }) as Record<string, unknown>;

  assert.deepEqual(sanitized, { visible: 'ok' });
});
