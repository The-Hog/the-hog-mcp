import { z } from 'zod/v4';
import type { TheHogToolClient } from '../../client/thehog-client.js';
import {
  idempotencyField,
  personIdentifierSchema,
  signalsConfigSchema,
  waitFields,
} from '../schemas.js';
import type { ToolInput } from '../types.js';
import { workflowToolAnnotations, type WorkflowToolDefinition } from './types.js';
import {
  clampInt,
  continuationForStep,
  createWorkflowContext,
  extractItems,
  pollFields,
  pollMetadata,
  readNestedString,
  readString,
  runWorkflowStep,
  uniqueStrings,
  workflowIdempotencyKey,
  workflowSummary,
} from './helpers.js';

const contactFieldsSchema = z
  .array(z.string().min(1).max(80))
  .min(1)
  .max(8)
  .optional();

const targetAccountFields = {
  companyDomains: z.array(z.string().min(1)).max(100).optional(),
  companyNames: z.array(z.string().min(1)).max(100).optional(),
  companyLinkedInUrls: z.array(z.string().min(1)).max(100).optional(),
  titles: z.array(z.string().min(1)).max(50).optional(),
  titleMatch: z.enum(['exact', 'similar']).optional(),
  locations: z.array(z.string().min(1)).max(50).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  includeContactInfo: z.boolean().optional(),
  contactFields: contactFieldsSchema,
  signals_config: signalsConfigSchema.optional(),
  ...waitFields,
  ...idempotencyField,
};

export const prospectingWorkflowTools: WorkflowToolDefinition[] = [
  {
    name: 'build_prospect_list',
    description:
      'Build a prospect list from an ICP. This searches for matching companies, finds relevant people at those companies, and can optionally enrich contacts with email or phone data. This may consume The Hog credits. Defaults: 10 companies, 3 people per company, and polling enabled.',
    inputSchema: {
      companyQuery: z.string().min(1).max(500),
      personQuery: z.string().min(1).max(500),
      companyLimit: z.number().int().min(1).max(50).optional(),
      peoplePerCompany: z.number().int().min(1).max(20).optional(),
      includeContactInfo: z.boolean().optional(),
      contactFields: contactFieldsSchema,
      signals_config: signalsConfigSchema.optional(),
      ...waitFields,
      ...idempotencyField,
    },
    annotations: workflowToolAnnotations,
    execute: buildProspectList,
  },
  {
    name: 'find_people_at_target_accounts',
    description:
      'Find people at known target accounts by domain or company name. This may consume The Hog credits and can optionally enrich contacts. Defaults: 25 people and polling enabled.',
    inputSchema: targetAccountFields,
    annotations: workflowToolAnnotations,
    execute: findPeopleAtTargetAccounts,
  },
  {
    name: 'enrich_prospect_list',
    description:
      'Batch enrich known prospect identifiers with requested contact fields or signals. This may consume The Hog credits and may return an async operation. Defaults to polling for the enrichment result.',
    inputSchema: {
      identifiers: z.array(personIdentifierSchema).min(1).max(100),
      fields: z.array(z.string().min(1).max(80)).min(1).max(8),
      signals_config: signalsConfigSchema.optional(),
      ...waitFields,
      ...idempotencyField,
    },
    annotations: workflowToolAnnotations,
    execute: enrichProspectList,
  },
];

