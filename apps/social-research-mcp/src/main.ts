import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import 'reflect-metadata';

import { createSocialResearchMcpRuntime } from './social-research-mcp-runtime';

async function main(): Promise<void> {
  const runtime = await createSocialResearchMcpRuntime();
  const transport = new StdioServerTransport();

  process.once('SIGINT', () => {
    void runtime.close();
  });
  process.once('SIGTERM', () => {
    void runtime.close();
  });

  await runtime.server.connect(transport);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown MCP server error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
