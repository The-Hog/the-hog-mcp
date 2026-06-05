import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import type { TheHogToolClient } from '../client/thehog-client.js';
import { errorResult, jsonErrorResult, jsonResult } from './format.js';
import type { McpToolDefinition } from './types.js';

export type ToolRequestContext = RequestHandlerExtra<ServerRequest, ServerNotification>;

export type ToolClientProvider = (
  context: ToolRequestContext,
) => TheHogToolClient | Promise<TheHogToolClient>;

export interface RegisterToolDefinitionsOptions {
  getClient: ToolClientProvider;
}

export function registerToolDefinitions(
  server: McpServer,
  tools: McpToolDefinition[],
  options: RegisterToolDefinitionsOptions,
): void {
  for (const tool of tools) {
    const schema = z.object(tool.inputSchema).strict();
    server.registerTool(
      tool.name,
      {
        title: titleFromToolName(tool.name),
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (rawInput, context) => {
        try {
          const input = schema.parse(rawInput);
          const client = await options.getClient(context);
          const result = await tool.execute(input, client);
          const payload = asObject(result);
          if (isFailedWorkflowResult(payload)) {
            return jsonErrorResult({ ...payload, ok: false, tool: tool.name });
          }
          return jsonResult({
            ...payload,
            ok: typeof payload.ok === 'boolean' ? payload.ok : true,
            tool: tool.name,
          });
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
