import { completeJson } from './openai-json.js';

export interface SemanticJudgeResult {
  passed: boolean;
  checks: Record<string, boolean>;
  rationale: string;
}

export async function judgeMcpArtifact(
  artifact: Record<string, unknown>,
  options: { apiKey: string; model: string },
): Promise<SemanticJudgeResult> {
  const result = await completeJson<unknown>({
    apiKey: options.apiKey,
    model: options.model,
    system:
      'You are a binary evaluator for The Hog MCP live test artifacts. Return JSON only with keys "passed", "checks", and "rationale". Each check must be boolean. Decompose quality into binary checks; do not use 1-5 ratings.',
    user: [
      'Evaluate whether this MCP people/prospecting artifact satisfies the user intent and incident invariants.',
      'Required binary checks:',
      '- role_relevance: returned people or explanation match the requested role intent.',
      '- company_constraint_preserved: returned people stay within the requested company constraints.',
      '- strict_title_behavior_correct: strict mode does not return unrelated non-exact titles.',
      '- empty_result_explanation_truthful: empty results explain strictness, fallback, timeout, or provider state truthfully.',
      '- agent_output_actionable: output is understandable and actionable for an MCP client.',
      '',
      'Artifact JSON:',
      JSON.stringify(redactArtifact(artifact), null, 2),
    ].join('\n'),
  });
  return parseSemanticJudgeResult(result);
}

export function parseSemanticJudgeResult(value: unknown): SemanticJudgeResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Semantic judge result must be an object.');
  }
  const result = value as Record<string, unknown>;
  if (typeof result.passed !== 'boolean') {
    throw new Error('Semantic judge result must include boolean passed.');
  }
  if (!result.checks || typeof result.checks !== 'object' || Array.isArray(result.checks)) {
    throw new Error('Semantic judge result must include object checks.');
  }
  const checks: Record<string, boolean> = {};
  for (const [key, check] of Object.entries(result.checks)) {
    if (typeof check !== 'boolean') {
      throw new Error(`Semantic judge check "${key}" must be boolean.`);
    }
    checks[key] = check;
  }
  if (typeof result.rationale !== 'string') {
    throw new Error('Semantic judge result must include string rationale.');
  }
  return {
    passed: result.passed,
    checks,
    rationale: result.rationale,
  };
}

function redactArtifact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactArtifact);
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/api.?key|token|secret|authorization|session/i.test(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactArtifact(nested);
    }
  }
  return out;
}
