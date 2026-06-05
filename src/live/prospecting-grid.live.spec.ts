import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { z } from 'zod/v4';
import { loadConfig } from '../config.js';
import { TheHogClient } from '../client/thehog-client.js';
import { primitiveTools } from '../tools/primitives/definitions.js';
import { workflowTools } from '../tools/workflows/definitions.js';
import type { McpToolDefinition } from '../tools/types.js';

type ToolCase = {
  id: string;
  toolName: 'search_people' | 'find_people_at_target_accounts';
  args: Record<string, unknown>;
  company: string;
  domain: string;
};

const liveEnabled = process.env.RUN_LIVE_THEHOG_MCP_E2E === 'true';

test(
  'LIVE MCP prospecting grid persists async/result artifacts',
  { skip: !liveEnabled },
  async () => {
    const missing = requiredEnv().filter((name) => !process.env[name]);
    assert.deepEqual(missing, []);

    const client = new TheHogClient(loadConfig());
    const testRunId = createTestRunId();
    const artifactDir =
      process.env.THEHOG_MCP_LIVE_ARTIFACT_DIR ??
      join(process.cwd(), 'artifacts', 'live-thehog-mcp-grid');
    const cases = buildCases(readMaxCases());
    const results = [];

    for (const toolCase of cases) {
      const started = Date.now();
      try {
        const result = await executeTool(toolCase, client);
        const people = extractPeople(result);
        results.push({
          testRunId,
          caseId: toolCase.id,
          toolName: toolCase.toolName,
          idempotencyKey: toolCase.args.idempotencyKey,
          status: readStatus(result),
          operationIds: extractOperationIds(result),
          requestIds: extractRequestIds(result),
          providerRunIds: extractProviderRunIds(result),
          resultCount: people.length,
          companyMatchCount: people.filter((person) =>
            personMatchesCompany(person, toolCase),
          ).length,
          metadataFlags: extractMetadataFlags(result),
          costOrCreditUsage: extractCostOrCreditUsage(result),
          durationMs: Date.now() - started,
          error: null,
        });
      } catch (error) {
        results.push({
          testRunId,
          caseId: toolCase.id,
          toolName: toolCase.toolName,
          idempotencyKey: toolCase.args.idempotencyKey,
          status: null,
          operationIds: [],
          requestIds: [],
          providerRunIds: [],
          resultCount: 0,
          companyMatchCount: 0,
          metadataFlags: {},
          costOrCreditUsage: null,
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const artifact = {
      summary: {
        testRunId,
        generatedAt: new Date().toISOString(),
        total: results.length,
        failed: results.filter((result) => result.error).length,
      },
      results,
    };
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, `${testRunId}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );

    assert.equal(artifact.summary.failed, 0);
    assert.ok(
      results.every(
        (result) =>
          result.status ||
          result.operationIds.length > 0 ||
          result.resultCount > 0,
      ),
    );
  },
);

function requiredEnv(): string[] {
  return ['RUN_LIVE_THEHOG_MCP_E2E', 'THEHOG_ACCESS_KEY', 'THEHOG_SECRET_KEY'];
}

function buildCases(maxCases?: number): ToolCase[] {
  const companies = [
    ['Walmart', 'walmart.com', 'https://www.linkedin.com/company/walmart'],
    ['Visa', 'visa.com', 'https://www.linkedin.com/company/visa'],
    ['UPS', 'ups.com', 'https://www.linkedin.com/company/ups'],
  ] as const;
  const roles = [
    ['global_mobility', ['Global Mobility', 'Global Mobility Manager']],
    ['immigration', ['Immigration', 'Immigration Manager']],
    ['relocation', ['Relocation', 'Relocation Manager']],
    [
      'mixed_gm_immigration_relocation',
      ['Global Mobility', 'Immigration', 'Relocation'],
    ],
    [
      'impossible_strict_title',
      ['Senior Vice President of Interplanetary Global Mobility'],
    ],
  ] as const;
  const selectors = ['names', 'domains', 'linkedin_urls'] as const;
  const titleModes = ['similar', 'strict'] as const;
  const waitModes = ['default_wait', 'timeout_seconds_1'] as const;
  const cases: ToolCase[] = [];

  for (const [company, domain, linkedinUrl] of companies) {
    for (const selector of selectors) {
      for (const [roleId, titles] of roles) {
        for (const titleMode of titleModes) {
          for (const waitMode of waitModes) {
            const idSuffix = [
              company.toLowerCase(),
              selector,
              roleId,
              titleMode,
              waitMode,
            ].join('__');
            const waitFields =
              waitMode === 'timeout_seconds_1'
                ? { waitForResult: true, timeoutSeconds: 1 }
                : { waitForResult: true };

            cases.push({
              id: `search_people__${idSuffix}`,
              toolName: 'search_people',
              company,
              domain,
              args: {
                query: `${titles.join(' OR ')} at ${company}`,
                limit: 3,
                filters: {
                  company: companyFilter(selector, company, domain, linkedinUrl),
                  titles,
                  titleMatch: titleMode === 'strict' ? 'exact' : 'similar',
                },
                idempotencyKey: `w5_${idSuffix}_primitive`,
                ...waitFields,
              },
            });
            cases.push({
              id: `find_people_at_target_accounts__${idSuffix}`,
              toolName: 'find_people_at_target_accounts',
              company,
              domain,
              args: {
                ...workflowCompanyFilter(selector, company, domain, linkedinUrl),
                titles,
                titleMatch: titleMode === 'strict' ? 'exact' : 'similar',
                limit: 3,
                idempotencyKey: `w5_${idSuffix}_workflow`,
                ...waitFields,
              },
            });
          }
        }
      }
    }
  }

  return typeof maxCases === 'number' ? cases.slice(0, maxCases) : cases;
}

function companyFilter(
  selector: string,
  company: string,
  domain: string,
  linkedinUrl: string,
): Record<string, string[]> {
  if (selector === 'names') return { names: [company] };
  if (selector === 'domains') return { domains: [domain] };
  return { linkedinUrls: [linkedinUrl] };
}

function workflowCompanyFilter(
  selector: string,
  company: string,
  domain: string,
  linkedinUrl: string,
): Record<string, string[]> {
  if (selector === 'names') return { companyNames: [company] };
  if (selector === 'domains') return { companyDomains: [domain] };
  return { companyLinkedInUrls: [linkedinUrl] };
}

async function executeTool(toolCase: ToolCase, client: TheHogClient): Promise<unknown> {
  const tool =
    primitiveTools.find((candidate) => candidate.name === toolCase.toolName) ??
    workflowTools.find((candidate) => candidate.name === toolCase.toolName);
  assert.ok(tool, `missing tool ${toolCase.toolName}`);
  return tool.execute(parseToolInput(tool, toolCase.args), client);
}

function parseToolInput(
  tool: McpToolDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return z.object(tool.inputSchema).strict().parse(input);
}

function extractPeople(value: unknown): unknown[] {
  const json = JSON.stringify(value ?? {});
  const parsed = JSON.parse(json);
  return (
    firstArray(parsed, ['people']) ??
    firstArray(parsed, ['final', 'result', 'people']) ??
    firstArray(parsed, ['final', 'result', 'data']) ??
    firstArray(parsed, ['response', 'people']) ??
    []
  );
}

function readStatus(value: unknown): string | null {
  return (
    firstString(value, ['status']) ??
    firstString(value, ['final', 'status']) ??
    firstString(value, ['response', 'status'])
  );
}

function extractOperationIds(value: unknown): string[] {
  const json = JSON.stringify(value ?? {});
  return [...json.matchAll(/(?:operationId|asyncId)"\s*:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

function extractRequestIds(value: unknown): string[] {
  const json = JSON.stringify(value ?? {});
  return [...json.matchAll(/requestId"\s*:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

function extractProviderRunIds(value: unknown): string[] {
  const json = JSON.stringify(value ?? {});
  return [...json.matchAll(/(?:runId|providerRunId|apifyRunId)"\s*:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

function extractMetadataFlags(value: unknown): Record<string, unknown> {
  const metadata = firstRecord(value, ['metadata']) ?? firstRecord(value, ['meta']);
  if (!metadata) return {};
  return Object.fromEntries(
    [
      'plannerMode',
      'titleMatch',
      'fallbackReason',
      'companySeedCount',
      'filtersRelaxed',
      'providerOutcome',
      'resultCount',
      'coreRequestId',
    ]
      .filter((key) => metadata[key] !== undefined)
      .map((key) => [key, metadata[key]]),
  );
}

function extractCostOrCreditUsage(value: unknown): Record<string, unknown> | null {
  return (
    firstRecord(value, ['cost']) ??
    firstRecord(value, ['credits']) ??
    firstRecord(value, ['usage']) ??
    null
  );
}

function personMatchesCompany(person: unknown, toolCase: ToolCase): boolean {
  const text = JSON.stringify(person ?? {}).toLowerCase();
  return (
    text.includes(toolCase.company.toLowerCase()) ||
    text.includes(toolCase.domain.toLowerCase())
  );
}

function firstArray(value: unknown, path: string[]): unknown[] | null {
  const child = readPath(value, path);
  return Array.isArray(child) ? child : null;
}

function firstString(value: unknown, path: string[]): string | null {
  const child = readPath(value, path);
  return typeof child === 'string' ? child : null;
}

function firstRecord(value: unknown, path: string[]): Record<string, unknown> | null {
  const child = readPath(value, path);
  return child && typeof child === 'object' && !Array.isArray(child)
    ? (child as Record<string, unknown>)
    : null;
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function readMaxCases(): number | undefined {
  const raw = process.env.THEHOG_MCP_LIVE_GRID_MAX_CASES;
  if (!raw) return undefined;
  const parsed = Number(raw);
  assert.ok(Number.isInteger(parsed) && parsed > 0);
  return parsed;
}

function createTestRunId(): string {
  return `thehog-mcp-w5-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}
