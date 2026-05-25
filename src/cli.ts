#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { redactString } from './client/redaction.js';

async function main(): Promise<void> {
  const server = createServer(loadConfig());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${redactString(message)}\n`);
  process.exitCode = 1;
});
