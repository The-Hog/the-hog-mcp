import { z } from 'zod/v4';

export const waitFields = {
  waitForResult: z
    .boolean()
    .optional()
    .describe(
      'When true, poll until the async operation reaches a terminal state or times out. By default async tools return a continuation with the operation ID to poll later.',
    ),
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .max(600)
    .optional()
    .describe(
      'Maximum time to poll when waitForResult is true. Polling backs off on 429 Retry-After responses.',
    ),
};

export const idempotencyField = {
  idempotencyKey: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe('Optional idempotency key. If omitted, the MCP server generates one for mutating requests.'),
};

export const paginationFields = {
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
};

export const personIdentifierSchema = z
  .object({
    linkedin_url: z.string().min(1).optional(),
    email: z.string().email().optional(),
    x_handle: z.string().min(1).optional(),
    github_username: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).filter(Boolean).length === 1, {
    message:
      'Provide exactly one identifier: linkedin_url, email, x_handle, or github_username.',
  });

const employeeCountSchema = z
  .object({
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.min === undefined || value.max === undefined || value.min <= value.max,
    {
      message: 'employeeCount.min must be less than or equal to employeeCount.max.',
    },
  );

export const entityFiltersSchema = z
  .object({
    titles: z.array(z.string().min(1)).max(100).optional(),
    titleMatch: z.enum(['exact', 'similar']).optional(),
    locations: z.array(z.string().min(1)).max(100).optional(),
    industries: z.array(z.string().min(1)).max(100).optional(),
    employeeCount: employeeCountSchema.optional(),
    signals: z.array(z.string().min(1)).max(20).optional(),
    company: z
      .object({
        names: z.array(z.string().min(1)).max(100).optional(),
        domains: z.array(z.string().min(1)).max(100).optional(),
        linkedinUrls: z.array(z.string().min(1)).max(100).optional(),
        industries: z.array(z.string().min(1)).max(100).optional(),
        employeeCount: employeeCountSchema.optional(),
        signals: z.array(z.string().min(1)).max(20).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const signalsConfigSchema = z
  .object({
    platforms: z.array(z.string().min(1)).optional(),
    max_posts: z.record(z.string(), z.number()).optional(),
    intent_signals: z.array(z.string().min(1)).optional(),
    since_days: z.number().int().min(1).optional(),
    handles: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const jsonObjectSchema = z.record(z.string(), z.unknown());

export const monitorTypeSchema = z.enum([
  'linkedin_keyword',
  'linkedin_profile',
  'linkedin_company',
  'linkedin_post',
  'instagram_profile',
  'instagram_post',
  'x_profile',
  'x_keyword',
  'reddit_keyword',
  'reddit_subreddit',
  'tiktok_keyword',
  'tiktok_hashtag',
  'web_search',
  'site_search',
]);
