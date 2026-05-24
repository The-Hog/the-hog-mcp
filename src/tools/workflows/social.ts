import { z } from 'zod/v4';
import type { TheHogToolClient } from '../../client/thehog-client.js';
import type { ToolInput } from '../types.js';
import { workflowToolAnnotations, type WorkflowToolDefinition } from './types.js';
import {
  clampInt,
  createWorkflowContext,
  extractItems,
  runWorkflowStep,
  workflowSummary,
} from './helpers.js';

export const socialWorkflowTools: WorkflowToolDefinition[] = [
  {
    name: 'analyze_social_profile',
    description:
      'Analyze a public Instagram or TikTok profile by fetching profile data and the bounded recent content available through The Hog API. This may consume The Hog credits. Defaults: 12 recent posts or videos.',
    inputSchema: {
      platform: z.enum(['instagram', 'tiktok']),
      username: z.string().min(1).max(200),
      maxPosts: z.number().int().min(1).max(50).optional(),
    },
    annotations: workflowToolAnnotations,
    execute: analyzeSocialProfile,
  },
];

async function analyzeSocialProfile(input: ToolInput, client: TheHogToolClient) {
  const ctx = createWorkflowContext('analyze_social_profile');
  const username = String(input.username);
  const maxPosts = clampInt(input.maxPosts, 12, 1, 50);

  if (input.platform === 'instagram') {
    const profileStep = await runWorkflowStep(client, ctx, {
      step: 'get_instagram_profile',
      method: 'POST',
      path: '/api/v1/platform/scrapers/instagram/profile',
      body: { username },
    });
    const postsStep = await runWorkflowStep(client, ctx, {
      step: 'list_instagram_posts',
      method: 'POST',
      path: '/api/v1/platform/scrapers/instagram/posts',
      body: { username, maxPosts },
    });
    const posts = extractItems(postsStep, ['posts', 'data', 'results']);
    return {
      ...workflowSummary(ctx, [profileStep, postsStep].filter(Boolean).length),
      steps: {
        profile: profileStep?.final,
        posts: postsStep?.final,
      },
      summary: {
        platform: 'instagram',
        contentCount: posts.length,
      },
    };
  }

  const profileStep = await runWorkflowStep(client, ctx, {
    step: 'get_tiktok_profile',
    method: 'POST',
    path: '/api/v1/platform/scrapers/tiktok/profile',
    body: { username, maxVideos: maxPosts },
  });
  const videos = extractItems(profileStep, ['videos', 'posts', 'data', 'results']);
  return {
    ...workflowSummary(ctx, profileStep ? 1 : 0),
    steps: {
      profile: profileStep?.final,
    },
    summary: {
      platform: 'tiktok',
      contentCount: videos.length,
    },
  };
}
