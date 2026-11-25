import type { BetaLaunchSupportSnapshot } from '../../domain';
import type { BetaLaunchSupportReadModelPort } from '../../ports';
import { GetBetaLaunchSupportUseCase } from './get-beta-launch-support.use-case';

class StaticReadModel implements BetaLaunchSupportReadModelPort {
  async getSnapshot(): Promise<BetaLaunchSupportSnapshot> {
    return {
      schemaVersion: 1,
      snapshotId: 'test-beta-launch-support',
      publishedAt: '2026-06-16T00:00:00.000Z',
      launchMode: 'api_operator_beta',
      supportedSources: ['hacker-news', 'rss'],
      deferredSources: ['x-twitter'],
      knownLimitations: [
        {
          limitationId: 'x-twitter-deferred',
          severity: 'blocked',
          title: 'X/Twitter is not enabled in beta',
          userImpact: 'Requests are captured as roadmap evidence.',
          supportAction: 'Record source_request feedback.',
          owner: 'source-owner',
          revisitTrigger: 'Approved access path exists.',
        },
      ],
      postMvpBacklog: [
        {
          itemId: 'x-twitter-source-adapter',
          classification: 'evidence_based_opportunity',
          title: 'Evaluate approved X/Twitter access path',
          evidence: 'Beta user requested it.',
          owner: 'source-owner',
          architectureGuardrail: 'Official API or approved vendor only.',
          revisitTrigger: 'Demand and budget are approved.',
        },
      ],
    };
  }
}

describe('GetBetaLaunchSupportUseCase', () => {
  it('returns beta launch support snapshot from the read model port', async () => {
    const result = await new GetBetaLaunchSupportUseCase(new StaticReadModel()).execute();

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        launchMode: 'api_operator_beta',
        supportedSources: ['hacker-news', 'rss'],
        deferredSources: ['x-twitter'],
      }),
    });
  });
});
