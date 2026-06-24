import assert from 'node:assert/strict';
import test from 'node:test';
import { primitiveTools } from './definitions.js';
import { endpointTool } from './endpoint-tool.js';

function assertSupportedPollAfterSeconds(value: unknown): void {
  assert.ok(typeof value === 'number');
  assert.ok(Number.isFinite(value));
  assert.ok(
    [2, 5, 10].includes(value),
    `expected pollAfterSeconds to use a supported polling backoff, got ${String(value)}`,
  );
}

test('delete monitor requires confirmation', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'delete_monitor');
  assert.ok(tool);
  await assert.rejects(
    () =>
      tool.execute(
        { id: 'mon_1' },
        {
          request: async () => ({ data: null, status: 204, requestId: null }),
          createIdempotencyKey: () => 'idem',
        } as never,
      ),
    /confirm: true/,
  );
});

test('async primitive tools strip MCP controls, set idempotency, and poll when requested', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'search_companies');
  assert.ok(tool);

  const requests: Array<{
    method: string;
    path: string;
    body?: unknown;
    idempotencyKey?: string;
  }> = [];
  const result = await tool.execute(
    {
      query: 'AI infrastructure companies',
      limit: 5,
      timeoutSeconds: 5,
      waitForResult: true,
      idempotencyKey: 'idem_123',
    },
    {
      request: async (request: {
        method: string;
        path: string;
        body?: unknown;
        idempotencyKey?: string;
      }) => {
        requests.push(request);
        if (request.method === 'POST') {
          return {
            data: { operationId: 'op_123', status: 'queued' },
            status: 202,
            requestId: 'req_123',
          };
        }
        return {
          data: { id: 'op_123', status: 'completed', data: [{ name: 'Example' }] },
          status: 200,
          requestId: 'req_poll',
        };
      },
      createIdempotencyKey: () => 'generated_idem',
    } as never,
  );

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], {
    method: 'POST',
    path: '/api/v1/companies/search',
    query: undefined,
    body: { query: 'AI infrastructure companies', limit: 5 },
    idempotencyKey: 'idem_123',
  });
  assert.deepEqual(requests[1], {
    method: 'GET',
    path: '/api/operations/op_123',
    timeoutMs: 5000,
  });
  assert.deepEqual(result, {
    initial: { operationId: 'op_123', status: 'queued' },
    final: { id: 'op_123', status: 'completed', data: [{ name: 'Example' }] },
    timedOut: false,
    pollAttempts: 1,
    requestId: 'req_123',
  });
});

test('async primitive tools do not repoll terminal initial responses', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'search_people');
  assert.ok(tool);

  const requests: Array<{ method: string; path: string }> = [];
  const result = await tool.execute(
    { query: 'security engineers', waitForResult: true },
    {
      request: async (request: { method: string; path: string }) => {
        requests.push(request);
        return {
          data: { operationId: 'op_people', status: 'succeeded', result: { data: [] } },
          status: 200,
          requestId: 'req_people',
        };
      },
      createIdempotencyKey: () => 'generated_search_people',
    } as never,
  );

  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: request.path })),
    [{ method: 'POST', path: '/api/v1/people/search' }],
  );
  assert.deepEqual(result, {
    response: { operationId: 'op_people', status: 'succeeded', result: { data: [] } },
    requestId: 'req_people',
  });
});

test('async primitive tools do not repoll nested terminal initial responses', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'submit_search');
  assert.ok(tool);

  const requests: Array<{ method: string; path: string }> = [];
  const result = await tool.execute(
    { type: 'web_search', query: 'the hog api', waitForResult: true },
    {
      request: async (request: { method: string; path: string }) => {
        requests.push(request);
        return {
          data: { id: 'search_1', data: { status: 'completed', results: [] } },
          status: 200,
          requestId: 'req_search',
        };
      },
      createIdempotencyKey: () => 'generated_submit_search',
    } as never,
  );

  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: request.path })),
    [{ method: 'POST', path: '/api/v1/search' }],
  );
  assert.deepEqual(result, {
    response: { id: 'search_1', data: { status: 'completed', results: [] } },
    requestId: 'req_search',
  });
});

