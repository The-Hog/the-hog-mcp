import { z } from 'zod/v4';
import type { TheHogToolClient } from '../../client/thehog-client.js';
import {
  idempotencyField,
  monitorTypeSchema,
  waitFields,
} from '../schemas.js';
import type { ToolInput } from '../types.js';
import { workflowToolAnnotations, type WorkflowToolDefinition } from './types.js';
import {
  clampInt,
  createWorkflowContext,
  pollMetadata,
  pollFields,
  readString,
  runWorkflowStep,
  workflowIdempotencyKey,
  workflowSummary,
} from './helpers.js';

export const monitoringWorkflowTools: WorkflowToolDefinition[] = [
  {
    name: 'monitor_topic',
    description:
      'Create one or more monitors for a topic, person, company, profile, or post, optionally trigger an immediate run, and list recent events. This may consume The Hog credits when monitors run. Defaults: web_search source, 60 minute cadence, 10 results, and no immediate run.',
    inputSchema: {
      name: z.string().min(1).max(256),
      topic: z.string().min(1).max(500),
      sources: z.array(monitorTypeSchema).min(1).max(5).optional(),
      cadenceMinutes: z.number().int().min(15).max(10080).optional(),
      maxResults: z.number().int().min(1).max(100).optional(),
      runNow: z.boolean().optional(),
      forceFresh: z.boolean().optional(),
      postUrl: z.string().min(1).max(1000).optional(),
      site: z.string().min(1).max(300).optional(),
      ...waitFields,
      ...idempotencyField,
    },
    annotations: workflowToolAnnotations,
    execute: monitorTopic,
  },
];

async function monitorTopic(input: ToolInput, client: TheHogToolClient) {
  const ctx = createWorkflowContext('monitor_topic');
  const sources = readSources(input.sources);
  validateMonitorWorkflowInput(sources, input);
  const created: unknown[] = [];
  const runs: unknown[] = [];
  const events: unknown[] = [];

  for (const source of sources) {
    const createStep = await runWorkflowStep(client, ctx, {
      step: `create_monitor:${source}`,
      method: 'POST',
      path: '/api/v1/monitors',
      body: {
        name: sources.length > 1 ? `${input.name} (${source})` : input.name,
        type: source,
        config: monitorConfig(source, input),
        cadence_minutes: cadenceForSource(source, input.cadenceMinutes),
        max_results: clampInt(input.maxResults, 10, 1, 100),
        force_fresh: input.forceFresh,
        post_url: input.postUrl,
      },
      idempotencyKey: workflowIdempotencyKey(
        client,
        input,
        'monitor_topic',
        `create_${source}`,
      ),
    });
    if (createStep?.final) {
      created.push(createStep.final);
    }

    const monitorId = readString(createStep?.final, ['id']);
    if (!monitorId) {
      ctx.warnings.push({
        step: `run_monitor_now:${source}`,
        message:
          'The created monitor response did not include an ID, so run and event listing were skipped for this source.',
      });
      continue;
    }

    if (input.runNow === true) {
      const runStep = await runWorkflowStep(client, ctx, {
        step: `run_monitor_now:${source}`,
        method: 'POST',
        path: `/api/v1/monitors/${encodeURIComponent(monitorId)}/run-now`,
        body: {
          force_fresh: input.forceFresh,
        },
        idempotencyKey: workflowIdempotencyKey(
          client,
          input,
          'monitor_topic',
          `run_${source}`,
        ),
        poll: 'operation',
        ...pollFields(input),
      });
      if (runStep?.final) {
        runs.push({ source, ...pollMetadata(runStep), final: runStep.final });
      }
    }

    const eventStep = await runWorkflowStep(client, ctx, {
      step: `list_monitor_events:${source}`,
      method: 'GET',
      path: `/api/v1/monitors/${encodeURIComponent(monitorId)}/events`,
      query: {
        limit: clampInt(input.maxResults, 10, 1, 100),
      },
    });
    if (eventStep?.final) {
      events.push({ source, response: eventStep.final });
    }
  }

  return {
    ...workflowSummary(ctx, created.length),
    steps: {
      created,
      runs,
      events,
    },
    summary: {
      monitorCount: created.length,
      eventResponseCount: events.length,
    },
  };
}

function readSources(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ['web_search'];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function monitorConfig(source: string, input: ToolInput): Record<string, unknown> {
  if (source.endsWith('_post') && typeof input.postUrl === 'string') {
    return { post_url: input.postUrl, query: input.topic };
  }
  if (source === 'site_search') {
    return { query: input.topic, site: input.site };
  }
  return { query: input.topic };
}

function validateMonitorWorkflowInput(sources: string[], input: ToolInput): void {
  if (sources.includes('site_search') && typeof input.site !== 'string') {
    throw new Error('site_search monitors require site.');
  }
  const postSources = sources.filter((source) => source.endsWith('_post'));
  if (postSources.length > 0 && typeof input.postUrl !== 'string') {
    throw new Error(`${postSources.join(', ')} monitors require postUrl.`);
  }
}

function cadenceForSource(source: string, value: unknown): number {
  const minimum = source === 'web_search' || source === 'site_search' ? 15 : 60;
  return clampInt(value, 60, minimum, 10080);
}
