import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import type { TheHogClient } from '../client/thehog-client.js';
import { errorResult, jsonErrorResult, jsonResult } from './format.js';
import type { McpToolDefinition } from './types.js';

export function registerToolDefinitions(
  server: McpServer,
  client: TheHogClient,
  tools: McpToolDefinition[],
): void {
  for (const tool of tools) {
    const schema = z.object(tool.inputSchema).strict();
    server.registerTool(
      tool.name,
      {
        title: titleFromToolName(tool.name),
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (rawInput) => {
        try {
          const input = schema.parse(rawInput);
          const result = await tool.execute(input, client);
          const payload = asObject(result);
          if (isFailedWorkflowResult(payload)) {
            return jsonErrorResult({ ...payload, ok: false, tool: tool.name });
          }
          return jsonResult({ ...payload, ok: true, tool: tool.name });
        } catch (error) {
          return errorResult(error);
        }
      },
    );
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { response: value };
}

function isFailedWorkflowResult(value: Record<string, unknown>): boolean {
  return typeof value.workflow === 'string' && value.status === 'failed';
}

function titleFromToolName(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
