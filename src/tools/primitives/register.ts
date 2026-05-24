import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TheHogClient } from '../../client/thehog-client.js';
import { registerToolDefinitions } from '../register.js';
import { primitiveTools } from './definitions.js';

export function registerPrimitiveTools(
  server: McpServer,
  client: TheHogClient,
): void {
  registerToolDefinitions(server, client, primitiveTools);
}
