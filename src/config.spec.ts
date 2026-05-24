import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config.js';

test('loadConfig accepts bearer API key auth', () => {
  const apiKey = ['hog', 'live', 'example'].join('_');
  const config = loadConfig({ THEHOG_API_KEY: apiKey });
  assert.equal(config.apiBaseUrl, 'https://developer.thehog.ai');
  assert.equal(config.apiKey, apiKey);
});

test('loadConfig accepts access and secret key auth', () => {
  const accessKey = ['ak', 'example'].join('_');
  const secretKey = ['sk', 'example'].join('_');
  const config = loadConfig({
    THEHOG_ACCESS_KEY: accessKey,
    THEHOG_SECRET_KEY: secretKey,
    THEHOG_API_BASE_URL: 'https://api.example.com/',
  });
  assert.equal(config.apiBaseUrl, 'https://api.example.com');
  assert.equal(config.accessKey, accessKey);
  assert.equal(config.secretKey, secretKey);
});

test('loadConfig accepts request timeout override', () => {
  const config = loadConfig({
    THEHOG_API_KEY: ['hog', 'live', 'example'].join('_'),
    THEHOG_REQUEST_TIMEOUT_MS: '1234',
  });
  assert.equal(config.requestTimeoutMs, 1234);
});

test('loadConfig rejects missing auth', () => {
  assert.throws(() => loadConfig({}), /Missing The Hog API credentials/);
});

test('loadConfig rejects partial access key auth', () => {
  assert.throws(
    () => loadConfig({ THEHOG_ACCESS_KEY: ['ak', 'example'].join('_') }),
    /must be set together/,
  );
});

test('loadConfig rejects non-HTTPS non-local base URLs', () => {
  assert.throws(
    () =>
      loadConfig({
        THEHOG_API_KEY: ['hog', 'live', 'example'].join('_'),
        THEHOG_API_BASE_URL: 'http://example.com',
      }),
    /must be HTTPS/,
  );
});

test('loadConfig accepts IPv6 localhost over HTTP', () => {
  const config = loadConfig({
    THEHOG_API_KEY: ['hog', 'live', 'example'].join('_'),
    THEHOG_API_BASE_URL: 'http://[::1]:3000/',
  });
  assert.equal(config.apiBaseUrl, 'http://[::1]:3000');
});

test('loadConfig rejects invalid request timeout override', () => {
  assert.throws(
    () =>
      loadConfig({
        THEHOG_API_KEY: ['hog', 'live', 'example'].join('_'),
        THEHOG_REQUEST_TIMEOUT_MS: '0',
      }),
    /positive integer/,
  );
});
