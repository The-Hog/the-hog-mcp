import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisterToolDefinitionsOptions } from '../register.js';
import { registerToolDefinitions } from '../register.js';
import { workflowTools } from './definitions.js';

export function registerWorkflowTools(
  server: McpServer,
  options: RegisterToolDefinitionsOptions,
): void {
  registerToolDefinitions(server, workflowTools, options);
}
