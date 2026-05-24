import { z } from 'zod/v4';
import { idempotencyField, paginationFields, waitFields } from '../schemas.js';
import { operationIdField } from './common.js';
import { endpointTool, omitControlFields, pick } from './endpoint-tool.js';
import type { PrimitiveToolDefinition, ToolInput } from './types.js';

export const searchPrimitiveTools: PrimitiveToolDefinition[] = [
  endpointTool({
    name: 'submit_search',
    description:
      'Submit a search across supported web and social sources. Use this when the user wants web, site, LinkedIn keyword, X keyword, Reddit, TikTok keyword, or TikTok hashtag search through The Hog. This may consume The Hog credits and returns a search ID unless waitForResult is true.',
    method: 'POST',
    path: '/api/v1/search',
    endpointPath: '/api/v1/search',
    inputSchema: {
      type: z.enum([
        'web_search',
        'site_search',
        'linkedin_keyword',
        'x_keyword',
        'reddit_search',
        'tiktok_keyword',
        'tiktok_hashtag',
      ]),
      query: z.string().min(1).optional(),
      match_any: z.array(z.string().min(1)).optional(),
      match_all: z.array(z.string().min(1)).optional(),
      exclude: z.array(z.string().min(1)).optional(),
      max_results: z.number().int().min(1).max(50).optional(),
      site: z.string().min(1).optional(),
      include_domains: z.array(z.string().min(1)).optional(),
      exclude_domains: z.array(z.string().min(1)).optional(),
      sort_by: z.enum(['relevance', 'recent']).optional(),
      date_filter: z.string().min(1).optional(),
      hashtag: z.string().min(1).optional(),
      subreddit: z.string().min(1).optional(),
      ...waitFields,
      ...idempotencyField,
    },
    body: searchRequestBody,
    idempotent: true,
    poll: 'search',
  }),
  endpointTool({
    name: 'get_search_result',
    description: 'Get the status and result for a The Hog search ID.',
    method: 'GET',
    path: (input) => `/api/v1/search/${encodeURIComponent(String(input.id))}`,
    endpointPath: '/api/v1/search/{id}',
    inputSchema: operationIdField,
  }),
  endpointTool({
    name: 'list_searches',
    description: 'List previous search operations for the authenticated organization.',
    method: 'GET',
    path: '/api/v1/search',
    endpointPath: '/api/v1/search',
    inputSchema: {
      ...paginationFields,
      type: z.string().min(1).optional(),
    },
    query: (input) => pick(input, ['cursor', 'limit', 'type']),
  }),
];

function searchRequestBody(input: ToolInput): Record<string, unknown> {
  if (!hasSearchCriteria(input)) {
    throw new Error(
      'submit_search requires at least one search criterion: query, match_any, match_all, site, include_domains, hashtag, or subreddit.',
    );
  }
  return omitControlFields(input);
}

function hasSearchCriteria(input: ToolInput): boolean {
  return [
    input.query,
    input.site,
    input.hashtag,
    input.subreddit,
    input.match_any,
    input.match_all,
    input.include_domains,
  ].some(hasNonEmptyValue);
}

function hasNonEmptyValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return Array.isArray(value)
    ? value.some((item) => typeof item === 'string' && item.trim().length > 0)
    : false;
}
