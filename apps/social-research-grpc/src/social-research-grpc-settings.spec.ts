import { resolveSocialResearchGrpcSettings } from './social-research-grpc-settings';

describe('resolveSocialResearchGrpcSettings', () => {
  it('uses production-safe defaults when env is empty', () => {
    expect(resolveSocialResearchGrpcSettings({})).toEqual({
      bindAddress: '0.0.0.0:50053',
      serviceToken: undefined,
    });
  });

  it('trims configured bind address and service token', () => {
    expect(
      resolveSocialResearchGrpcSettings({
        SOCIAL_RESEARCH_GRPC_BIND: ' 127.0.0.1:55053 ',
        SOCIAL_RESEARCH_GRPC_SERVICE_TOKEN: ' token-1 ',
      }),
    ).toEqual({
      bindAddress: '127.0.0.1:55053',
      serviceToken: 'token-1',
    });
  });

  it('treats blank values as absent', () => {
    expect(
      resolveSocialResearchGrpcSettings({
        SOCIAL_RESEARCH_GRPC_BIND: ' ',
        SOCIAL_RESEARCH_GRPC_SERVICE_TOKEN: ' ',
      }),
    ).toEqual({
      bindAddress: '0.0.0.0:50053',
      serviceToken: undefined,
    });
  });
});
