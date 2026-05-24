import { z } from 'zod/v4';
import {
  idempotencyField,
  jsonObjectSchema,
  monitorTypeSchema,
  paginationFields,
} from '../schemas.js';
import { operationIdField } from './common.js';
import { endpointTool, omit, pick } from './endpoint-tool.js';
import type { PrimitiveToolDefinition } from './types.js';

export const monitorPrimitiveTools: PrimitiveToolDefinition[] = [
  endpointTool({
    name: 'create_monitor',
    description:
      'Create a recurring monitor that tracks a public topic, profile, or post. This may consume The Hog credits when the monitor runs.',
    method: 'POST',
    path: '/api/v1/monitors',
    endpointPath: '/api/v1/monitors',
    inputSchema: {
      name: z.string().min(1).max(256),
      type: monitorTypeSchema,
      config: jsonObjectSchema,
      cadence_minutes: z.number().int().min(15).max(10080).optional(),
      max_results: z.number().int().min(1).max(100).optional(),
      force_fresh: z.boolean().optional(),
      cache_ttl_days: z.number().min(1).max(90).optional(),
      post_url: z.string().min(1).optional(),
      ...idempotencyField,
    },
    idempotent: true,
  }),
  endpointTool({
    name: 'list_monitors',
    description: 'List monitors for the authenticated organization.',
    method: 'GET',
    path: '/api/v1/monitors',
    endpointPath: '/api/v1/monitors',
    inputSchema: {
      ...paginationFields,
      status: z.string().min(1).optional(),
    },
    query: (input) => pick(input, ['cursor', 'limit', 'status']),
  }),
  endpointTool({
    name: 'get_monitor',
    description: 'Retrieve a monitor by ID.',
    method: 'GET',
    path: (input) => `/api/v1/monitors/${encodeURIComponent(String(input.id))}`,
    endpointPath: '/api/v1/monitors/{id}',
    inputSchema: operationIdField,
  }),
  endpointTool({
    name: 'update_monitor',
    description:
      'Update a monitor configuration, cadence, or status. This affects future monitor runs.',
    method: 'PATCH',
    path: (input) => `/api/v1/monitors/${encodeURIComponent(String(input.id))}`,
    endpointPath: '/api/v1/monitors/{id}',
    inputSchema: {
      id: z.string().min(1),
      name: z.string().min(1).max(256).optional(),
      config: jsonObjectSchema.optional(),
      cadence_minutes: z.number().int().min(15).max(10080).optional(),
      max_results: z.number().int().min(1).max(100).optional(),
      force_fresh: z.boolean().optional(),
      cache_ttl_days: z.number().min(1).max(90).optional(),
      status: z.enum(['active', 'paused']).optional(),
      ...idempotencyField,
    },
    body: (input) => omit(input, ['id', 'idempotencyKey']),
    idempotent: true,
  }),
  endpointTool({
    name: 'delete_monitor',
    description:
      'Permanently delete a monitor by ID. This is destructive and requires confirm: true.',
    method: 'DELETE',
    path: (input) => `/api/v1/monitors/${encodeURIComponent(String(input.id))}`,
    endpointPath: '/api/v1/monitors/{id}',
    inputSchema: {
      id: z.string().min(1),
      confirm: z.literal(true).describe('Must be true to delete the monitor.'),
    },
    requireConfirm: true,
  }),
  endpointTool({
    name: 'run_monitor_now',
    description:
      'Trigger an immediate run of a monitor instead of waiting for its next scheduled time. This may consume The Hog credits.',
    method: 'POST',
    path: (input) => `/api/v1/monitors/${encodeURIComponent(String(input.id))}/run-now`,
    endpointPath: '/api/v1/monitors/{id}/run-now',
    inputSchema: {
      id: z.string().min(1),
      force_fresh: z.boolean().optional(),
      ...idempotencyField,
    },
    body: (input) => omit(input, ['id', 'idempotencyKey']),
    idempotent: true,
  }),
  endpointTool({
    name: 'list_monitor_events',
    description: 'List events detected by a monitor.',
    method: 'GET',
    path: (input) => `/api/v1/monitors/${encodeURIComponent(String(input.id))}/events`,
    endpointPath: '/api/v1/monitors/{id}/events',
    inputSchema: {
      id: z.string().min(1),
      ...paginationFields,
      since: z.string().min(1).optional(),
    },
    query: (input) => pick(input, ['cursor', 'limit', 'since']),
  }),
];
