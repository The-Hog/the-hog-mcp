import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { primitiveTools } from '../tools/primitives/definitions.js';
import { workflowTools } from '../tools/workflows/definitions.js';

export function registerResources(server: McpServer): void {
  server.registerResource(
    'auth',
    'thehog://auth',
    {
      title: 'The Hog MCP authentication',
      description: 'How to authenticate The Hog MCP.',
      mimeType: 'text/plain',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text:
            'Set THEHOG_API_KEY, or set both THEHOG_ACCESS_KEY and THEHOG_SECRET_KEY. The MCP server runs locally over stdio and calls https://developer.thehog.ai.',
        },
      ],
    }),
  );

  server.registerResource(
    'tools',
    'thehog://tools',
    {
      title: 'The Hog MCP tools',
      description: 'Public API and workflow tools exposed by The Hog MCP.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              primitives: primitiveTools.map((tool) => ({
                name: tool.name,
                endpoint: tool.endpoint,
                description: tool.description,
              })),
              workflows: workflowTools.map((tool) => ({
                name: tool.name,
                description: tool.description,
              })),
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerResource(
    'public_openapi',
    new ResourceTemplate('thehog://public-openapi', { list: undefined }),
    {
      title: 'The Hog public OpenAPI URL',
      description: 'Canonical public OpenAPI URL used to guard MCP endpoint exposure.',
      mimeType: 'text/plain',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: 'https://docs.thehog.ai/api-reference/openapi.json',
        },
      ],
    }),
  );
}