test('configured async primitive tools return direct responses when no async ID exists', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'search_people');
  assert.ok(tool);

  const requests: Array<{ method: string; path: string }> = [];
  const result = await tool.execute(
    { query: 'security engineers', waitForResult: true },
    {
      request: async (request: { method: string; path: string }) => {
        requests.push(request);
        return {
          data: { status: 'queued' },
          status: 202,
          requestId: 'req_people',
        };
      },
      createIdempotencyKey: () => 'generated_search_people',
    } as never,
  );

  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: request.path })),
    [{ method: 'POST', path: '/api/v1/people/search' }],
  );
  assert.deepEqual(result, {
    response: { status: 'queued' },
    requestId: 'req_people',
  });
});

test('async primitive tools return a top-level continuation on forced timeout', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'search_people');
  assert.ok(tool);

  const result = await tool.execute(
    {
      query: 'Global Mobility Manager at Walmart',
      waitForResult: true,
      timeoutSeconds: 1,
    },
    {
      request: async (request: { method: string; path: string }) => {
        if (request.method === 'POST') {
          return {
            data: { operationId: 'op_people', status: 'queued' },
            status: 202,
            requestId: 'req_start',
          };
        }
        return {
          data: { id: 'op_people', status: 'running' },
          status: 200,
          requestId: 'req_poll',
        };
      },
      createIdempotencyKey: () => {
        throw new Error('random idempotency keys should not be used');
      },
    } as never,
  );

  const { pollAfterSeconds, ...continuation } = result as Record<string, unknown>;
  assertSupportedPollAfterSeconds(pollAfterSeconds);
  assert.deepEqual(continuation, {
    status: 'still_running',
    still_running: true,
    operationId: 'op_people',
    nextTool: 'get_operation',
    nextInput: { id: 'op_people' },
    message: 'The request is still running. Use get_operation with this ID to continue.',
    requestId: 'req_start',
  });
});

test('async primitive idempotency keys are stable when omitted', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'search_companies');
  assert.ok(tool);

  const idempotencyKeys: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await tool.execute(
      {
        query: 'AI infrastructure companies',
        limit: 5,
        waitForResult: false,
      },
      {
        request: async (request: { idempotencyKey?: string }) => {
          idempotencyKeys.push(request.idempotencyKey ?? '');
          return {
            data: { operationId: `op_${attempt}`, status: 'queued' },
            status: 202,
            requestId: 'req_start',
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
  assert.match(idempotencyKeys[0] ?? '', /^search_companies_[a-f0-9]{32}$/);
});

test('scrape_web_pages requires at least one url or item', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'scrape_web_pages');
  assert.ok(tool);

  await assert.rejects(
    () =>
      tool.execute(
        {},
        {
          request: async () => {
            throw new Error('request should not be sent');
          },
          createIdempotencyKey: () => 'generated_scrape_web_pages',
        } as never,
      ),
    /requires at least one url or item/,
  );
});

test('scrape_web_page forwards requested formats and schema-guided extraction fields', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'scrape_web_page');
  assert.ok(tool);

  const requests: Array<{
    method: string;
    path: string;
    body?: unknown;
    idempotencyKey?: string;
  }> = [];
  await tool.execute(
    {
      url: 'https://example.com',
      renderJs: true,
      formats: ['markdown', 'json'],
      jsonSchema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
      instructions: 'Extract the page title.',
      idempotencyKey: 'idem_scrape_json',
    },
    {
      request: async (request: {
        method: string;
        path: string;
        body?: unknown;
        idempotencyKey?: string;
      }) => {
        requests.push(request);
        return {
          data: { data: { markdown: '# Example', json: { title: 'Example' } } },
          status: 200,
          requestId: 'req_scrape',
        };
      },
      createIdempotencyKey: () => 'generated_scrape_web_page',
    } as never,
  );

  assert.deepEqual(requests, [
    {
      method: 'POST',
      path: '/api/v1/platform/scrapers/web/scrape',
      query: undefined,
      body: {
        url: 'https://example.com',
        renderJs: true,
        formats: ['markdown', 'json'],
        jsonSchema: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
          additionalProperties: false,
        },
        instructions: 'Extract the page title.',
      },
      idempotencyKey: 'idem_scrape_json',
    },
  ]);
});

