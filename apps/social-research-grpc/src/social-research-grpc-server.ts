import { Server } from '@grpc/grpc-js';
import { SocialResearchServiceService } from '@social-monitor/contracts/generated/grpc/social_research/v1/social_research';
import { createSocialResearchGrpcService } from '@social-monitor/social-research/grpc';
import type { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';

export type BuildSocialResearchGrpcServerOptions = {
  readonly handlers: SocialResearchToolHandlers;
  readonly serviceToken?: string;
};

export const buildSocialResearchGrpcServer = (
  options: BuildSocialResearchGrpcServerOptions,
): Server => {
  const server = new Server();
  server.addService(
    SocialResearchServiceService,
    createSocialResearchGrpcService(options.handlers, {
      serviceToken: options.serviceToken,
    }),
  );

  return server;
};
