import { z } from 'zod/v4';
import type { TheHogClient } from '../client/thehog-client.js';

export type ToolInput = Record<string, unknown>;
export type ToolShape = Record<string, z.ZodTypeAny>;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolShape;
  execute: (input: ToolInput, client: TheHogClient) => Promise<unknown>;
}