test('scrape_web_page validates json extraction fields before sending requests', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'scrape_web_page');
  assert.ok(tool);

  const client = {
    request: async () => {
      throw new Error('request should not be sent');
    },
    createIdempotencyKey: () => 'generated_scrape_web_page',
  } as never;

  await assert.rejects(
    () =>
      tool.execute(
        {
          url: 'https://example.com',
          formats: ['json'],
        },
        client,
      ),
    /jsonSchema/,
  );

  await assert.rejects(
    () =>
      tool.execute(
        {
          url: 'https://example.com',
          jsonSchema: { type: 'object' },
        },
        client,
      ),
    /formats to include json/,
  );

  await assert.rejects(
    () =>
      tool.execute(
        {
          url: 'https://example.com',
          instructions: 'Extract the title.',
        },
        client,
      ),
    /formats to include json/,
  );
});

test('mutating primitive tools expose idempotency and risk annotations', async () => {
  const sampleInputs: Record<string, Record<string, unknown>> = {
    search_companies: { query: 'security companies' },
    search_people: { query: 'security engineers' },
    enrich_contact: { identifier: { email: 'ada@example.com' }, fields: ['contact.email'] },
    enrich_contacts: {
      identifiers: [{ email: 'ada@example.com' }],
      fields: ['contact.email'],
    },
    start_deep_research: {
      prompt: 'Research Acme',
      schema: { type: 'object', properties: {}, additionalProperties: true },
    },
    submit_search: { type: 'web_search', query: 'the hog api' },
    search_web: { query: 'the hog api' },
    crawl_website: { url: 'https://example.com' },
    scrape_web_page: { url: 'https://example.com' },
    scrape_web_pages: { urls: ['https://example.com'] },
    detect_image_deepfake: { url: 'https://example.com/image.jpg' },
    get_seo_domain_overview: { domain: 'example.com' },
    list_seo_keywords: {
      domain: 'example.com',
      searchType: 'MostValuable',
    },
    list_seo_competing_keywords: {
      includedDomains: ['example.com', 'competitor.com'],
    },
    get_facebook_page: { url: 'https://www.facebook.com/openai' },
    get_facebook_post: { url: 'https://www.facebook.com/openai/posts/123' },
    get_linkedin_company: { identifier: 'openai' },
    list_linkedin_company_posts: { companySlug: 'openai' },
    find_linkedin_companies: { domains: ['openai.com'] },
    search_linkedin_posts: { keyword: 'ai' },
    list_linkedin_post_comments: {
      postUrls: ['https://www.linkedin.com/feed/update/urn:li:activity:123'],
    },
    list_linkedin_post_reactions: {
      postUrls: ['https://www.linkedin.com/feed/update/urn:li:activity:123'],
    },
    get_linkedin_profile: { username: 'example' },
    list_linkedin_profile_posts: { username: 'example' },
    list_linkedin_profile_comments: { profiles: ['example'] },
    list_linkedin_profile_reactions: { profiles: ['example'] },
    get_instagram_profile: { username: 'example' },
    list_instagram_posts: { username: 'example' },
    get_instagram_post: { postUrl: 'https://www.instagram.com/p/example/' },
    list_instagram_post_comments: {
      postUrl: 'https://www.instagram.com/p/example/',
    },
    list_instagram_followers: { username: 'example' },
    list_instagram_following: { username: 'example' },
    get_tiktok_profile: { username: 'example' },
    get_x_profile: { username: 'example' },
    get_x_post: { postUrl: 'https://x.com/example/status/123' },
    get_x_conversation: { postId: '123' },
    search_x_posts: { query: 'the hog' },
    get_youtube_channel: { url: 'https://www.youtube.com/@OpenAI' },
    get_youtube_video: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    create_monitor: {
      name: 'Site monitor',
      type: 'site_search',
      config: { site: 'example.com', query: 'security' },
    },
    update_monitor: { id: 'mon_1', name: 'Updated monitor' },
    run_monitor_now: { id: 'mon_1' },
  };

  const mutatingTools = primitiveTools.filter(
    (tool) => tool.endpoint.method === 'POST' || tool.endpoint.method === 'PATCH',
  );
  assert.equal(
    mutatingTools.every((tool) => tool.name in sampleInputs),
    true,
  );

  for (const tool of mutatingTools) {
    assert.ok(tool.inputSchema.idempotencyKey, `${tool.name} exposes idempotencyKey`);
    assert.deepEqual(
      {
        readOnlyHint: tool.annotations.readOnlyHint,
        destructiveHint: tool.annotations.destructiveHint,
        idempotentHint: tool.annotations.idempotentHint,
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      `${tool.name} annotations`,
    );

    const requests: Array<{ body?: unknown; idempotencyKey?: string }> = [];
    await tool.execute(
      {
        ...sampleInputs[tool.name],
        idempotencyKey: `idem_${tool.name}`,
        waitForResult: false,
      },
      {
        request: async (request: { body?: unknown; idempotencyKey?: string }) => {
          requests.push(request);
          return { data: { id: 'result_1', operationId: 'op_1' }, status: 200, requestId: null };
        },
        createIdempotencyKey: () => `generated_${tool.name}`,
      } as never,
    );

    assert.equal(requests[0].idempotencyKey, `idem_${tool.name}`, tool.name);
    assert.equal(
      JSON.stringify(requests[0].body).includes('idempotencyKey'),
      false,
      `${tool.name} strips idempotencyKey from body`,
    );
  }
});

test('detect_image_deepfake exposes only URL input and hides provider identity', () => {
  const tool = primitiveTools.find(
    (candidate) => candidate.name === 'detect_image_deepfake',
  );
  assert.ok(tool);
  assert.deepEqual(Object.keys(tool.inputSchema).sort(), ['idempotencyKey', 'url']);
  assert.doesNotMatch(tool.description, /sightengine|provider|model/i);
});

test('read-only and destructive primitive tools expose risk annotations', () => {
  const readOnlyTools = primitiveTools.filter((tool) => tool.endpoint.method === 'GET');
  assert.ok(readOnlyTools.length > 0);
  for (const tool of readOnlyTools) {
    assert.deepEqual(
      {
        readOnlyHint: tool.annotations.readOnlyHint,
        destructiveHint: tool.annotations.destructiveHint,
        idempotentHint: tool.annotations.idempotentHint,
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      tool.name,
    );
  }

  const deleteMonitor = primitiveTools.find((tool) => tool.name === 'delete_monitor');
  assert.ok(deleteMonitor);
  assert.deepEqual(
    {
      readOnlyHint: deleteMonitor.annotations.readOnlyHint,
      destructiveHint: deleteMonitor.annotations.destructiveHint,
      idempotentHint: deleteMonitor.annotations.idempotentHint,
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  );
});

test('start_deep_research schema matches the public request body', () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'start_deep_research');
  assert.ok(tool);
  assert.deepEqual(Object.keys(tool.inputSchema).sort(), [
    'idempotencyKey',
    'inputAnchors',
    'model',
    'prompt',
    'schema',
    'timeoutSeconds',
    'urls',
    'waitForResult',
  ]);
});

test('submit_search requires at least one search criterion before calling the API', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'submit_search');
  assert.ok(tool);

  let called = false;
  await assert.rejects(
    () =>
      tool.execute(
        { type: 'web_search' },
        {
          request: async () => {
            called = true;
            return { data: null, status: 200, requestId: null };
          },
          createIdempotencyKey: () => 'idem',
        } as never,
      ),
    /requires at least one search criterion/,
  );
  assert.equal(called, false);
});

