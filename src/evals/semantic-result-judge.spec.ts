import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSemanticJudgeResult } from './semantic-result-judge.js';

test('parseSemanticJudgeResult accepts only boolean checks', () => {
  assert.deepEqual(
    parseSemanticJudgeResult({
      passed: true,
      checks: {
        role_relevance: true,
        company_constraint_preserved: false,
      },
      rationale: 'The returned artifact is relevant but misses one constraint.',
    }),
    {
      passed: true,
      checks: {
        role_relevance: true,
        company_constraint_preserved: false,
      },
      rationale: 'The returned artifact is relevant but misses one constraint.',
    },
  );

  assert.throws(
    () =>
      parseSemanticJudgeResult({
        passed: true,
        checks: { role_relevance: 'yes' },
        rationale: 'invalid',
      }),
    /must be boolean/,
  );
});
