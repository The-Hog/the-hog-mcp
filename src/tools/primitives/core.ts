import { z } from 'zod/v4';
import {
  idempotencyField,
  jsonObjectSchema,
  personIdentifierSchema,
  signalsConfigSchema,
  waitFields,
} from '../schemas.js';
import { operationIdField, searchBodyShape } from './common.js';
import { endpointTool, omitControlFields } from './endpoint-tool.js';
import type { PrimitiveToolDefinition } from './types.js';

const peopleSearchContactFields = z
  .array(z.enum(['email', 'phone']))
  .min(1)
  .max(2)
  .refine((fields) => new Set(fields).size === fields.length, {
    message: 'contactFields values must be unique',
  })
  .optional()
  .describe(
    'Contact fields to enrich when includeContacts is true. Use ["email"] to avoid phone/mobile enrichment cost.',
  );

const peopleSearchSpendControls = {
  includeContacts: z
    .boolean()
    .optional()
    .describe(
      'Whether to enrich returned people with contact data. This can be much more expensive than discovery alone, especially when phone is requested.',
    ),
  contactFields: peopleSearchContactFields,
  maxCredits: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Maximum credits the people search operation may charge. Too-low caps are rejected before paid provider work.',
    ),
};

export const corePrimitiveTools: PrimitiveToolDefinition[] = [
  endpointTool({
    name: 'search_companies',
    description:
      'Search companies using The Hog company search API. Use this when the user wants to find accounts matching a natural-language ICP, company name, market, or filter set. This may consume The Hog credits. This starts an async operation and polls for the result by default; set waitForResult to false to return the operation ID.',
    method: 'POST',
    path: '/api/v1/companies/search',
    endpointPath: '/api/v1/companies/search',
    inputSchema: {
      ...searchBodyShape,
      ...waitFields,
      ...idempotencyField,
    },
    body: omitControlFields,
    idempotent: true,
    poll: 'operation',
  }),
  endpointTool({
    name: 'list_operations',
    description:
      'List recent The Hog async operations visible to the current credentials.',
    method: 'GET',
    path: '/api/operations',
    endpointPath: '/api/operations',
    inputSchema: {},
  }),
  endpointTool({
    name: 'search_people',
    description:
      'Search people using The Hog people search API. Use this when the user wants contacts by role, seniority, company, location, or other public filters. This may consume The Hog credits. Contact enrichment is explicit: includeContacts=true can run paid email/phone provider work, and phone/mobile enrichment is usually the expensive part. Prefer contactFields:["email"] unless phone is needed, and set maxCredits to avoid surprise spend. This starts an async operation and polls for the result by default; set waitForResult to false to return the operation ID.',
    method: 'POST',
    path: '/api/v1/people/search',
    endpointPath: '/api/v1/people/search',
    inputSchema: {
      ...searchBodyShape,
      ...peopleSearchSpendControls,
      ...waitFields,
      ...idempotencyField,
    },
    body: omitControlFields,
    idempotent: true,
    poll: 'operation',
  }),
  endpointTool({
    name: 'estimate_people_search',
    description:
      'Estimate the conservative credit ceiling for search_people before starting an async people-search operation. Use this before includeContacts=true or phone/contact enrichment. This does not spend credits.',
    method: 'POST',
    path: '/api/v1/people/search/estimate',
    endpointPath: '/api/v1/people/search/estimate',
    inputSchema: {
      ...searchBodyShape,
      ...peopleSearchSpendControls,
      ...idempotencyField,
    },
    body: omitControlFields,
    idempotent: true,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  }),
  endpointTool({
    name: 'enrich_contact',
    description:
      'Enrich one person with requested contact fields or signals. Use this when the user has a LinkedIn URL, email, X handle, or GitHub username and needs enrichment. This may consume The Hog credits. Async enrichments poll for the result by default; set waitForResult to false to return the enrichment ID.',
    method: 'POST',
    path: '/api/enrichments',
    endpointPath: '/api/enrichments',
    inputSchema: {
      identifier: personIdentifierSchema,
      fields: z.array(z.string().min(1)).min(1),
      signals_config: signalsConfigSchema.optional(),
      ...waitFields,
      ...idempotencyField,
    },
    body: omitControlFields,
    idempotent: true,
    poll: 'enrichment',
  }),
  endpointTool({
    name: 'enrich_contacts',
    description:
      'Batch enrich people with requested contact fields or signals. Use this when the user has multiple LinkedIn URLs, emails, X handles, or GitHub usernames. This may consume The Hog credits. Async enrichments poll for the result by default; set waitForResult to false to return the enrichment ID.',
    method: 'POST',
    path: '/api/enrichments',
    endpointPath: '/api/enrichments',
    inputSchema: {
      identifiers: z.array(personIdentifierSchema).min(1).max(100),
      fields: z.array(z.string().min(1)).min(1),
      signals_config: signalsConfigSchema.optional(),
      ...waitFields,
      ...idempotencyField,
    },
    body: omitControlFields,
    idempotent: true,
    poll: 'enrichment',
  }),
  endpointTool({
    name: 'start_deep_research',
    description:
      'Start a structured deep research job with a prompt and JSON Schema. Use this when the user needs sourced research returned in a specific JSON shape. This may consume The Hog credits and polls for the result by default; set waitForResult to false to return the operation ID.',
    method: 'POST',
    path: '/api/deep-research',
    endpointPath: '/api/deep-research',
    inputSchema: {
      prompt: z.string().min(1),
      schema: jsonObjectSchema,
      urls: z.array(z.string().url()).optional(),
      inputAnchors: z.array(jsonObjectSchema).optional(),
      model: z.string().min(1).optional(),
      ...waitFields,
      ...idempotencyField,
    },
    body: omitControlFields,
    idempotent: true,
    poll: 'operation',
  }),
  endpointTool({
    name: 'get_operation',
    description:
      'Get the status, progress, result, or error for a The Hog async operation ID.',
    method: 'GET',
    path: (input) => `/api/operations/${encodeURIComponent(String(input.id))}`,
    endpointPath: '/api/operations/{id}',
    inputSchema: operationIdField,
  }),
  endpointTool({
    name: 'get_enrichment',
    description: 'Get the status and result for an enrichment request ID.',
    method: 'GET',
    path: (input) => `/api/enrichments/${encodeURIComponent(String(input.id))}`,
    endpointPath: '/api/enrichments/{id}',
    inputSchema: operationIdField,
  }),
];