test('submit_search accepts non-query criteria and strips MCP controls', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'submit_search');
  assert.ok(tool);

  const requests: Array<{ body?: unknown; idempotencyKey?: string }> = [];
  await tool.execute(
    {
      type: 'tiktok_hashtag',
      hashtag: 'thehog',
      waitForResult: false,
      idempotencyKey: 'idem_search',
    },
    {
      request: async (request: { body?: unknown; idempotencyKey?: string }) => {
        requests.push(request);
        return { data: { id: 'search_1', status: 'queued' }, status: 202, requestId: 'req_1' };
      },
      createIdempotencyKey: () => 'generated_idem',
    } as never,
  );

  assert.deepEqual(requests[0], {
    method: 'POST',
    path: '/api/v1/search',
    query: undefined,
    body: { type: 'tiktok_hashtag', hashtag: 'thehog' },
    idempotencyKey: 'idem_search',
  });
  assert.equal(requests.length, 1);
});

test('enrichment polling uses the enrichment ID from queued responses when requested', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'enrich_contacts');
  assert.ok(tool);

  const paths: string[] = [];
  await tool.execute(
    {
      identifiers: [{ linkedin_url: 'https://www.linkedin.com/in/example' }],
      fields: ['contact.email'],
      waitForResult: true,
      timeoutSeconds: 5,
    },
    {
      request: async (request: { method: string; path: string }) => {
        paths.push(request.path);
        if (request.method === 'POST') {
          return {
            data: {
              id: 'enrich_123',
              operationId: 'op_123',
              status: 'queued',
            },
            status: 202,
            requestId: 'req_enrich',
          };
        }
        return {
          data: { id: 'enrich_123', status: 'completed', data: [] },
          status: 200,
          requestId: 'req_poll',
        };
      },
      createIdempotencyKey: () => 'generated_idem',
    } as never,
  );

  assert.deepEqual(paths, ['/api/enrichments', '/api/enrichments/enrich_123']);
});

