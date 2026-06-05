import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { writeJsonArtifact } from './artifacts.js';
import { flagEnabled, loadLocalEvalEnv } from './env.js';
import { toolSelectionCases } from './tool-selection-cases.js';
import { runToolSelectionCase } from './tool-selection-runner.js';

loadLocalEvalEnv();

const enabled = flagEnabled('RUN_AGENT_TOOL_SELECTION_EVALS');
const skipReason =
  'Set RUN_AGENT_TOOL_SELECTION_EVALS=true and OPENAI_API_KEY to run agent tool-selection evals.';

test(
  'agent chooses the expected MCP tool and arguments for golden prompts',
  { skip: enabled ? false : skipReason, timeout: 600_000 },
  async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    assert.ok(apiKey, 'OPENAI_API_KEY is required when RUN_AGENT_TOOL_SELECTION_EVALS=true');

    const model = process.env.THEHOG_AGENT_EVAL_MODEL ?? 'gpt-4.1-mini';
    const artifactDir =
      process.env.THEHOG_AGENT_EVAL_ARTIFACT_DIR ??
      join(process.cwd(), 'artifacts', 'agent-tool-selection');

    const results = [];
    for (const testCase of toolSelectionCases) {
      const result = await runToolSelectionCase(testCase, { apiKey, model });
      results.push(result);
      writeJsonArtifact(artifactDir, result.caseId, result);
    }

    const failures = results.filter((result) => !result.passed);
    assert.deepEqual(
      failures.map((failure) => ({
        caseId: failure.caseId,
        expectedTool: failure.expectedTool,
        selectedTool: failure.selectedTool,
        failedChecks: failure.checks.filter((check) => !check.passed),
      })),
      [],
    );
  },
);
