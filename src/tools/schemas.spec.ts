import assert from 'node:assert/strict';
import test from 'node:test';
import { entityFiltersSchema } from './schemas.js';

test('entityFiltersSchema rejects inverted employee count ranges', () => {
  assert.equal(
    entityFiltersSchema.safeParse({ employeeCount: { min: 100, max: 10 } }).success,
    false,
  );
  assert.equal(
    entityFiltersSchema.safeParse({
      company: { employeeCount: { min: 100, max: 10 } },
    }).success,
    false,
  );
});

test('entityFiltersSchema accepts valid employee count ranges', () => {
  assert.equal(
    entityFiltersSchema.safeParse({ employeeCount: { min: 10, max: 100 } }).success,
    true,
  );
});
