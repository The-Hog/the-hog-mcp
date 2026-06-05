import assert from 'node:assert/strict';
import test from 'node:test';
import { primitiveTools } from './primitives/definitions.js';
import { workflowTools } from './workflows/definitions.js';

const FORBIDDEN_DESCRIPTION_PATTERNS = [
  /\bapify\b/i,
  /\bharvest[-_\s]*linkedin\b/i,
  /\bprospeo\b/i,
  /\bdatagma\b/i,
  /\blusha\b/i,
  /\bsightengine\b/i,
  /\bactor\s*id\b/i,
  /\bpricing\s*row\b/i,
  /\bcogs\b/i,
  /\bmargin\b/i,
  /\bservice[_\s-]*role\b/i,
  /\bsecret\b/i,
  /\bauth(?:orization)?\s*token\b/i,
  /\bmcp[_\s-]*connector/i,
  /\bproject[_\s-]*id\b/i,
];

const FORBIDDEN_INPUT_KEY_PATTERNS = [
  /^project_?id$/i,
  /provider/i,
  /actor/i,
  /pricing/i,
  /secret/i,
  /token/i,
  /service[_\s-]*role/i,
  /mcp[_\s-]*connector/i,
];

test('public MCP tool surface hides internal provider, auth, and billing details', () => {
  const violations: string[] = [];
  for (const tool of [...primitiveTools, ...workflowTools]) {
    for (const pattern of FORBIDDEN_DESCRIPTION_PATTERNS) {
      if (pattern.test(tool.description)) {
        violations.push(`${tool.name} description matched ${pattern}`);
      }
    }
    for (const key of Object.keys(tool.inputSchema)) {
      for (const pattern of FORBIDDEN_INPUT_KEY_PATTERNS) {
        if (pattern.test(key)) {
          violations.push(`${tool.name} input key ${key} matched ${pattern}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
