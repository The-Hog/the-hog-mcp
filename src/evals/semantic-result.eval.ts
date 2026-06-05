import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { readJsonArtifacts, writeJsonArtifact } from './artifacts.js';
import { flagEnabled, loadLocalEvalEnv } from './env.js';
import { judgeMcpArtifact } from './semantic-result-judge.js';

loadLocalEvalEnv();

const enabled = flagEnabled('RUN_LLM_JUDGE_EVALS');
const skipReason =
  'Set RUN_LLM_JUDGE_EVALS=true, RUN_LIVE_THEHOG_MCP_E2E=true, OPENAI_API_KEY, and THEHOG_LIVE_ARTIFACT_DIR to run semantic MCP result evals.';

test(
  'LLM judge gives binary pass/fail results for saved MCP live artifacts',
  { skip: enabled ? false : skipReason, timeout: 600_000 },
  async () => {
    assert.equal(
      flagEnabled('RUN_LIVE_THEHOG_MCP_E2E'),
      true,
      'RUN_LIVE_THEHOG_MCP_E2E=true is required so semantic evals cannot be mistaken for no-spend tests.',
    );
    const apiKey = process.env.OPENAI_API_KEY;
    assert.ok(apiKey, 'OPENAI_API_KEY is required when RUN_LLM_JUDGE_EVALS=true');

    const artifactDir =
      process.env.THEHOG_LIVE_ARTIFACT_DIR ??
      join(process.cwd(), 'artifacts', 'live-thehog-mcp-grid');
    const maxArtifacts = Number.parseInt(process.env.THEHOG_EVAL_MAX_ARTIFACTS ?? '20', 10);
    const artifacts = readJsonArtifacts(artifactDir, maxArtifacts);
    assert.ok(
      artifacts.length > 0,
      `No JSON artifacts found in ${artifactDir}. Run the live MCP grid before semantic evals.`,
    );

    const model = process.env.THEHOG_SEMANTIC_JUDGE_MODEL ?? 'gpt-4.1-mini';
    const resultDir =
      process.env.THEHOG_SEMANTIC_EVAL_ARTIFACT_DIR ??
      join(process.cwd(), 'artifacts', 'mcp-semantic-evals');
    const results = [];

    for (const artifact of artifacts) {
      const invariantFailures = artifactInvariantFailures(artifact.data);
      assert.deepEqual(
        invariantFailures,
        [],
        `Deterministic artifact invariants failed for ${artifact.path}`,
      );
      const judgeResult = await judgeMcpArtifact(artifact.data, { apiKey, model });
      const result = {
        artifactPath: artifact.path,
        judgeModel: model,
        ...judgeResult,
      };
      results.push(result);
      writeJsonArtifact(resultDir, artifact.path.split('/').pop() ?? 'artifact', result);
    }

    const failures = results.filter((result) => !result.passed);
    assert.deepEqual(failures, []);
  },
);

function artifactInvariantFailures(artifact: Record<string, unknown>): string[] {
  const failures: string[] = [];
  const summary = readRecord(artifact.summary);
  if (Number(summary.failed ?? 0) > 0) {
    failures.push(`summary.failed=${String(summary.failed)}`);
  }

  const results = Array.isArray(artifact.results) ? artifact.results : [];
  for (const rawResult of results) {
    const result = readRecord(rawResult);
    const caseId = String(result.caseId ?? '');
    const status = String(result.status ?? '');
    const error = result.error;
    const resultCount = Number(result.resultCount ?? 0);
    const companyMatchCount = Number(result.companyMatchCount ?? 0);

    if (error) {
      failures.push(`${caseId}: error=${String(error)}`);
    }
    if (resultCount > 0 && companyMatchCount !== resultCount) {
      failures.push(
        `${caseId}: companyMatchCount ${companyMatchCount} must equal resultCount ${resultCount}`,
      );
    }
    const zeroResultAllowed =
      caseId.includes('impossible_strict_title') ||
      caseId.includes('timeout_seconds_1') ||
      status === 'still_running';
    if (!zeroResultAllowed && status === 'succeeded' && resultCount === 0) {
      failures.push(`${caseId}: default/similar completed search returned zero people`);
    }
  }
  return failures;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
