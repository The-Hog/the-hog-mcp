import { z } from 'zod/v4';
import { primitiveTools } from '../tools/primitives/definitions.js';
import { workflowTools } from '../tools/workflows/definitions.js';
import type { McpToolDefinition } from '../tools/types.js';
import { completeJson } from './openai-json.js';
import type { PathExpectation, ToolSelectionCase } from './tool-selection-cases.js';

export interface ToolSelectionResult {
  caseId: string;
  prompt: string;
  expectedTool: string;
  selectedTool: string | null;
  args: Record<string, unknown>;
  passed: boolean;
  checks: BinaryCheck[];
  model: string;
  toolListHash: string;
}

export interface BinaryCheck {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
}

interface ModelToolSelection {
  toolName?: unknown;
  arguments?: unknown;
  rationale?: unknown;
}

const EVAL_TOOL_NAMES = new Set([
  'search_people',
  'find_people_at_target_accounts',
  'build_prospect_list',
  'enrich_contact',
  'enrich_contacts',
  'enrich_prospect_list',
  'get_operation',
  'get_search_result',
  'get_enrichment',
  'search_web',
  'crawl_website',
  'scrape_web_page',
]);

const tools = [...primitiveTools, ...workflowTools].filter((tool) =>
  EVAL_TOOL_NAMES.has(tool.name),
);

export async function runToolSelectionCase(
  testCase: ToolSelectionCase,
  options: { apiKey: string; model: string },
): Promise<ToolSelectionResult> {
  const selection = await completeJson<ModelToolSelection>({
    apiKey: options.apiKey,
    model: options.model,
    system:
      'You choose exactly one MCP tool for The Hog. Return only JSON with keys "toolName", "arguments", and "rationale". Do not call tools. Use only the listed tool names and exact input property names from the schemas. Preserve user-provided company constraints and durable IDs. Do not invent company domains, LinkedIn URLs, people, or operation IDs. If the user says operation ID, always use get_operation; get_search_result is only for search IDs returned by submit_search. For search_people company LinkedIn URLs, use filters.company.linkedinUrls. For enrich_contact, identifier must be an object such as {"linkedin_url":"..."} or {"email":"..."}.',
    user: [
      'Available MCP tools:',
      renderToolList(),
      '',
      `User prompt: ${testCase.prompt}`,
      '',
      'Return JSON only.',
    ].join('\n'),
  });

  const selectedTool =
    typeof selection.toolName === 'string' ? selection.toolName : null;
  const args =
    selection.arguments &&
    typeof selection.arguments === 'object' &&
    !Array.isArray(selection.arguments)
      ? (selection.arguments as Record<string, unknown>)
      : {};
  const checks = evaluateToolSelection(testCase, selectedTool, args);
  return {
    caseId: testCase.id,
    prompt: testCase.prompt,
    expectedTool: testCase.expectedTool,
    selectedTool,
    args,
    checks,
    passed: checks.every((check) => check.passed),
    model: options.model,
    toolListHash: stableHash(renderToolList()),
  };
}

export function evaluateToolSelection(
  testCase: ToolSelectionCase,
  selectedTool: string | null,
  args: Record<string, unknown>,
): BinaryCheck[] {
  const checks: BinaryCheck[] = [
    {
      name: 'expected tool selected',
      passed: selectedTool === testCase.expectedTool,
      expected: testCase.expectedTool,
      actual: selectedTool,
    },
  ];

  const tool = selectedTool ? tools.find((candidate) => candidate.name === selectedTool) : null;
  checks.push({
    name: 'selected tool exists',
    passed: Boolean(tool),
    expected: true,
    actual: Boolean(tool),
  });

  if (tool) {
    const schemaResult = z.object(tool.inputSchema).strict().safeParse(args);
    checks.push({
      name: 'arguments match strict MCP schema',
      passed: schemaResult.success,
      expected: true,
      actual: schemaResult.success ? true : schemaResult.error.issues,
    });
  }

  for (const expectation of testCase.required) {
    checks.push(evaluateExpectation(args, expectation, false));
  }
  for (const expectation of testCase.forbidden ?? []) {
    checks.push(evaluateExpectation(args, expectation, true));
  }

  return checks;
}

function evaluateExpectation(
  args: Record<string, unknown>,
  expectation: PathExpectation,
  forbidden: boolean,
): BinaryCheck {
  const value = readPath(args, expectation.path);
  const present = value !== undefined;
  const expected = { ...expectation };
  let passed = true;

  if (expectation.present === true) passed = passed && present;
  if (expectation.absent === true) passed = passed && !present;
  if (expectation.equals !== undefined) {
    passed = passed && deepEqual(value, expectation.equals);
  }
  if (expectation.includes !== undefined) {
    passed = passed && valueIncludes(value, expectation.includes);
  }
  if (expectation.includesAny !== undefined) {
    passed =
      passed &&
      expectation.includesAny.some((candidate) => valueIncludes(value, candidate));
  }
  if (forbidden) passed = !passed;

  return {
    name: `${forbidden ? 'forbidden' : 'required'} ${expectation.path}`,
    passed,
    expected,
    actual: value,
  };
}

function renderToolList(): string {
  return tools
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  input schema: ${JSON.stringify(shapeToPromptSchema(tool.inputSchema))}`,
    )
    .join('\n');
}

function shapeToPromptSchema(shape: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [key, zodToPromptSchema(schema)]),
  );
}

function zodToPromptSchema(schema: unknown, depth = 0): unknown {
  if (depth > 5 || !schema || typeof schema !== 'object') {
    return 'unknown';
  }
  const def = readDef(schema);
  if (!def) return 'unknown';
  if (def.type === 'optional') {
    return { optional: true, schema: zodToPromptSchema(def.innerType, depth + 1) };
  }
  if (def.type === 'nullable') {
    return { nullable: true, schema: zodToPromptSchema(def.innerType, depth + 1) };
  }
  if (def.type === 'string') return 'string';
  if (def.type === 'number') return 'number';
  if (def.type === 'boolean') return 'boolean';
  if (def.type === 'unknown') return 'unknown';
  if (def.type === 'enum') return { enum: Object.values(def.entries ?? {}) };
  if (def.type === 'literal') return { literal: def.values ?? def.value };
  if (def.type === 'array') {
    return { arrayOf: zodToPromptSchema(def.element, depth + 1) };
  }
  if (def.type === 'record') {
    return { record: 'object with string keys' };
  }
  if (def.type === 'object') {
    const shape =
      typeof def.shape === 'function'
        ? (def.shape() as Record<string, unknown>)
        : (def.shape as Record<string, unknown>);
    return shapeToPromptSchema(shape ?? {});
  }
  return def.type ?? 'unknown';
}

function readDef(schema: object): Record<string, unknown> | null {
  const withDef = schema as { _def?: Record<string, unknown>; def?: Record<string, unknown> };
  return withDef._def ?? withDef.def ?? null;
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function valueIncludes(value: unknown, expected: string): boolean {
  const needle = expected.toLowerCase();
  if (typeof value === 'string') return value.toLowerCase().includes(needle);
  if (Array.isArray(value)) {
    return value.some((item) => valueIncludes(item, expected));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => valueIncludes(item, expected));
  }
  return false;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

export function allEvalTools(): McpToolDefinition[] {
  return [...tools];
}
