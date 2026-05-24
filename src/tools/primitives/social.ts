import { z } from 'zod/v4';
import { idempotencyField } from '../schemas.js';
import { socialLimit } from './common.js';
import { endpointTool } from './endpoint-tool.js';
import type { PrimitiveToolDefinition } from './types.js';

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
];
