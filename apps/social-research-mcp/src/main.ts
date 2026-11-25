import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { bindPostgresRuntimeProcessIdentity } from '@social-monitor/platform-persistence';
import 'reflect-metadata';

import { createSocialResearchMcpRuntime } from './social-research-mcp-runtime';

async function main(): Promise<void> {
  bindPostgresRuntimeProcessIdentity(process.env, 'social-research-mcp');
  const runtime = await createSocialResearchMcpRuntime();
  const transport = new StdioServerTransport();
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (): void => {
    shutdownPromise ??= runtime.close().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown shutdown error';
      process.stderr.write(`social research MCP shutdown failed: ${message}\n`);
      process.exitCode = 1;
    });
    void shutdownPromise;
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await runtime.server.connect(transport);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown MCP server error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