test('async primitive tools poll the correct status endpoint when requested', async () => {
  const cases: Array<{
    name: string;
    input: Record<string, unknown>;
    queued: Record<string, unknown>;
    pollPath: string;
  }> = [
    {
      name: 'search_companies',
      input: { query: 'security companies' },
      queued: { operationId: 'op_companies', status: 'queued' },
      pollPath: '/api/operations/op_companies',
    },
    {
      name: 'search_people',
      input: { query: 'security engineers' },
      queued: { operationId: 'op_people', status: 'queued' },
      pollPath: '/api/operations/op_people',
    },
    {
      name: 'start_deep_research',
      input: { prompt: 'Research Acme', schema: { type: 'object' } },
      queued: { operationId: 'op_research', status: 'queued' },
      pollPath: '/api/operations/op_research',
    },
    {
      name: 'enrich_contact',
      input: { identifier: { email: 'ada@example.com' }, fields: ['contact.email'] },
      queued: { id: 'enrich_one', status: 'queued' },
      pollPath: '/api/enrichments/enrich_one',
    },
    {
      name: 'enrich_contacts',
      input: {
        identifiers: [{ email: 'ada@example.com' }],
        fields: ['contact.email'],
      },
      queued: { id: 'enrich_batch', status: 'queued' },
      pollPath: '/api/enrichments/enrich_batch',
    },
    {
      name: 'submit_search',
      input: { type: 'web_search', query: 'the hog api' },
      queued: { id: 'search_123', status: 'queued' },
      pollPath: '/api/v1/search/search_123',
    },
  ];

  for (const item of cases) {
    const tool = primitiveTools.find((candidate) => candidate.name === item.name);
    assert.ok(tool, item.name);
    assert.ok(tool.inputSchema.waitForResult, `${item.name} exposes waitForResult`);
    assert.ok(tool.inputSchema.timeoutSeconds, `${item.name} exposes timeoutSeconds`);

    const requests: Array<{ method: string; path: string; timeoutMs?: number }> = [];
    await tool.execute(
      { ...item.input, waitForResult: true, timeoutSeconds: 5 },
      {
        request: async (request: { method: string; path: string; timeoutMs?: number }) => {
          requests.push(request);
          if (request.method === 'POST') {
            return { data: item.queued, status: 202, requestId: `req_${item.name}` };
          }
          return {
            data: { id: item.pollPath.split('/').at(-1), status: 'completed' },
            status: 200,
            requestId: `req_poll_${item.name}`,
          };
        },
        createIdempotencyKey: () => `generated_${item.name}`,
      } as never,
    );

    assert.equal(requests[1]?.method, 'GET', item.name);
    assert.equal(requests[1]?.path, item.pollPath, item.name);
    assert.equal(requests[1]?.timeoutMs, 5000, item.name);
  }
});

