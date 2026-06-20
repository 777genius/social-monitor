import type { BetaLaunchSupportSnapshot } from '../../domain';
import type { BetaLaunchSupportReadModelPort } from '../../ports';

const betaLaunchSupportSnapshot = {
  schemaVersion: 1,
  snapshotId: 'beta-launch-support-mvp-v1',
  publishedAt: '2026-06-16T00:00:00.000Z',
  launchMode: 'api_operator_beta',
  supportedSources: ['github', 'hacker-news', 'reddit', 'rss'],
  deferredSources: ['telegram', 'x-twitter'],
  knownLimitations: [
    {
      limitationId: 'fake-source-fixture-only',
      severity: 'notice',
      title: 'Fake source is fixture-only',
      userImpact: 'Fake source is available only for deterministic certification and cannot be bound in external beta.',
      supportAction: 'Use Hacker News, RSS, GitHub or Reddit for beta source bindings.',
      owner: 'source-owner',
      revisitTrigger: 'Remove the fixture source from user-facing launch support once external beta evidence is attached.',
    },
    {
      limitationId: 'frontend-deferred',
      severity: 'notice',
      title: 'User-facing frontend is deferred',
      userImpact: 'Private beta uses REST/OpenAPI, WebSocket events and operator scripts instead of Flutter UI.',
      supportAction: 'Use OpenAPI, smoke scripts or internal API clients when walking users through the MVP loop.',
      owner: 'product-owner',
      revisitTrigger: 'Resume frontend track after backend loop, contracts and beta support flows stay stable.',
    },
    {
      limitationId: 'x-twitter-deferred',
      severity: 'blocked',
      title: 'X/Twitter is not enabled in beta',
      userImpact: 'X/Twitter source requests are captured as roadmap evidence and cannot be bound for scans.',
      supportAction: 'Record a source_request feedback item and explain that paid/vendor access approval is required.',
      owner: 'source-owner',
      revisitTrigger: 'Approve source policy, quota budget, retention terms and deletion behavior.',
    },
    {
      limitationId: 'telegram-manual-only',
      severity: 'blocked',
      title: 'Telegram automation is manual-only',
      userImpact: 'Telegram channels cannot be monitored automatically until scoped authorization is implemented.',
      supportAction: 'Capture channel demand, authorization model and admin ownership in source-request notes.',
      owner: 'source-owner',
      revisitTrigger: 'Bot/channel API scope and credential lifecycle are approved.',
    },
    {
      limitationId: 'durable-runtime-required-before-external-beta',
      severity: 'degraded',
      title: 'External beta requires durable runtime persistence',
      userImpact: 'In-memory/noop runtime adapters are acceptable only for local/internal MVP proof.',
      supportAction: 'Do not claim multi-process durability until persistence-readiness gates are green.',
      owner: 'backend-lead',
      revisitTrigger: 'All runtime selectors point to durable adapters in the target environment.',
    },
  ],
  postMvpBacklog: [
    {
      itemId: 'frontend-fsd-client',
      classification: 'deferred_idea',
      title: 'Build user-facing frontend after API-first beta evidence',
      evidence: 'Current MVP validates the backend loop through REST/OpenAPI and WebSocket contracts.',
      owner: 'frontend-owner',
      architectureGuardrail: 'Frontend domain stays behind feature-scoped stores and generated API adapters.',
      revisitTrigger: 'Private beta users repeatedly need self-serve workflows instead of operator-assisted flows.',
    },
    {
      itemId: 'x-twitter-source-adapter',
      classification: 'evidence_based_opportunity',
      title: 'Evaluate approved X/Twitter access path',
      evidence: 'Source requests are routed as source_request feedback and blocked from beta bindings.',
      owner: 'source-owner',
      architectureGuardrail: 'Only official paid API or approved vendor adapter; no scraping/bypass path.',
      revisitTrigger: 'Demand exceeds beta threshold and budget/legal approval exists.',
    },
    {
      itemId: 'telegram-source-adapter',
      classification: 'deferred_idea',
      title: 'Add Telegram with explicit channel authorization',
      evidence: 'Readiness profile exists, but automation scope and credential lifecycle are not approved.',
      owner: 'source-owner',
      architectureGuardrail: 'Tenant-owned credentials and channel authorization are required before scanning.',
      revisitTrigger: 'A beta workspace provides authorized channel scope and operational need.',
    },
    {
      itemId: 'enterprise-reporting',
      classification: 'accepted_mvp_gap',
      title: 'Enterprise reporting remains post-MVP',
      evidence: 'MVP support uses audit, health, delivery and feedback endpoints instead of reporting dashboards.',
      owner: 'product-owner',
      architectureGuardrail: 'Reporting must consume read models/events, not write-domain repositories directly.',
      revisitTrigger: 'Beta users need recurring governance/report exports.',
    },
  ],
} as const satisfies BetaLaunchSupportSnapshot;

export class StaticBetaLaunchSupportReadModel implements BetaLaunchSupportReadModelPort {
  async getSnapshot(): Promise<BetaLaunchSupportSnapshot> {
    return betaLaunchSupportSnapshot;
  }
}
