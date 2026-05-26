import { z } from 'zod/v4';
import { idempotencyField } from '../schemas.js';
import { socialLimit } from './common.js';
import { endpointTool } from './endpoint-tool.js';
import type { PrimitiveToolDefinition } from './types.js';

const linkedInPostedLimit = z
  .enum(['any', '24h', 'week', 'month', '3months', '6months', 'year'])
  .optional()
  .describe('Fetch LinkedIn activity no older than this time window.');

const linkedInKeywordPostConfig = z
  .object({
    limit: socialLimit(500, 'Maximum LinkedIn posts to request.'),
    sortBy: z.enum(['relevance', 'recent']).optional(),
    dateFilter: z.enum(['past-24h', 'past-week', 'past-month']).optional(),
    matchMode: z
      .enum(['exact', 'broad'])
      .optional()
      .describe('Use exact for a quoted phrase or broad for related terms.'),
  })
  .strict()
  .optional();

export const socialPrimitiveTools: PrimitiveToolDefinition[] = [
  endpointTool({
    name: 'get_instagram_profile',
    description:
      'Fetch public profile details for an Instagram username. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/instagram/profile',
    endpointPath: '/api/v1/platform/scrapers/instagram/profile',
    inputSchema: { username: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_instagram_posts',
    description:
      'Fetch recent public posts for an Instagram username. This may consume The Hog credits; request only the number of posts needed.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/instagram/posts',
    endpointPath: '/api/v1/platform/scrapers/instagram/posts',
    inputSchema: {
      username: z.string().min(1),
      maxPosts: socialLimit(200, 'Maximum posts to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_instagram_post',
    description:
      'Fetch details for a public Instagram post or reel URL. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/instagram/post-details',
    endpointPath: '/api/v1/platform/scrapers/instagram/post-details',
    inputSchema: { postUrl: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_instagram_post_comments',
    description:
      'Fetch comments for a public Instagram post or reel URL. This may consume The Hog credits; nested replies can increase work and cost.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/instagram/post-comments',
    endpointPath: '/api/v1/platform/scrapers/instagram/post-comments',
    inputSchema: {
      postUrl: z.string().min(1),
      maxComments: socialLimit(200, 'Maximum comments to request.'),
      includeNested: z.boolean().optional(),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_instagram_followers',
    description:
      'Fetch public followers for an Instagram username. This may consume The Hog credits; large requests can be expensive.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/instagram/followers',
    endpointPath: '/api/v1/platform/scrapers/instagram/followers',
    inputSchema: {
      username: z.string().min(1),
      maxFollowers: socialLimit(5000, 'Maximum followers to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_instagram_following',
    description:
      'Fetch public accounts followed by an Instagram username. This may consume The Hog credits; large requests can be expensive.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/instagram/following',
    endpointPath: '/api/v1/platform/scrapers/instagram/following',
    inputSchema: {
      username: z.string().min(1),
      maxFollowing: socialLimit(5000, 'Maximum following accounts to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_tiktok_profile',
    description:
      'Fetch public profile details and recent videos for a TikTok username. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/tiktok/profile',
    endpointPath: '/api/v1/platform/scrapers/tiktok/profile',
    inputSchema: {
      username: z.string().min(1),
      maxVideos: socialLimit(500, 'Maximum videos to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'find_linkedin_companies',
    description:
      'Find LinkedIn company pages for website domains or URLs. Use this before company scraping when you have domains but not LinkedIn company slugs. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/finder',
    endpointPath: '/api/v1/platform/scrapers/linkedin/finder',
    inputSchema: {
      domains: z.array(z.string().min(1)).min(1).max(100),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_linkedin_company',
    description:
      'Fetch public LinkedIn company details by company slug, URL, or identifier. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/company',
    endpointPath: '/api/v1/platform/scrapers/linkedin/company',
    inputSchema: { identifier: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_company_posts',
    description:
      'Fetch recent public posts from a LinkedIn company page. This may consume The Hog credits; request only the number of posts needed.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/company-posts',
    endpointPath: '/api/v1/platform/scrapers/linkedin/company-posts',
    inputSchema: {
      companySlug: z.string().min(1),
      limit: socialLimit(500, 'Maximum LinkedIn company posts to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'search_linkedin_posts',
    description:
      'Search public LinkedIn posts by keyword. This may consume The Hog credits; use filters to keep result volume focused.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/keyword-posts',
    endpointPath: '/api/v1/platform/scrapers/linkedin/keyword-posts',
    inputSchema: {
      keyword: z.string().min(1),
      config: linkedInKeywordPostConfig,
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_linkedin_profile',
    description:
      'Fetch public LinkedIn profile details by public username. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/profile',
    endpointPath: '/api/v1/platform/scrapers/linkedin/profile',
    inputSchema: { username: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_profile_posts',
    description:
      'Fetch recent public posts from a LinkedIn profile username. This may consume The Hog credits; request only the number of posts needed.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/profile-posts',
    endpointPath: '/api/v1/platform/scrapers/linkedin/profile-posts',
    inputSchema: {
      username: z.string().min(1),
      maxPosts: socialLimit(200, 'Maximum LinkedIn profile posts to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_post_comments',
    description:
      'Fetch comments for public LinkedIn post URLs. This may consume The Hog credits; large post batches can be expensive.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/post-comments',
    endpointPath: '/api/v1/platform/scrapers/linkedin/post-comments',
    inputSchema: {
      postUrls: z.array(z.string().min(1)).min(1).max(100),
      maxItems: socialLimit(500, 'Maximum comments to request per run.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_post_reactions',
    description:
      'Fetch reactions for public LinkedIn post URLs. This may consume The Hog credits; large post batches can be expensive.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/post-reactions',
    endpointPath: '/api/v1/platform/scrapers/linkedin/post-reactions',
    inputSchema: {
      postUrls: z.array(z.string().min(1)).min(1).max(100),
      maxItems: socialLimit(500, 'Maximum reactions to request per run.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_profile_comments',
    description:
      'Fetch comments made by public LinkedIn profiles. This may consume The Hog credits; use postedLimit and maxItems to control result volume.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/profile-comments',
    endpointPath: '/api/v1/platform/scrapers/linkedin/profile-comments',
    inputSchema: {
      profiles: z.array(z.string().min(1)).min(1).max(100),
      maxItems: socialLimit(100, 'Maximum profile comments to request.'),
      postedLimit: linkedInPostedLimit,
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_profile_reactions',
    description:
      'Fetch reactions made by public LinkedIn profiles. This may consume The Hog credits; use postedLimit and maxItems to control result volume.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/profile-reactions',
    endpointPath: '/api/v1/platform/scrapers/linkedin/profile-reactions',
    inputSchema: {
      profiles: z.array(z.string().min(1)).min(1).max(100),
      maxItems: socialLimit(100, 'Maximum profile reactions to request.'),
      postedLimit: linkedInPostedLimit,
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
];
