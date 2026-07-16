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
  let server: Server | undefined;
  try {
    const handlers = app.get(SocialResearchToolHandlers);
    server = buildSocialResearchGrpcServer({
      handlers,
      serviceToken: settings.serviceToken,
    });
    await bindGrpcServer(server, settings.bindAddress);
  } catch (constructionError) {
    await cleanupFailedGrpcConstruction(app, server, constructionError);
  }
  const boundServer = requireBoundGrpcServer(server);

  return {
    app,
    server: boundServer,
    bindAddress: settings.bindAddress,
    close: async () => {
      await closeGrpcRuntime(boundServer, app);
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
  new Promise((resolve, reject) => {
    server.tryShutdown((error?: Error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const closeGrpcRuntime = async (
  server: Server,
  app: INestApplicationContext,
): Promise<void> => {
  const errors: unknown[] = [];
  try {
    await shutdownGrpcServer(server);
  } catch (error) {
    errors.push(error);
  }
  try {
    await app.close();
  } catch (error) {
    errors.push(error);
  }
  throwCleanupErrors(errors, 'social research gRPC shutdown failed');
};

const cleanupFailedGrpcConstruction = async (
  app: INestApplicationContext,
  server: Server | undefined,
  constructionError: unknown,
): Promise<never> => {
  const errors: unknown[] = [constructionError];
  if (server !== undefined) {
    try {
      await shutdownGrpcServer(server);
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await app.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) {
    throw constructionError;
  }
  throw new AggregateError(
    errors,
    'social research gRPC construction and cleanup failed',
  );
};

const requireBoundGrpcServer = (server: Server | undefined): Server => {
  if (server === undefined) {
    throw new Error('social research gRPC server was not constructed');
  }
  return server;
};

const throwCleanupErrors = (errors: readonly unknown[], message: string): void => {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, message);
  }
};
