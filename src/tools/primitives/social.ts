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
    name: 'get_facebook_page',
    description:
      'Fetch public Facebook page details for a page URL. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/facebook/page',
    endpointPath: '/api/v1/platform/scrapers/facebook/page',
    inputSchema: { url: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_facebook_post',
    description:
      'Fetch public Facebook post details for a post URL. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/facebook/post',
    endpointPath: '/api/v1/platform/scrapers/facebook/post',
    inputSchema: { url: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_linkedin_company',
    description:
      'Fetch public LinkedIn company details by company slug or URL identifier. This may consume The Hog credits.',
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
      'Fetch public recent posts for a LinkedIn company slug. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/company-posts',
    endpointPath: '/api/v1/platform/scrapers/linkedin/company-posts',
    inputSchema: {
      companySlug: z.string().min(1),
      limit: socialLimit(500, 'Maximum company posts to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'find_linkedin_companies',
    description:
      'Find LinkedIn company records for website domains or URLs. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/finder',
    endpointPath: '/api/v1/platform/scrapers/linkedin/finder',
    inputSchema: {
      domains: z.array(z.string().min(1)).min(1).max(50),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'search_linkedin_posts',
    description:
      'Search public LinkedIn posts by keyword. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/keyword-posts',
    endpointPath: '/api/v1/platform/scrapers/linkedin/keyword-posts',
    inputSchema: {
      keyword: z.string().min(1),
      config: z.record(z.string(), z.unknown()).optional(),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_post_comments',
    description:
      'Fetch comments for public LinkedIn posts. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/post-comments',
    endpointPath: '/api/v1/platform/scrapers/linkedin/post-comments',
    inputSchema: {
      postUrls: z.array(z.string().min(1)).min(1),
      maxItems: socialLimit(500, 'Maximum comments to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_post_reactions',
    description:
      'Fetch reactions for public LinkedIn posts. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/post-reactions',
    endpointPath: '/api/v1/platform/scrapers/linkedin/post-reactions',
    inputSchema: {
      postUrls: z.array(z.string().min(1)).min(1),
      maxItems: socialLimit(500, 'Maximum reactions to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_linkedin_profile',
    description:
      'Fetch public LinkedIn profile details by public profile username. This may consume The Hog credits.',
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
      'Fetch public recent posts for a LinkedIn profile username. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/profile-posts',
    endpointPath: '/api/v1/platform/scrapers/linkedin/profile-posts',
    inputSchema: {
      username: z.string().min(1),
      maxPosts: socialLimit(200, 'Maximum profile posts to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_profile_comments',
    description:
      'Fetch comments made by public LinkedIn profiles. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/profile-comments',
    endpointPath: '/api/v1/platform/scrapers/linkedin/profile-comments',
    inputSchema: {
      profiles: z.array(z.string().min(1)).min(1),
      maxItems: socialLimit(100, 'Maximum profile comments to request.'),
      postedLimit: z
        .enum(['any', '24h', 'week', 'month', '3months', '6months', 'year'])
        .optional(),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'list_linkedin_profile_reactions',
    description:
      'Fetch reactions made by public LinkedIn profiles. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/linkedin/profile-reactions',
    endpointPath: '/api/v1/platform/scrapers/linkedin/profile-reactions',
    inputSchema: {
      profiles: z.array(z.string().min(1)).min(1),
      maxItems: socialLimit(100, 'Maximum profile reactions to request.'),
      postedLimit: z
        .enum(['any', '24h', 'week', 'month', '3months', '6months', 'year'])
        .optional(),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
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
    name: 'get_x_profile',
    description:
      'Fetch public X profile details and recent posts for a username. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/x/profile',
    endpointPath: '/api/v1/platform/scrapers/x/profile',
    inputSchema: {
      username: z.string().min(1),
      maxTweets: socialLimit(200, 'Maximum X posts to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_x_post',
    description:
      'Fetch a public X post by URL. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/x/post',
    endpointPath: '/api/v1/platform/scrapers/x/post',
    inputSchema: { postUrl: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_x_conversation',
    description:
      'Fetch a public X conversation by post ID. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/x/conversation',
    endpointPath: '/api/v1/platform/scrapers/x/conversation',
    inputSchema: {
      postId: z.string().min(1),
      maxTweets: socialLimit(500, 'Maximum conversation posts to request.'),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'search_x_posts',
    description:
      'Search public X posts by query. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/x/search-posts',
    endpointPath: '/api/v1/platform/scrapers/x/search-posts',
    inputSchema: {
      query: z.string().min(1),
      maxTweets: socialLimit(200, 'Maximum X posts to request.'),
      options: z.record(z.string(), z.unknown()).optional(),
      ...idempotencyField,
    },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_youtube_channel',
    description:
      'Fetch public YouTube channel details by URL. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/youtube/channel',
    endpointPath: '/api/v1/platform/scrapers/youtube/channel',
    inputSchema: { url: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
  endpointTool({
    name: 'get_youtube_video',
    description:
      'Fetch public YouTube video details by URL. This may consume The Hog credits.',
    method: 'POST',
    path: '/api/v1/platform/scrapers/youtube/video',
    endpointPath: '/api/v1/platform/scrapers/youtube/video',
    inputSchema: { url: z.string().min(1), ...idempotencyField },
    idempotent: true,
    openWorld: true,
  }),
];
