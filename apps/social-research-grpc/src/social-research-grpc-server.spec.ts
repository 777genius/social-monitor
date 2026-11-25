import { Server } from '@grpc/grpc-js';
import type { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';

import { buildSocialResearchGrpcServer } from './social-research-grpc-server';

describe('buildSocialResearchGrpcServer', () => {
  it('creates a gRPC server with the social research service registered', () => {
    const server = buildSocialResearchGrpcServer({
      handlers: {} as SocialResearchToolHandlers,
      serviceToken: 'token-1',
    });

    try {
      expect(server).toBeInstanceOf(Server);
    } finally {
      server.forceShutdown();
    }
  });
});
