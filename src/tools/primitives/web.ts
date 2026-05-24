import { z } from 'zod/v4';
import { endpointTool } from './endpoint-tool.js';
import type { PrimitiveToolDefinition } from './types.js';

export const webPrimitiveTools: PrimitiveToolDefinition[] = [
  endpointTool({
    name: 'search_web',
    description:
      'Search the web and return normalized results. Use this for current web discovery. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/web/search',
    endpointPath: '/api/v1/platform/scrapers/web/search',
    inputSchema: {
      query: z.string().min(1),
      maxResults: z.number().int().min(1).max(50).optional(),
      searchDepth: z.enum(['basic', 'advanced']).optional(),
      topic: z.enum(['general', 'news']).optional(),
      days: z.number().int().min(1).optional(),
      includeDomains: z.array(z.string().min(1)).optional(),
      excludeDomains: z.array(z.string().min(1)).optional(),
    },
  }),
  endpointTool({
    name: 'crawl_website',
    description:
      'Crawl a website and return normalized page content. Use this when the user needs content from multiple pages on a site. This may consume The Hog credits; defaults are bounded for agent use.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/web/crawl',
    endpointPath: '/api/v1/platform/scrapers/web/crawl',
    inputSchema: {
      url: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
      instructions: z.string().optional(),
    },
  }),
  endpointTool({
    name: 'scrape_web_page',
    description:
      'Scrape a single web page and return readable content. Use this when the user needs the content of one URL. This may consume The Hog credits and large responses are trimmed for MCP clients.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/web/scrape',
    endpointPath: '/api/v1/platform/scrapers/web/scrape',
    inputSchema: {
      url: z.string().min(1),
      renderJs: z.boolean().optional(),
      maxAgeMs: z.number().int().min(0).max(30 * 24 * 60 * 60 * 1000).optional(),
      maxAgeDays: z.number().int().min(0).max(30).optional(),
    },
  }),
];