async function buildProspectList(input: ToolInput, client: TheHogToolClient) {
  const ctx = createWorkflowContext('build_prospect_list');
  const companyLimit = clampInt(input.companyLimit, 10, 1, 50);
  const peoplePerCompany = clampInt(input.peoplePerCompany, 3, 1, 20);
  const peopleLimit = Math.min(100, companyLimit * peoplePerCompany);

  const companyStep = await runWorkflowStep(client, ctx, {
    step: 'search_companies',
    method: 'POST',
    path: '/api/v1/companies/search',
    body: {
      query: input.companyQuery,
      limit: companyLimit,
    },
    idempotencyKey: workflowIdempotencyKey(
      client,
      input,
      'build_prospect_list',
      'companies',
    ),
    poll: 'operation',
    ...pollFields(input),
  });

  if (!companyStep) {
    return {
      ...workflowSummary(ctx, 0),
      steps: {},
      summary: { companyCount: 0, peopleCount: 0, enrichmentCount: 0 },
    };
  }
  const companyContinuation = continuationForStep(companyStep, 'operation');
  if (companyContinuation) {
    return companyContinuation;
  }
  const companies = extractItems(companyStep, ['companies', 'data']);
  if (companies.length === 0) {
    ctx.warnings.push({
      step: 'search_people',
      message:
        'Company search did not return any companies, so downstream prospect discovery was not started.',
    });
    return {
      ...workflowSummary(ctx, 1),
      steps: { companySearch: { ...pollMetadata(companyStep), final: companyStep.final } },
      summary: { companyCount: 0, peopleCount: 0, enrichmentCount: 0 },
    };
  }

  const companyFilters = companyFilterFromItems(companies);
  if (Object.keys(companyFilters).length === 0) {
    ctx.warnings.push({
      step: 'search_people',
      message:
        'Company search returned records without company names, domains, or LinkedIn URLs, so downstream prospect discovery was not started.',
    });
    return {
      ...workflowSummary(ctx, 1),
      steps: { companySearch: { ...pollMetadata(companyStep), final: companyStep.final } },
      summary: { companyCount: companies.length, peopleCount: 0, enrichmentCount: 0 },
    };
  }

  const peopleStep = await runWorkflowStep(client, ctx, {
    step: 'search_people',
    method: 'POST',
    path: '/api/v1/people/search',
    body: {
      query: input.personQuery,
      limit: peopleLimit,
      includeContacts: input.includeContactInfo === true,
      filters: { company: companyFilters },
    },
    idempotencyKey: workflowIdempotencyKey(
      client,
      input,
      'build_prospect_list',
      'people',
    ),
    poll: 'operation',
    ...pollFields(input),
  });
  const peopleContinuation = continuationForStep(peopleStep, 'operation');
  if (peopleContinuation) {
    return peopleContinuation;
  }

  const people = extractItems(peopleStep, ['people', 'data']);
  const enrichmentStep =
    input.includeContactInfo === true
      ? await enrichPeopleFromItems(client, ctx, input, people, 'build_prospect_list')
      : null;
  const enrichmentContinuation = continuationForStep(enrichmentStep, 'enrichment');
  if (enrichmentContinuation) {
    return enrichmentContinuation;
  }

  return {
    ...workflowSummary(ctx, [companyStep, peopleStep, enrichmentStep].filter(Boolean).length),
    steps: {
      companySearch: { ...pollMetadata(companyStep), final: companyStep?.final },
      peopleSearch: { ...pollMetadata(peopleStep), final: peopleStep?.final },
      ...(enrichmentStep
        ? { enrichment: { ...pollMetadata(enrichmentStep), final: enrichmentStep.final } }
        : {}),
    },
    summary: {
      companyCount: companies.length,
      peopleCount: people.length,
      enrichmentCount: extractItems(enrichmentStep, ['data', 'results']).length,
    },
  };
}

async function findPeopleAtTargetAccounts(input: ToolInput, client: TheHogToolClient) {
  const ctx = createWorkflowContext('find_people_at_target_accounts');
  const domains = uniqueStrings(readStringArray(input.companyDomains));
  const names = uniqueStrings(readStringArray(input.companyNames));
  const linkedinUrls = uniqueStrings(readStringArray(input.companyLinkedInUrls));
  if (domains.length === 0 && names.length === 0 && linkedinUrls.length === 0) {
    throw new Error('Provide at least one company domain, company name, or company LinkedIn URL.');
  }

  const titles = readStringArray(input.titles);
  const titleMatch =
    input.titleMatch === 'exact' || input.titleMatch === 'similar'
      ? input.titleMatch
      : undefined;
  const locations = readStringArray(input.locations);
  const query =
    titles.length > 0
      ? `${titles.join(' OR ')} at target accounts`
      : 'People at target accounts';
  const peopleStep = await runWorkflowStep(client, ctx, {
    step: 'search_people',
    method: 'POST',
    path: '/api/v1/people/search',
    body: {
      query,
      limit: clampInt(input.limit, 25, 1, 100),
      includeContacts: input.includeContactInfo === true,
      filters: {
        ...(titles.length > 0 ? { titles } : {}),
        ...(titleMatch ? { titleMatch } : {}),
        ...(locations.length > 0 ? { locations } : {}),
        company: {
          ...(domains.length > 0 ? { domains } : {}),
          ...(names.length > 0 ? { names } : {}),
          ...(linkedinUrls.length > 0 ? { linkedinUrls } : {}),
        },
      },
    },
    idempotencyKey: workflowIdempotencyKey(
      client,
      input,
      'find_people_at_target_accounts',
      'people',
    ),
    poll: 'operation',
    ...pollFields(input),
  });
  const peopleContinuation = continuationForStep(peopleStep, 'operation');
  if (peopleContinuation) {
    return peopleContinuation;
  }

  const people = extractItems(peopleStep, ['people', 'data']);
  const enrichmentStep =
    input.includeContactInfo === true
      ? await enrichPeopleFromItems(
          client,
          ctx,
          input,
          people,
          'find_people_at_target_accounts',
        )
      : null;
  const enrichmentContinuation = continuationForStep(enrichmentStep, 'enrichment');
  if (enrichmentContinuation) {
    return enrichmentContinuation;
  }

  return {
    ...workflowSummary(ctx, [peopleStep, enrichmentStep].filter(Boolean).length),
    steps: {
      peopleSearch: { ...pollMetadata(peopleStep), final: peopleStep?.final },
      ...(enrichmentStep
        ? { enrichment: { ...pollMetadata(enrichmentStep), final: enrichmentStep.final } }
        : {}),
    },
    summary: {
      peopleCount: people.length,
      enrichmentCount: extractItems(enrichmentStep, ['data', 'results']).length,
    },
  };
}