test('async primitive tools return a continuation when polling is disabled', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'search_people');
  assert.ok(tool);

  const requests: Array<{ method: string; path: string }> = [];
  const result = await tool.execute(
    { query: 'security engineers', waitForResult: false },
    {
      request: async (request: { method: string; path: string }) => {
        requests.push(request);
        return {
          data: { operationId: 'op_people', status: 'queued' },
          status: 202,
          requestId: 'req_people',
        };
      },
      createIdempotencyKey: () => 'generated_search_people',
    } as never,
  );

  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: request.path })),
    [{ method: 'POST', path: '/api/v1/people/search' }],
  );
  assert.deepEqual(result, {
    status: 'still_running',
    still_running: true,
    operationId: 'op_people',
    nextTool: 'get_operation',
    nextInput: { id: 'op_people' },
    pollAfterSeconds: 10,
    message: 'The request is still running. Use get_operation with this ID to continue.',
    requestId: 'req_people',
  });
});

test('configured async primitive tools poll operation IDs even without an initial status', async () => {
  const tool = primitiveTools.find((candidate) => candidate.name === 'search_people');
  assert.ok(tool);

  const requests: Array<{ method: string; path: string }> = [];
  await tool.execute(
    { query: 'security engineers', waitForResult: true },
    {
      request: async (request: { method: string; path: string }) => {
        requests.push(request);
        if (request.method === 'POST') {
          return {
            data: { operationId: 'op_people' },
            status: 200,
            requestId: 'req_people',
          };
        }
        return {
          data: { id: 'op_people', status: 'succeeded', result: { data: [] } },
          status: 200,
          requestId: 'req_people_poll',
        };
      },
      createIdempotencyKey: () => 'generated_search_people',
    } as never,
  );

  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: request.path })),
    [
      { method: 'POST', path: '/api/v1/people/search' },
      { method: 'GET', path: '/api/operations/op_people' },
    ],
  );
});

test('primitive tools infer operation polling from queued operationId responses', async () => {
  const tool = endpointTool({
    name: 'async_unconfigured_tool',
    description: 'Test tool',
    method: 'POST',
    path: '/api/custom-async',
    endpointPath: '/api/custom-async',
    inputSchema: {},
    idempotent: true,
  });

  const requests: Array<{ method: string; path: string }> = [];
  const result = await tool.execute(
    { waitForResult: true },
    {
      request: async (request: { method: string; path: string }) => {
        requests.push(request);
        if (request.method === 'POST') {
          return {
            data: { operationId: 'op_custom', status: 'queued' },
            status: 202,
            requestId: 'req_custom',
          };
        }
        return {
          data: { id: 'op_custom', status: 'succeeded', result: { ok: true } },
          status: 200,
          requestId: 'req_custom_poll',
        };
      },
      createIdempotencyKey: () => 'generated_custom',
    } as never,
  );

  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: request.path })),
    [
      { method: 'POST', path: '/api/custom-async' },
      { method: 'GET', path: '/api/operations/op_custom' },
    ],
  );
  assert.deepEqual(result, {
    initial: { operationId: 'op_custom', status: 'queued' },
    final: { id: 'op_custom', status: 'succeeded', result: { ok: true } },
    timedOut: false,
    pollAttempts: 1,
    requestId: 'req_custom',
  });
});

test('primitive tools infer operation polling from nested queued operation responses', async () => {
  const tool = endpointTool({
    name: 'async_unconfigured_nested_tool',
    description: 'Test tool',
    method: 'POST',
    path: '/api/custom-nested-async',
    endpointPath: '/api/custom-nested-async',
    inputSchema: {},
    idempotent: true,
  });

  const requests: Array<{ method: string; path: string }> = [];
  await tool.execute(
    { waitForResult: true },
    {
      request: async (request: { method: string; path: string }) => {
        requests.push(request);
        if (request.method === 'POST') {
          return {
            data: { data: { operationId: 'op_nested', status: 'queued' } },
            status: 200,
            requestId: 'req_nested',
          };
        }
        return {
          data: { id: 'op_nested', status: 'completed' },
          status: 200,
          requestId: 'req_nested_poll',
        };
      },
      createIdempotencyKey: () => 'generated_custom',
    } as never,
  );

  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: request.path })),
    [
      { method: 'POST', path: '/api/custom-nested-async' },
      { method: 'GET', path: '/api/operations/op_nested' },
    ],
  );
});

