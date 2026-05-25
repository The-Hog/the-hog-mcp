import { z } from 'zod/v4';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { TheHogToolClient } from '../client/thehog-client.js';

export type ToolInput = Record<string, unknown>;
export type ToolShape = Record<string, z.ZodTypeAny>;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolShape;
  annotations: ToolAnnotations;
  execute: (input: ToolInput, client: TheHogToolClient) => Promise<unknown>;
}
