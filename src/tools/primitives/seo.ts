import { z } from 'zod/v4';
import { idempotencyField } from '../schemas.js';
import { endpointTool } from './endpoint-tool.js';
import type { PrimitiveToolDefinition } from './types.js';

const seoKeywordSearchType = z.enum([
  'GainedClicks',
  'LostClicks',
  'GainedRanks',
  'LostRanks',
  'MostValuable',
  'NewlyRanked',
  'JustMadeIt',
  'JustFellOff',
]);

export const seoPrimitiveTools: PrimitiveToolDefinition[] = [
  endpointTool({
    name: 'get_seo_domain_overview',
    description:
      'Get SEO and paid-search summary metrics for a domain or website URL. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/seo/domain',
    endpointPath: '/api/v1/platform/scrapers/seo/domain',
    inputSchema: {
      domain: z.string().min(1),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_seo_keywords',
    description:
      'List organic search keywords for a domain by SEO keyword search type. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/seo/keywords',
    endpointPath: '/api/v1/platform/scrapers/seo/keywords',
    inputSchema: {
      domain: z.string().min(1),
      searchType: seoKeywordSearchType,
      pageSize: z.number().int().min(1).max(100).optional(),
      searchVolumeMin: z.number().int().min(0).optional(),
      searchVolumeMax: z.number().int().min(0).optional(),
      rankMin: z.number().int().min(1).optional(),
      rankMax: z.number().int().min(1).optional(),
      includeTerms: z.string().min(1).optional(),
      excludeTerms: z.string().min(1).optional(),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_seo_competing_keywords',
    description:
      'List shared organic search keywords across included competitor domains. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/seo/competing-keywords',
    endpointPath: '/api/v1/platform/scrapers/seo/competing-keywords',
    inputSchema: {
      includedDomains: z.array(z.string().min(1)).min(1).max(20),
      excludedDomains: z.array(z.string().min(1)).max(20).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
];