test('primitive tools do not infer operation polling from terminal unconfigured responses', async () => {
  const tool = endpointTool({
    name: 'terminal_unconfigured_tool',
    description: 'Test tool',
    method: 'POST',
    path: '/api/custom-terminal',
    endpointPath: '/api/custom-terminal',
    inputSchema: {},
    idempotent: true,
  });

  const requests: Array<{ method: string; path: string }> = [];
  const result = await tool.execute(
    {},
    {
      request: async (request: { method: string; path: string }) => {
        requests.push(request);
        return {
          data: { operationId: 'op_terminal', status: 'succeeded', result: { ok: true } },
          status: 200,
          requestId: 'req_terminal',
        };
      },
      createIdempotencyKey: () => 'generated_custom',
    } as never,
  );

  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: request.path })),
    [{ method: 'POST', path: '/api/custom-terminal' }],
  );
  assert.deepEqual(result, {
    response: { operationId: 'op_terminal', status: 'succeeded', result: { ok: true } },
    requestId: 'req_terminal',
  });
});

test('linkedin primitive tools send public OpenAPI-shaped request bodies', async () => {
  const cases: Array<{
    name: string;
    input: Record<string, unknown>;
    body: Record<string, unknown>;
  }> = [
    {
      name: 'find_linkedin_companies',
      input: { domains: ['https://example.com'] },
      body: { domains: ['https://example.com'] },
    },
    {
      name: 'get_linkedin_company',
      input: { identifier: 'example-company' },
      body: { identifier: 'example-company' },
    },
    {
      name: 'list_linkedin_company_posts',
      input: { companySlug: 'example-company', limit: 25 },
      body: { companySlug: 'example-company', limit: 25 },
    },
    {
      name: 'search_linkedin_posts',
      input: {
        keyword: 'b2b saas',
        config: { limit: 25, sortBy: 'recent', dateFilter: 'past-week', matchMode: 'broad' },
      },
      body: {
        keyword: 'b2b saas',
        config: { limit: 25, sortBy: 'recent', dateFilter: 'past-week', matchMode: 'broad' },
      },
    },
    {
      name: 'get_linkedin_profile',
      input: { username: 'example-profile' },
      body: { username: 'example-profile' },
    },
    {
      name: 'list_linkedin_profile_posts',
      input: { username: 'example-profile', maxPosts: 25 },
      body: { username: 'example-profile', maxPosts: 25 },
    },
    {
      name: 'list_linkedin_post_comments',
      input: {
        postUrls: ['https://www.linkedin.com/feed/update/urn:li:activity:123'],
        maxItems: 25,
      },
      body: {
        postUrls: ['https://www.linkedin.com/feed/update/urn:li:activity:123'],
        maxItems: 25,
      },
    },
    {
      name: 'list_linkedin_post_reactions',
      input: {
        postUrls: ['https://www.linkedin.com/feed/update/urn:li:activity:123'],
        maxItems: 25,
      },
      body: {
        postUrls: ['https://www.linkedin.com/feed/update/urn:li:activity:123'],
        maxItems: 25,
      },
    },
    {
      name: 'list_linkedin_profile_comments',
      input: { profiles: ['example-profile'], maxItems: 25, postedLimit: 'week' },
      body: { profiles: ['example-profile'], maxItems: 25, postedLimit: 'week' },
    },
    {
      name: 'list_linkedin_profile_reactions',
      input: { profiles: ['example-profile'], maxItems: 25, postedLimit: 'week' },
      body: { profiles: ['example-profile'], maxItems: 25, postedLimit: 'week' },
    },
  ];

  for (const item of cases) {
    const tool = primitiveTools.find((candidate) => candidate.name === item.name);
    assert.ok(tool, item.name);

    const requests: Array<{ body?: unknown; idempotencyKey?: string }> = [];
    await tool.execute(
      { ...item.input, idempotencyKey: `idem_${item.name}` },
      {
        request: async (request: { body?: unknown; idempotencyKey?: string }) => {
          requests.push(request);
          return { data: { ok: true }, status: 200, requestId: null };
        },
        createIdempotencyKey: () => `generated_${item.name}`,
      } as never,
    );

    assert.deepEqual(requests[0]?.body, item.body, item.name);
    assert.equal(requests[0]?.idempotencyKey, `idem_${item.name}`, item.name);
  }
});
