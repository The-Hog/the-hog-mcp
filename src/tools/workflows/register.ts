import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TheHogClient } from '../../client/thehog-client.js';
import { registerToolDefinitions } from '../register.js';
import { workflowTools } from './definitions.js';

export function registerWorkflowTools(
  server: McpServer,
  client: TheHogClient,
): void {
  registerToolDefinitions(server, client, workflowTools);
}
