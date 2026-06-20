import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowTools } from './definitions.js';

function assertSupportedPollAfterSeconds(value: unknown): void {
  assert.ok(typeof value === 'number');
  assert.ok(Number.isFinite(value));
  assert.ok(
    [2, 5, 10].includes(value),
    `expected pollAfterSeconds to use a supported polling backoff, got ${String(value)}`,
  );
}

const workflowNames = [
  'build_prospect_list',
  'find_people_at_target_accounts',
  'enrich_prospect_list',
  'research_company',
  'research_person',
  'scrape_and_extract',
  'monitor_topic',
  'analyze_social_profile',
].sort();

test('workflow tools expose the planned business-level tool set', () => {
  assert.deepEqual(
    workflowTools.map((tool) => tool.name).sort(),
    workflowNames,
  );
});

test('workflow tool schemas expose only curated public inputs', () => {
  const schemaKeys = Object.fromEntries(
    workflowTools.map((tool) => [tool.name, Object.keys(tool.inputSchema).sort()]),
  );

  assert.deepEqual(schemaKeys.build_prospect_list, [
    'companyLimit',
    'companyQuery',
    'contactFields',
    'idempotencyKey',
    'includeContactInfo',
    'peoplePerCompany',
    'personQuery',
    'signals_config',
    'timeoutSeconds',
    'waitForResult',
  ]);
  assert.deepEqual(schemaKeys.find_people_at_target_accounts, [
    'companyDomains',
    'companyLinkedInUrls',
    'companyNames',
    'contactFields',
    'idempotencyKey',
    'includeContactInfo',
    'limit',
    'locations',
    'signals_config',
    'timeoutSeconds',
    'titleMatch',
    'titles',
    'waitForResult',
  ]);
  assert.deepEqual(schemaKeys.research_company, [
    'companyName',
    'domain',
    'idempotencyKey',
    'includeRecentNews',
    'includeWebsiteCrawl',
    'model',
    'researchPrompt',
    'schema',
    'timeoutSeconds',
    'waitForResult',
  ]);
});

