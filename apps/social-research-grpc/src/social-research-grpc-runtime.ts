import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ServerCredentials } from '@grpc/grpc-js';
import type { Server } from '@grpc/grpc-js';
import { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';

import { SocialResearchRuntimeModule } from '../../social-research-runtime/src/social-research-runtime.module';
import { buildSocialResearchGrpcServer } from './social-research-grpc-server';
import type { SocialResearchGrpcSettings } from './social-research-grpc-settings';

export type SocialResearchGrpcRuntime = {
  readonly app: INestApplicationContext;
  readonly server: Server;
  readonly bindAddress: string;
  close(): Promise<void>;
};

export const createSocialResearchGrpcRuntime = async (
  settings: SocialResearchGrpcSettings,
): Promise<SocialResearchGrpcRuntime> => {
  const app = await NestFactory.createApplicationContext(
    SocialResearchRuntimeModule,
    { logger: ['error', 'warn'] },
  );
  const handlers = app.get(SocialResearchToolHandlers);
  const server = buildSocialResearchGrpcServer({
    handlers,
    serviceToken: settings.serviceToken,
  });
  await bindGrpcServer(server, settings.bindAddress);

  return {
    app,
    server,
    bindAddress: settings.bindAddress,
    close: async () => {
      await shutdownGrpcServer(server);
      await app.close();
    },
  };
};

export const bindGrpcServer = (
  server: Server,
  bindAddress: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    server.bindAsync(
      bindAddress,
      ServerCredentials.createInsecure(),
      (error) => {
        if (error !== null) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });

const shutdownGrpcServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.tryShutdown(() => {
      resolve();
    });
  });
