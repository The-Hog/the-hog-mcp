import { z } from 'zod/v4';
import type { TheHogToolClient } from '../../client/thehog-client.js';
import {
  idempotencyField,
  jsonObjectSchema,
  personIdentifierSchema,
  waitFields,
} from '../schemas.js';
import type { ToolInput } from '../types.js';
import { workflowToolAnnotations, type WorkflowToolDefinition } from './types.js';
import {
  compactForAnchor,
  createWorkflowContext,
  pollFields,
  pollMetadata,
  runWorkflowStep,
  toUrl,
  workflowIdempotencyKey,
  workflowSummary,
} from './helpers.js';

const defaultCompanySchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    products: { type: 'array', items: { type: 'string' } },
    customers: { type: 'array', items: { type: 'string' } },
    competitors: { type: 'array', items: { type: 'string' } },
    recentSignals: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'sources'],
  additionalProperties: false,
};

const defaultPersonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    currentRole: { type: 'string' },
    relevantSignals: { type: 'array', items: { type: 'string' } },
    outreachAngles: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'sources'],
  additionalProperties: false,
};

const defaultExtractionSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    facts: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'sources'],
  additionalProperties: false,
};

export const researchWorkflowTools: WorkflowToolDefinition[] = [
  {
    name: 'research_company',
    description:
      'Research a company and return structured findings. This can crawl the company site, search recent web results, and start deep research with a JSON Schema. This may consume The Hog credits. Defaults: crawl up to 5 pages, search 5 web results, and poll for the research result.',
    inputSchema: {
      companyName: z.string().min(1).max(200),
      domain: z.string().min(1).max(300).optional(),
      researchPrompt: z.string().min(1).max(4000).optional(),
      schema: jsonObjectSchema.optional(),
      includeWebsiteCrawl: z.boolean().optional(),
      includeRecentNews: z.boolean().optional(),
      model: z.string().min(1).optional(),
      ...waitFields,
      ...idempotencyField,
    },
    annotations: workflowToolAnnotations,
    execute: researchCompany,
  },
  {
    name: 'research_person',
    description:
      'Research a person or prospect and return a structured dossier. Use this for questions like find information about a named person at a company, especially after search_people is empty. This can enrich a supplied identifier, search the web for public profile and LinkedIn evidence, and start deep research with a JSON Schema. This may consume The Hog credits. Defaults: web search enabled and polling enabled.',
    inputSchema: {
      name: z.string().min(1).max(200),
      company: z.string().min(1).max(200).optional(),
      linkedinUrl: z.string().min(1).max(500).optional(),
      email: z.string().email().optional(),
      identifier: personIdentifierSchema.optional(),
      researchPrompt: z.string().min(1).max(4000).optional(),
      schema: jsonObjectSchema.optional(),
      includeWebSearch: z.boolean().optional(),
      model: z.string().min(1).optional(),
      ...waitFields,
      ...idempotencyField,
    },
    annotations: workflowToolAnnotations,
    execute: researchPerson,
  },
  {
    name: 'scrape_and_extract',
    description:
      'Scrape a single URL and optionally extract structured data from it with deep research. This may consume The Hog credits. Defaults: no JavaScript rendering, polling enabled for extraction, and a small generic extraction schema when instructions are supplied without a schema.',
    inputSchema: {
      url: z.string().url(),
      renderJs: z.boolean().optional(),
      maxAgeDays: z.number().int().min(0).max(30).optional(),
      instructions: z.string().min(1).max(4000).optional(),
      schema: jsonObjectSchema.optional(),
      model: z.string().min(1).optional(),
      ...waitFields,
      ...idempotencyField,
    },
    annotations: workflowToolAnnotations,
    execute: scrapeAndExtract,
  },
];

async function researchCompany(input: ToolInput, client: TheHogToolClient) {
  const ctx = createWorkflowContext('research_company');
  const anchors: Array<Record<string, unknown>> = [];
  const urls: string[] = [];

  const websiteUrl = typeof input.domain === 'string' ? toUrl(input.domain) : null;
  const crawlStep =
    websiteUrl && input.includeWebsiteCrawl !== false
      ? await runWorkflowStep(client, ctx, {
          step: 'crawl_website',
          method: 'POST',
          path: '/api/v1/platform/scrapers/web/crawl',
          body: { url: websiteUrl, limit: 5 },
        })
      : null;
  if (websiteUrl) urls.push(websiteUrl);
  if (crawlStep?.final) {
    anchors.push({ type: 'website_crawl', data: compactForAnchor(crawlStep.final) });
  }

  const webStep =
    input.includeRecentNews !== false
      ? await runWorkflowStep(client, ctx, {
          step: 'search_web',
          method: 'POST',
          path: '/api/v1/platform/scrapers/web/search',
          body: {
            query: `${input.companyName} company news funding hiring product`,
            maxResults: 5,
            topic: 'news',
          },
        })
      : null;
  if (webStep?.final) {
    anchors.push({ type: 'web_search', data: compactForAnchor(webStep.final) });
  }

  const researchStep = await runWorkflowStep(client, ctx, {
    step: 'start_deep_research',
    method: 'POST',
    path: '/api/deep-research',
    body: {
      prompt:
        input.researchPrompt ??
        `Research ${input.companyName}. Focus on what the company does, customer profile, competitors, and recent business signals.`,
      schema: input.schema ?? defaultCompanySchema,
      ...(urls.length > 0 ? { urls } : {}),
      ...(anchors.length > 0 ? { inputAnchors: anchors } : {}),
      ...(input.model ? { model: input.model } : {}),
    },
    idempotencyKey: workflowIdempotencyKey(
      client,
      input,
      'research_company',
      'research',
    ),
    poll: 'operation',
    ...pollFields(input),
  });

  return {
    ...workflowSummary(ctx, [crawlStep, webStep, researchStep].filter(Boolean).length),
    steps: {
      ...(crawlStep ? { websiteCrawl: { final: crawlStep.final } } : {}),
      ...(webStep ? { webSearch: { final: webStep.final } } : {}),
      deepResearch: { ...pollMetadata(researchStep), final: researchStep?.final },
    },
    summary: {
      anchorCount: anchors.length,
      usedDefaultSchema: input.schema === undefined,
    },
  };
}