test('workflow annotations do not promise whole-workflow idempotency', () => {
  for (const tool of workflowTools) {
    assert.deepEqual(
      {
        readOnlyHint: tool.annotations.readOnlyHint,
        destructiveHint: tool.annotations.destructiveHint,
        idempotentHint: tool.annotations.idempotentHint,
        openWorldHint: tool.annotations.openWorldHint,
      },
      {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      tool.name,
    );
  }
});

test('build prospect list chains company search, people search, and enrichment', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'build_prospect_list');
  assert.ok(tool);

  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  const result = await tool.execute(
    {
      companyQuery: 'B2B SaaS companies hiring engineering leaders',
      personQuery: 'VP Engineering',
      companyLimit: 2,
      peoplePerCompany: 2,
      includeContactInfo: true,
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      requests.push(request);
      if (request.method === 'POST' && request.path === '/api/v1/companies/search') {
        return {
          data: { operationId: 'op_companies', status: 'queued' },
          status: 202,
          requestId: 'req_companies',
        };
      }
      if (request.path === '/api/operations/op_companies') {
        return {
          data: {
            id: 'op_companies',
            status: 'succeeded',
            result: {
              data: [
                {
                  name: 'Acme Data',
                  domain: 'acme.example',
                  linkedin_url: 'https://www.linkedin.com/company/acme-data',
                },
              ],
            },
          },
          status: 200,
          requestId: 'req_companies_poll',
        };
      }
      if (request.method === 'POST' && request.path === '/api/v1/people/search') {
        return {
          data: { operationId: 'op_people', status: 'queued' },
          status: 202,
          requestId: 'req_people',
        };
      }
      if (request.path === '/api/operations/op_people') {
        return {
          data: {
            id: 'op_people',
            status: 'succeeded',
            result: {
              data: [
                {
                  name: 'Ada Example',
                  linkedin_url: 'https://www.linkedin.com/in/ada-example',
                },
              ],
            },
          },
          status: 200,
          requestId: 'req_people_poll',
        };
      }
      if (request.method === 'POST' && request.path === '/api/enrichments') {
        return {
          data: { id: 'enrich_1', operationId: 'op_enrich', status: 'queued' },
          status: 202,
          requestId: 'req_enrich',
        };
      }
      if (request.path === '/api/enrichments/enrich_1') {
        return {
          data: { id: 'enrich_1', status: 'completed', data: [{ email: 'ada@example.com' }] },
          status: 200,
          requestId: 'req_enrich_poll',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.equal((result as { status: string }).status, 'success');
  assert.deepEqual(
    (result as { childOperationIds: string[] }).childOperationIds,
    ['op_companies', 'op_people', 'op_enrich'],
  );
  assert.deepEqual(requests[2]?.body, {
    query: 'VP Engineering',
    limit: 4,
    includeContacts: true,
    filters: {
      company: {
        domains: ['acme.example'],
        names: ['Acme Data'],
        linkedinUrls: ['https://www.linkedin.com/company/acme-data'],
      },
    },
  });
  assert.deepEqual(requests[4]?.body, {
    identifiers: [{ linkedin_url: 'https://www.linkedin.com/in/ada-example' }],
    fields: ['contact.email'],
    signals_config: undefined,
  });
});

test('build prospect list returns partial results when a later step fails', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'build_prospect_list');
  assert.ok(tool);

  const result = await tool.execute(
    {
      companyQuery: 'AI security startups',
      personQuery: 'Head of Security',
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      if (request.method === 'POST' && request.path === '/api/v1/companies/search') {
        return {
          data: { operationId: 'op_companies', status: 'queued' },
          status: 202,
          requestId: 'req_companies',
        };
      }
      if (request.path === '/api/operations/op_companies') {
        return {
          data: {
            id: 'op_companies',
            status: 'succeeded',
            result: { data: [{ name: 'Secure Example', domain: 'secure.example' }] },
          },
          status: 200,
          requestId: 'req_companies_poll',
        };
      }
      if (request.method === 'POST' && request.path === '/api/v1/people/search') {
        throw new Error('temporary people search failure');
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.equal((result as { status: string }).status, 'partial_success');
  assert.equal((result as { warnings: unknown[] }).warnings.length, 1);
  assert.match(
    JSON.stringify((result as { warnings: unknown[] }).warnings),
    /temporary people search failure/,
  );
  assert.deepEqual((result as { summary: { companyCount: number } }).summary.companyCount, 1);
});

test('build prospect list does not run an unscoped people search when company discovery fails', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'build_prospect_list');
  assert.ok(tool);

  const requests: string[] = [];
  const result = await tool.execute(
    {
      companyQuery: 'AI security startups',
      personQuery: 'Head of Security',
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      requests.push(`${request.method} ${request.path}`);
      if (request.method === 'POST' && request.path === '/api/v1/companies/search') {
        throw new Error('temporary company search failure');
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.equal((result as { status: string }).status, 'failed');
  assert.deepEqual(requests, ['POST /api/v1/companies/search']);
});

test('build prospect list does not run an unscoped people search when no companies return', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'build_prospect_list');
  assert.ok(tool);

  const requests: string[] = [];
  const result = await tool.execute(
    {
      companyQuery: 'AI security startups',
      personQuery: 'Head of Security',
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      requests.push(`${request.method} ${request.path}`);
      if (request.method === 'POST' && request.path === '/api/v1/companies/search') {
        return {
          data: { operationId: 'op_companies', status: 'queued' },
          status: 202,
          requestId: 'req_companies',
        };
      }
      if (request.path === '/api/operations/op_companies') {
        return {
          data: {
            id: 'op_companies',
            status: 'succeeded',
            result: { data: [] },
          },
          status: 200,
          requestId: 'req_companies_poll',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.equal((result as { status: string }).status, 'partial_success');
  assert.deepEqual(requests, [
    'POST /api/v1/companies/search',
    'GET /api/operations/op_companies',
  ]);
  assert.deepEqual(
    (result as { summary: { peopleCount: number } }).summary.peopleCount,
    0,
  );
});

test('build prospect list does not run people search when company filters cannot be derived', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'build_prospect_list');
  assert.ok(tool);

  const requests: string[] = [];
  const result = await tool.execute(
    {
      companyQuery: 'stealth startups',
      personQuery: 'Founder',
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      requests.push(`${request.method} ${request.path}`);
      if (request.method === 'POST' && request.path === '/api/v1/companies/search') {
        return {
          data: { operationId: 'op_companies', status: 'queued' },
          status: 202,
          requestId: 'req_companies',
        };
      }
      if (request.path === '/api/operations/op_companies') {
        return {
          data: {
            id: 'op_companies',
            status: 'succeeded',
            result: { data: [{ score: 0.99 }] },
          },
          status: 200,
          requestId: 'req_companies_poll',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.equal((result as { status: string }).status, 'partial_success');
  assert.deepEqual(requests, [
    'POST /api/v1/companies/search',
    'GET /api/operations/op_companies',
  ]);
  assert.deepEqual(
    (result as { summary: { companyCount: number; peopleCount: number } }).summary,
    { companyCount: 1, peopleCount: 0, enrichmentCount: 0 },
  );
});

test('target account workflow requires at least one account selector', async () => {
  const tool = workflowTools.find(
    (candidate) => candidate.name === 'find_people_at_target_accounts',
  );
  assert.ok(tool);
  await assert.rejects(
    () =>
      tool.execute(
        {
          titles: ['VP Engineering'],
        },
        fakeClient(async () => {
          throw new Error('should not be called');
        }),
      ),
    /company domain, company name, or company LinkedIn URL/,
  );
});

test('find people at target accounts forwards title mode and LinkedIn company selectors', async () => {
  const tool = workflowTools.find(
    (candidate) => candidate.name === 'find_people_at_target_accounts',
  );
  assert.ok(tool);

  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  await tool.execute(
    {
      companyLinkedInUrls: ['https://www.linkedin.com/company/walmart'],
      titles: ['Global Mobility', 'Immigration'],
      titleMatch: 'similar',
      locations: ['United States'],
      limit: 3,
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      requests.push(request);
      if (request.method === 'POST' && request.path === '/api/v1/people/search') {
        return {
          data: { operationId: 'op_people', status: 'queued' },
          status: 202,
          requestId: 'req_people',
        };
      }
      if (request.path === '/api/operations/op_people') {
        return {
          data: { id: 'op_people', status: 'succeeded', result: { data: [] } },
          status: 200,
          requestId: 'req_people_poll',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.deepEqual(requests[0]?.body, {
    query: 'Global Mobility OR Immigration',
    limit: 3,
    includeContacts: false,
    filters: {
      titles: ['Global Mobility', 'Immigration'],
      titleMatch: 'similar',
      locations: ['United States'],
      company: {
        linkedinUrls: ['https://www.linkedin.com/company/walmart'],
      },
    },
  });
});

test('find people at target accounts keeps account identity in structured filters, not generic query text', async () => {
  const tool = workflowTools.find(
    (candidate) => candidate.name === 'find_people_at_target_accounts',
  );
  assert.ok(tool);

  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  await tool.execute(
    {
      companyDomains: ['commonroom.io'],
      titles: ['VP of Sales', 'Vice President of Sales'],
      titleMatch: 'similar',
      limit: 5,
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      requests.push(request);
      if (request.method === 'POST' && request.path === '/api/v1/people/search') {
        return {
          data: { operationId: 'op_people', status: 'queued' },
          status: 202,
          requestId: 'req_people',
        };
      }
      if (request.path === '/api/operations/op_people') {
        return {
          data: { id: 'op_people', status: 'succeeded', result: { data: [] } },
          status: 200,
          requestId: 'req_people_poll',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.deepEqual(requests[0]?.body, {
    query: 'VP of Sales OR Vice President of Sales',
    limit: 5,
    includeContacts: false,
    filters: {
      titles: ['VP of Sales', 'Vice President of Sales'],
      titleMatch: 'similar',
      company: {
        domains: ['commonroom.io'],
      },
    },
  });
});

test('find people at target accounts sends neutral query for company-only searches', async () => {
  const tool = workflowTools.find(
    (candidate) => candidate.name === 'find_people_at_target_accounts',
  );
  assert.ok(tool);

  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  await tool.execute(
    {
      companyDomains: ['commonroom.io'],
      limit: 5,
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      requests.push(request);
      if (request.method === 'POST' && request.path === '/api/v1/people/search') {
        return {
          data: { operationId: 'op_people', status: 'queued' },
          status: 202,
          requestId: 'req_people',
        };
      }
      if (request.path === '/api/operations/op_people') {
        return {
          data: { id: 'op_people', status: 'succeeded', result: { data: [] } },
          status: 200,
          requestId: 'req_people_poll',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.deepEqual(requests[0]?.body, {
    query: 'people',
    limit: 5,
    includeContacts: false,
    filters: {
      company: {
        domains: ['commonroom.io'],
      },
    },
  });
});

test('find people at target accounts returns a resume handoff on forced timeout', async () => {
  const tool = workflowTools.find(
    (candidate) => candidate.name === 'find_people_at_target_accounts',
  );
  assert.ok(tool);

  const result = await tool.execute(
    {
      companyNames: ['Walmart'],
      titles: ['Global Mobility Manager'],
      waitForResult: true,
      timeoutSeconds: 1,
    },
    fakeClient(async (request) => {
      if (request.method === 'POST' && request.path === '/api/v1/people/search') {
        return {
          data: { operationId: 'op_people', status: 'queued' },
          status: 202,
          requestId: 'req_people',
        };
      }
      if (request.path === '/api/operations/op_people') {
        return {
          data: { id: 'op_people', status: 'running' },
          status: 200,
          requestId: 'req_people_poll',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  const { pollAfterSeconds, ...handoff } = result as Record<string, unknown>;
  assertSupportedPollAfterSeconds(pollAfterSeconds);
  assert.deepEqual(handoff, {
    status: 'still_running',
    still_running: true,
    operationId: 'op_people',
    nextTool: 'get_operation',
    nextInput: { id: 'op_people' },
    message: 'The request is still running. Use get_operation with this ID to continue.',
    requestId: 'req_people',
  });
});

test('workflow sub-step idempotency keys are stable when omitted', async () => {
  const tool = workflowTools.find(
    (candidate) => candidate.name === 'find_people_at_target_accounts',
  );
  assert.ok(tool);

  const idempotencyKeys: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await tool.execute(
      {
        companyNames: ['Walmart'],
        titles: ['Global Mobility Manager'],
        waitForResult: false,
      },
      {
        request: async (request: FakeRequest) => {
          idempotencyKeys.push(request.idempotencyKey ?? '');
          return {
            data: { operationId: `op_people_${attempt}`, status: 'queued' },
            status: 202,
            requestId: 'req_people',
          };
        },
        createIdempotencyKey: () => {
          throw new Error('random idempotency keys should not be used');
        },
      } as never,
    );
  }

  assert.equal(idempotencyKeys.length, 2);
  assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
  assert.match(
    idempotencyKeys[0] ?? '',
    /^find_people_at_target_accounts_people_[a-f0-9]{32}$/,
  );
});

test('scrape and extract only starts deep research when extraction is requested', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'scrape_and_extract');
  assert.ok(tool);

  const scrapeOnlyRequests: string[] = [];
  await tool.execute(
    { url: 'https://example.com' },
    fakeClient(async (request) => {
      scrapeOnlyRequests.push(request.path);
      return {
        data: { markdown: 'Example page' },
        status: 200,
        requestId: 'req_scrape',
      };
    }),
  );
  assert.deepEqual(scrapeOnlyRequests, ['/api/v1/platform/scrapers/web/scrape']);

  const extractionRequests: string[] = [];
  const result = await tool.execute(
    {
      url: 'https://example.com',
      instructions: 'Extract the pricing model.',
      timeoutSeconds: 5,
    },
    fakeClient(async (request) => {
      extractionRequests.push(request.path);
      if (request.path === '/api/v1/platform/scrapers/web/scrape') {
        return {
          data: { markdown: 'Pricing starts at $99.' },
          status: 200,
          requestId: 'req_scrape',
        };
      }
      if (request.path === '/api/deep-research') {
        return {
          data: { operationId: 'op_extract', status: 'queued' },
          status: 202,
          requestId: 'req_extract',
        };
      }
      if (request.path === '/api/operations/op_extract') {
        return {
          data: { id: 'op_extract', status: 'succeeded', result: { summary: 'Paid plan' } },
          status: 200,
          requestId: 'req_extract_poll',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.deepEqual(extractionRequests, [
    '/api/v1/platform/scrapers/web/scrape',
    '/api/deep-research',
  ]);
  assert.equal((result as { status: string }).status, 'still_running');
  assert.equal((result as { operationId: string }).operationId, 'op_extract');
  assert.equal((result as { nextTool: string }).nextTool, 'get_operation');
});

test('monitor topic validates source-specific fields before creating monitors', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'monitor_topic');
  assert.ok(tool);

  await assert.rejects(
    () =>
      tool.execute(
        {
          name: 'Site monitor',
          topic: 'new launch',
          sources: ['site_search'],
        },
        fakeClient(async () => {
          throw new Error('should not be called');
        }),
      ),
    /site_search monitors require site/,
  );

  await assert.rejects(
    () =>
      tool.execute(
        {
          name: 'Post monitor',
          topic: 'engagement',
          sources: ['linkedin_post'],
        },
        fakeClient(async () => {
          throw new Error('should not be called');
        }),
      ),
    /linkedin_post monitors require postUrl/,
  );
});

test('monitor topic sends valid site config and source-specific cadence floors', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'monitor_topic');
  assert.ok(tool);

  const requests: Array<{ path: string; body?: unknown }> = [];
  await tool.execute(
    {
      name: 'Site monitor',
      topic: 'new launch',
      sources: ['site_search'],
      site: 'example.com',
      cadenceMinutes: 15,
    },
    fakeClient(async (request) => {
      requests.push(request);
      if (request.method === 'POST' && request.path === '/api/v1/monitors') {
        return { data: { id: 'mon_site' }, status: 201, requestId: 'req_monitor' };
      }
      if (request.method === 'GET' && request.path === '/api/v1/monitors/mon_site/events') {
        return { data: { events: [] }, status: 200, requestId: 'req_events' };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.deepEqual(requests[0]?.body, {
    name: 'Site monitor',
    type: 'site_search',
    config: { query: 'new launch', site: 'example.com' },
    cadence_minutes: 15,
    max_results: 10,
    force_fresh: undefined,
    post_url: undefined,
  });

  const linkedinRequests: Array<{ path: string; body?: unknown }> = [];
  await tool.execute(
    {
      name: 'Post monitor',
      topic: 'engagement',
      sources: ['linkedin_post'],
      postUrl: 'https://www.linkedin.com/feed/update/activity:123/',
      cadenceMinutes: 15,
    },
    fakeClient(async (request) => {
      linkedinRequests.push(request);
      if (request.method === 'POST' && request.path === '/api/v1/monitors') {
        return { data: { id: 'mon_linkedin' }, status: 201, requestId: 'req_monitor' };
      }
      if (
        request.method === 'GET' &&
        request.path === '/api/v1/monitors/mon_linkedin/events'
      ) {
        return { data: { events: [] }, status: 200, requestId: 'req_events' };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.deepEqual(linkedinRequests[0]?.body, {
    name: 'Post monitor',
    type: 'linkedin_post',
    config: {
      post_url: 'https://www.linkedin.com/feed/update/activity:123/',
      query: 'engagement',
    },
    cadence_minutes: 60,
    max_results: 10,
    force_fresh: undefined,
    post_url: 'https://www.linkedin.com/feed/update/activity:123/',
  });
});

test('monitor topic still creates later sources when an earlier run returns a continuation', async () => {
  const tool = workflowTools.find((candidate) => candidate.name === 'monitor_topic');
  assert.ok(tool);

  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  const result = await tool.execute(
    {
      name: 'Topic monitor',
      topic: 'new launch',
      sources: ['site_search', 'web_search'],
      site: 'example.com',
      runNow: true,
      waitForResult: false,
    },
    fakeClient(async (request) => {
      requests.push(request);
      if (request.method === 'POST' && request.path === '/api/v1/monitors') {
        const type = (request.body as { type?: string }).type;
        return {
          data: { id: type === 'site_search' ? 'mon_site' : 'mon_web' },
          status: 201,
          requestId: `req_create_${type}`,
        };
      }
      if (
        request.method === 'POST' &&
        request.path === '/api/v1/monitors/mon_site/run-now'
      ) {
        return {
          data: { operationId: 'op_site_run', status: 'queued' },
          status: 202,
          requestId: 'req_run_site',
        };
      }
      if (
        request.method === 'POST' &&
        request.path === '/api/v1/monitors/mon_web/run-now'
      ) {
        return {
          data: { operationId: 'op_web_run', status: 'queued' },
          status: 202,
          requestId: 'req_run_web',
        };
      }
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    }),
  );

  assert.deepEqual(
    requests
      .filter((request) => request.method === 'POST' && request.path === '/api/v1/monitors')
      .map((request) => (request.body as { type?: string }).type),
    ['site_search', 'web_search'],
  );
  assert.equal((result as { status: string }).status, 'still_running');
  assert.equal((result as { operationId: string }).operationId, 'op_site_run');
  assert.equal((result as { summary: { monitorCount: number } }).summary.monitorCount, 2);
});

type FakeRequest = {
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, unknown>;
  idempotencyKey?: string;
};

function fakeClient(
  handler: (request: FakeRequest) => Promise<unknown>,
): never {
  return {
    request: handler,
    createIdempotencyKey: (prefix: string) => `${prefix}_idem`,
  } as never;
}
