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
    let server: McpServer;
    try {
      const handlers = app.get(SocialResearchToolHandlers);
      server = buildSocialResearchMcpServer({ handlers });
    } catch (constructionError) {
      try {
        await app.close();
      } catch (cleanupError) {
        throw new AggregateError(
          [constructionError, cleanupError],
          'social research MCP construction and cleanup failed',
        );
      }
      throw constructionError;
    }

    return {
      app,
      server,
      close: async () => {
        const errors: unknown[] = [];
        try {
          await server.close();
        } catch (error) {
          errors.push(error);
        }
        try {
          await app.close();
        } catch (error) {
          errors.push(error);
        }
        if (errors.length === 1) {
          throw errors[0];
        }
        if (errors.length > 1) {
          throw new AggregateError(
            errors,
            'social research MCP shutdown failed',
          );
        }
      },
    };
  };
