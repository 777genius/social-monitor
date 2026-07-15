import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';

import { buildSocialResearchMcpServer } from './social-research-mcp-server';
import { SocialResearchMcpRuntimeModule } from './social-research-mcp-runtime.module';

export type SocialResearchMcpRuntime = {
  readonly app: INestApplicationContext;
  readonly server: McpServer;
  close(): Promise<void>;
};

export const createSocialResearchMcpRuntime =
  async (): Promise<SocialResearchMcpRuntime> => {
    const app = await NestFactory.createApplicationContext(
      SocialResearchMcpRuntimeModule,
      { logger: ['error', 'warn'] },
    );
    const handlers = app.get(SocialResearchToolHandlers);

    return {
      app,
      server: buildSocialResearchMcpServer({ handlers }),
      close: async () => {
        await app.close();
      },
    };
  };
