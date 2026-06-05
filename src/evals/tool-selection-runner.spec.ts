import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateToolSelection } from './tool-selection-runner.js';

test('evaluateToolSelection requires all predicates on one expected path', () => {
  const checks = evaluateToolSelection(
    {
      id: 'multi-predicate',
      prompt: 'Search for Visa immigration people',
      expectedTool: 'search_people',
      required: [
        {
          path: 'query',
          includes: 'Visa',
          equals: 'immigration leaders at Walmart',
        },
      ],
    },
    'search_people',
    { query: 'Visa immigration leaders' },
  );

  const pathCheck = checks.find((check) => check.name === 'required query');
  assert.equal(pathCheck?.passed, false);
});

test('evaluateToolSelection inverts the combined result for forbidden expectations', () => {
  const checks = evaluateToolSelection(
    {
      id: 'forbidden-multi-predicate',
      prompt: 'Resume operation',
      expectedTool: 'get_operation',
      required: [{ path: 'id', equals: 'op_123' }],
      forbidden: [{ path: 'query', present: true, includes: 'people' }],
    },
    'get_operation',
    { id: 'op_123', query: 'company search' },
  );

  const forbiddenCheck = checks.find((check) => check.name === 'forbidden query');
  assert.equal(forbiddenCheck?.passed, true);
});