async function researchPerson(input: ToolInput, client: TheHogToolClient) {
  const ctx = createWorkflowContext('research_person');
  const anchors: Array<Record<string, unknown>> = [];
  const identifier = personIdentifierFromInput(input);

  const enrichmentStep = identifier
    ? await runWorkflowStep(client, ctx, {
        step: 'enrich_contact',
        method: 'POST',
        path: '/api/enrichments',
        body: {
          identifier,
          fields: ['contact.email', 'signals'],
        },
        idempotencyKey: workflowIdempotencyKey(
          client,
          input,
          'research_person',
          'enrichment',
        ),
        poll: 'enrichment',
        ...pollFields(input),
      })
    : null;
  if (enrichmentStep?.final) {
    anchors.push({ type: 'contact_enrichment', data: compactForAnchor(enrichmentStep.final) });
  }

  const webStep =
    input.includeWebSearch !== false
      ? await runWorkflowStep(client, ctx, {
          step: 'search_web',
          method: 'POST',
          path: '/api/v1/platform/scrapers/web/search',
          body: {
            query: [input.name, input.company].filter(Boolean).join(' '),
            maxResults: 5,
          },
        })
      : null;
  if (webStep?.final) {
    anchors.push({ type: 'web_search', data: compactForAnchor(webStep.final) });
  }

  const researchStep = await runWorkflowStep(client, ctx, {
    step: 'start_deep_research',
    method: 'POST',
    path: '/api/deep-research',
    body: {
      prompt:
        input.researchPrompt ??
        `Research ${input.name}${input.company ? ` at ${input.company}` : ''}. Focus on role, relevant business signals, and outreach angles.`,
      schema: input.schema ?? defaultPersonSchema,
      ...(anchors.length > 0 ? { inputAnchors: anchors } : {}),
      ...(input.model ? { model: input.model } : {}),
    },
    idempotencyKey: workflowIdempotencyKey(client, input, 'research_person', 'research'),
    poll: 'operation',
    ...pollFields(input),
  });

  return {
    ...workflowSummary(ctx, [enrichmentStep, webStep, researchStep].filter(Boolean).length),
    steps: {
      ...(enrichmentStep
        ? { enrichment: { ...pollMetadata(enrichmentStep), final: enrichmentStep.final } }
        : {}),
      ...(webStep ? { webSearch: { final: webStep.final } } : {}),
      deepResearch: { ...pollMetadata(researchStep), final: researchStep?.final },
    },
    summary: {
      anchorCount: anchors.length,
      usedDefaultSchema: input.schema === undefined,
    },
  };
}

async function scrapeAndExtract(input: ToolInput, client: TheHogToolClient) {
  const ctx = createWorkflowContext('scrape_and_extract');
  const scrapeStep = await runWorkflowStep(client, ctx, {
    step: 'scrape_web_page',
    method: 'POST',
    path: '/api/v1/platform/scrapers/web/scrape',
    body: {
      url: input.url,
      renderJs: input.renderJs,
      maxAgeDays: input.maxAgeDays,
    },
  });

  const shouldExtract = input.schema !== undefined || input.instructions !== undefined;
  const extractionStep =
    shouldExtract && scrapeStep?.final
      ? await runWorkflowStep(client, ctx, {
          step: 'start_deep_research',
          method: 'POST',
          path: '/api/deep-research',
          body: {
            prompt:
              input.instructions ??
              'Extract the most important structured facts from the scraped page.',
            schema: input.schema ?? defaultExtractionSchema,
            urls: [input.url],
            inputAnchors: [
              { type: 'scraped_page', data: compactForAnchor(scrapeStep.final) },
            ],
            ...(input.model ? { model: input.model } : {}),
          },
          idempotencyKey: workflowIdempotencyKey(
            client,
            input,
            'scrape_and_extract',
            'extraction',
          ),
          poll: 'operation',
          ...pollFields(input),
        })
      : null;

  return {
    ...workflowSummary(ctx, [scrapeStep, extractionStep].filter(Boolean).length),
    steps: {
      scrape: { final: scrapeStep?.final },
      ...(extractionStep
        ? { extraction: { ...pollMetadata(extractionStep), final: extractionStep.final } }
        : {}),
    },
    summary: {
      extracted: extractionStep !== null,
      usedDefaultSchema: shouldExtract && input.schema === undefined,
    },
  };
}

function personIdentifierFromInput(input: ToolInput):
  | { linkedin_url: string }
  | { email: string }
  | { x_handle: string }
  | { github_username: string }
  | null {
  if (input.identifier && typeof input.identifier === 'object') {
    return input.identifier as
      | { linkedin_url: string }
      | { email: string }
      | { x_handle: string }
      | { github_username: string };
  }
  if (typeof input.linkedinUrl === 'string' && input.linkedinUrl.trim()) {
    return { linkedin_url: input.linkedinUrl.trim() };
  }
  if (typeof input.email === 'string' && input.email.trim()) {
    return { email: input.email.trim() };
  }
  return null;
}