async function enrichProspectList(input: ToolInput, client: TheHogToolClient) {
  const ctx = createWorkflowContext('enrich_prospect_list');
  const enrichmentStep = await runWorkflowStep(client, ctx, {
    step: 'enrich_contacts',
    method: 'POST',
    path: '/api/enrichments',
    body: {
      identifiers: input.identifiers,
      fields: input.fields,
      signals_config: input.signals_config,
    },
    idempotencyKey: workflowIdempotencyKey(
      client,
      input,
      'enrich_prospect_list',
      'enrichment',
    ),
    poll: 'enrichment',
    ...pollFields(input),
  });
  const enrichmentContinuation = continuationForStep(enrichmentStep, 'enrichment');
  if (enrichmentContinuation) {
    return enrichmentContinuation;
  }

  return {
    ...workflowSummary(ctx, enrichmentStep ? 1 : 0),
    steps: {
      enrichment: { ...pollMetadata(enrichmentStep), final: enrichmentStep?.final },
    },
    summary: {
      enrichmentCount: extractItems(enrichmentStep, ['data', 'results']).length,
    },
  };
}

async function enrichPeopleFromItems(
  client: TheHogToolClient,
  ctx: ReturnType<typeof createWorkflowContext>,
  input: ToolInput,
  people: unknown[],
  workflowName: string,
) {
  const identifiers = people.map(toPersonIdentifier).filter((item) => item !== null);
  if (identifiers.length === 0) {
    ctx.warnings.push({
      step: 'enrich_contacts',
      message:
        'No supported person identifiers were present in the people results, so contact enrichment was skipped.',
    });
    return null;
  }

  return runWorkflowStep(client, ctx, {
    step: 'enrich_contacts',
    method: 'POST',
    path: '/api/enrichments',
    body: {
      identifiers: identifiers.slice(0, 100),
      fields: input.contactFields ?? ['contact.email'],
      signals_config: input.signals_config,
    },
    idempotencyKey: workflowIdempotencyKey(client, input, workflowName, 'enrichment'),
    poll: 'enrichment',
    ...pollFields(input),
  });
}

function companyFilterFromItems(companies: unknown[]): {
  domains?: string[];
  names?: string[];
  linkedinUrls?: string[];
} {
  const domains = uniqueStrings(
    companies.map((company) =>
      readString(company, ['domain', 'website_domain', 'websiteDomain']),
    ),
  );
  const names = uniqueStrings(companies.map((company) => readString(company, ['name'])));
  const linkedinUrls = uniqueStrings(
    companies.map((company) =>
      readString(company, ['linkedin_url', 'linkedinUrl', 'linkedin']),
    ),
  );
  return {
    ...(domains.length > 0 ? { domains } : {}),
    ...(names.length > 0 ? { names } : {}),
    ...(linkedinUrls.length > 0 ? { linkedinUrls } : {}),
  };
}

function toPersonIdentifier(person: unknown):
  | { linkedin_url: string }
  | { email: string }
  | { x_handle: string }
  | { github_username: string }
  | null {
  const linkedinUrl = readString(person, ['linkedin_url', 'linkedinUrl', 'linkedin']);
  if (linkedinUrl) return { linkedin_url: linkedinUrl };
  const email =
    readString(person, ['email']) ??
    readNestedString(person, [['contact', 'email'], ['contacts', 'email']]);
  if (email) return { email };
  const xHandle = readString(person, ['x_handle', 'xHandle', 'twitter']);
  if (xHandle) return { x_handle: xHandle };
  const github = readString(person, ['github_username', 'githubUsername', 'github']);
  if (github) return { github_username: github };
  return null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
}
