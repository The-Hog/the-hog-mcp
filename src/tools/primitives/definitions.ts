import { corePrimitiveTools } from './core.js';
import { monitorPrimitiveTools } from './monitors.js';
import { searchPrimitiveTools } from './search.js';
import { socialPrimitiveTools } from './social.js';
import type { PrimitiveToolDefinition } from './types.js';
import { webPrimitiveTools } from './web.js';

const publicToolNames = [
  'search_companies',
  'search_people',
  'enrich_contact',
  'enrich_contacts',
  'start_deep_research',
  'get_operation',
  'get_enrichment',
  'submit_search',
  'get_search_result',
  'list_searches',
  'search_web',
  'crawl_website',
  'scrape_web_page',
  'get_instagram_profile',
  'list_instagram_posts',
  'get_instagram_post',
  'list_instagram_post_comments',
  'list_instagram_followers',
  'list_instagram_following',
  'find_linkedin_companies',
  'get_linkedin_company',
  'list_linkedin_company_posts',
  'search_linkedin_posts',
  'get_linkedin_profile',
  'list_linkedin_profile_posts',
  'list_linkedin_post_comments',
  'list_linkedin_post_reactions',
  'list_linkedin_profile_comments',
  'list_linkedin_profile_reactions',
  'get_tiktok_profile',
  'create_monitor',
  'list_monitors',
  'get_monitor',
  'update_monitor',
  'delete_monitor',
  'run_monitor_now',
  'list_monitor_events',
] as const;

export type PublicPrimitiveToolName = (typeof publicToolNames)[number];

export const primitiveTools: PrimitiveToolDefinition[] = [
  ...corePrimitiveTools,
  ...searchPrimitiveTools,
  ...webPrimitiveTools,
  ...socialPrimitiveTools,
  ...monitorPrimitiveTools,
];

assertAllToolsPresent();

function assertAllToolsPresent(): void {
  const expected = [...publicToolNames].sort();
  const actualNames = primitiveTools.map((tool) => tool.name);
  const actual = [...new Set(actualNames)].sort();
  if (actual.length !== actualNames.length) {
    throw new Error('Primitive MCP tool names must be unique.');
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Primitive MCP tools must exactly match the public allowlist. Expected ${expected.join(', ')}; got ${actual.join(', ')}.`,
    );
  }
}
