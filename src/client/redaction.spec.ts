import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSecrets } from './redaction.js';

test('redactSecrets removes API-like credentials recursively', () => {
  const apiKey = ['hog', 'live', 'abc123'].join('_');
  const accessKey = ['ak', 'abc123'].join('_');
  const secretKey = ['sk', 'abc123'].join('_');
  const value = redactSecrets({
    authorization: `Bearer ${apiKey}`,
    nested: {
      accessKey,
      message: `failed with ${secretKey}`,
    },
  });

  const text = JSON.stringify(value);
  assert.equal(text.includes(apiKey), false);
  assert.equal(text.includes(accessKey), false);
  assert.equal(text.includes(secretKey), false);
  assert.match(text, /REDACTED/);
});
