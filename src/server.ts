import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TheHogMcpConfig } from './config.js';
import { TheHogClient } from './client/thehog-client.js';
import { registerPrimitiveTools } from './tools/primitives/register.js';
import { registerWorkflowTools } from './tools/workflows/register.js';
import { registerResources } from './resources/register.js';
import { packageVersion } from './package-info.js';

export function createServer(config: TheHogMcpConfig): McpServer {
  const server = new McpServer({
    name: '@thehog/mcp',
    version: packageVersion,
  });
  const client = new TheHogClient(config);
  const toolOptions = { getClient: () => client };
  registerPrimitiveTools(server, toolOptions);
  registerWorkflowTools(server, toolOptions);
  registerResources(server);
  return server;
}
