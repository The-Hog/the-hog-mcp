import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisterToolDefinitionsOptions } from '../register.js';
import { registerToolDefinitions } from '../register.js';
import { primitiveTools } from './definitions.js';

export function registerPrimitiveTools(
  server: McpServer,
  options: RegisterToolDefinitionsOptions,
): void {
  registerToolDefinitions(server, primitiveTools, options);
}
