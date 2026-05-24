import type { HttpMethod } from '../../client/thehog-client.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolDefinition, ToolInput, ToolShape } from '../types.js';

export type PollKind = 'operation' | 'search' | 'enrichment';

export type { ToolInput, ToolShape };

export interface PrimitiveToolDefinition extends McpToolDefinition {
  endpoint: {
    method: HttpMethod;
    path: string;
  };
}

export interface EndpointToolOptions {
  name: string;
  description: string;
  method: HttpMethod;
  path: string | ((input: ToolInput) => string);
  inputSchema: ToolShape;
  body?: (input: ToolInput) => unknown;
  query?: (input: ToolInput) => Record<string, unknown>;
  idempotent?: boolean;
  poll?: PollKind;
  requireConfirm?: boolean;
  openWorld?: boolean;
  annotations?: Partial<ToolAnnotations>;
  endpointPath: string;
}
