import { Test } from '@nestjs/testing';
import { PrismaReaderValueConnection } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-connection';
import { RunReaderValueTickUseCase } from '@social-monitor/relevance/application/use-cases/run-reader-value-tick.use-case';
import { CleanupReaderValueCacheUseCase } from '@social-monitor/relevance/application/use-cases/cleanup-reader-value-cache.use-case';
import { ReaderValueModule } from './reader-value.module';
import { PrismaReaderValueAssessmentStore } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { PrismaReaderValueInventory } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-inventory';
import { PrismaReaderValueMaintenanceScopes } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-maintenance-scopes';
import { OpenRouterReaderValueScorer } from '@social-monitor/relevance/infrastructure/reader-value/openrouter-reader-value-scorer';
import { OpenAiDecisionsReaderValueScorer } from '@social-monitor/relevance/infrastructure/reader-value/openai-decisions-reader-value-scorer';
import { readerValueScoringConfiguration } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config';
import { fixtureSource } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder.spec-support';
import type { ReaderValuePreparedInput } from '@social-monitor/relevance/application/contracts/reader-value-assessment-store';
import { assessmentClaim, scoringSuccess } from '@social-monitor/relevance/application/use-cases/assess-reader-value-batch.spec-support';

const keys = ['READER_VALUE_MODE', 'READER_VALUE_SCORING_LOOP', 'RELEVANCE_PERSISTENCE', 'READER_VALUE_DISCOVERY_SCOPES',
  'READER_VALUE_BACKFILL_FROM', 'OPENROUTER_API_KEY', 'INTELLIGENCE_READER_SUMMARY_JOB_LOOP',
  'SUMMARY_PERSISTENCE', 'NODE_ENV', 'READER_VALUE_SCORING_PROVIDER', 'OPENAI_API_KEY'] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeEach(() => { for (const key of keys) delete process.env[key]; });
afterEach(() => { jest.restoreAllMocks(); for (const key of keys) {
  const value = original[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value;
} });
const compile = (connection: unknown = null) => Test.createTestingModule({ imports: [ReaderValueModule] })
  .overrideProvider(PrismaReaderValueConnection).useValue(connection).compile();
function shadow() {
  Object.assign(process.env, { RELEVANCE_PERSISTENCE: 'prisma', READER_VALUE_MODE: 'jev_shadow',
    READER_VALUE_SCORING_LOOP: 'enabled', READER_VALUE_BACKFILL_FROM: '2026-09-01T00:00:00Z',
    READER_VALUE_DISCOVERY_SCOPES: JSON.stringify([{ tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      interestId: '44444444-4444-4444-8444-444444444444' }]) });
}

describe('reader-value worker composition', () => {
  it.each(['openrouter-systemone', 'openai-decisions'] as const)(
    'uses matching %s discovery, scorer and claim identity during a composed tick', async (provider) => {
      shadow();
      process.env.READER_VALUE_SCORING_PROVIDER = provider;
      process.env[provider === 'openai-decisions' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'] = 'fixture-key';
      const scope = JSON.parse(process.env.READER_VALUE_DISCOVERY_SCOPES!)[0] as {
        tenantId: string; workspaceId: string; interestId: string };
      const source = { ...fixtureSource, ...scope, availableAt: '2026-09-10T00:00:00Z' };
      jest.spyOn(PrismaReaderValueInventory.prototype, 'page').mockResolvedValue([{
        cursor: { publishedAt: '2026-09-10T00:00:00Z', feedItemId: 'feed' }, source,
        sourceBindingId: 'binding', observedAt: '2026-09-10T00:00:00Z', sourceRevisionKey: 'revision',
        sourceUpdatedAt: '2026-09-10T00:00:00Z', metadata: { kind: 'rss_item' },
      }]);
      let input: ReaderValuePreparedInput | undefined;
      const ensure = jest.spyOn(PrismaReaderValueAssessmentStore.prototype, 'ensure').mockImplementation(async (_id, prepared) => {
        input = prepared;
        return { ...assessmentClaim(), input: prepared, state: 'pending' };
      });
      const claim = jest.spyOn(PrismaReaderValueAssessmentStore.prototype, 'claim').mockImplementationOnce(async () => {
        if (!input) throw new Error('Discovery must precede claim');
        return { ...assessmentClaim(), input };
      }).mockResolvedValue(null);
      jest.spyOn(PrismaReaderValueAssessmentStore.prototype, 'authorizeDispatch').mockResolvedValue(true);
      jest.spyOn(PrismaReaderValueAssessmentStore.prototype, 'complete').mockResolvedValue(true);
      jest.spyOn(PrismaReaderValueAssessmentStore.prototype, 'recoverExpiredLeases').mockResolvedValue(0);
      jest.spyOn(PrismaReaderValueAssessmentStore.prototype, 'backlogAgeMs').mockResolvedValue(0);
      jest.spyOn(PrismaReaderValueMaintenanceScopes.prototype, 'next').mockResolvedValueOnce(scope).mockResolvedValue(null);
      const jev = jest.spyOn(OpenRouterReaderValueScorer.prototype, 'score').mockResolvedValue(scoringSuccess());
      const openai = jest.spyOn(OpenAiDecisionsReaderValueScorer.prototype, 'score').mockResolvedValue(scoringSuccess());
      const module = await compile({ client: {} });
      try {
        expect(await module.get(RunReaderValueTickUseCase).execute()).toMatchObject({ health: 'ok', assessed: 1 });
        expect(ensure).toHaveBeenCalledTimes(1);
        expect(input).toMatchObject(readerValueScoringConfiguration(provider));
        expect(claim.mock.calls[0]?.[1]).toBe(input?.modelConfigVersion);
        expect(provider === 'openai-decisions' ? openai : jev).toHaveBeenCalledWith(input);
        expect(provider === 'openai-decisions' ? jev : openai).not.toHaveBeenCalled();
      } finally { await module.close(); }
    });

  it('requires the selected OpenAI key and ignores an unrelated OpenRouter key', async () => {
    shadow(); process.env.READER_VALUE_SCORING_PROVIDER = 'openai-decisions';
    process.env.OPENROUTER_API_KEY = 'fixture-other';
    await expect(compile({ client: {} })).rejects.toThrow('OPENAI_API_KEY');
    process.env.OPENAI_API_KEY = 'fixture-openai'; delete process.env.OPENROUTER_API_KEY;
    const module = await compile({ client: {} });
    await module.close();
  });

  it('keeps explicit OpenAI selection credential-free when scoring is disabled', async () => {
    process.env.READER_VALUE_MODE = 'legacy_v2'; process.env.READER_VALUE_SCORING_PROVIDER = 'openai-decisions';
    const module = await compile();
    expect(module.get(RunReaderValueTickUseCase)).toBeNull();
    await module.close();
  });
  it('keeps an explicit legacy rollback free of a paid scorer dependency', async () => {
    process.env.READER_VALUE_MODE = 'legacy_v2';
    const module = await compile();
    expect(module.get(RunReaderValueTickUseCase)).toBeNull();
    await module.close();
  });
  it('wires independent cleanup with scoring disabled and no credential', async () => {
    process.env.READER_VALUE_MODE = 'legacy_v2';
    process.env.RELEVANCE_PERSISTENCE = 'prisma';
    const module = await compile({ client: {} });
    expect(module.get(RunReaderValueTickUseCase)).toBeNull();
    expect(module.get(CleanupReaderValueCacheUseCase)).toBeInstanceOf(CleanupReaderValueCacheUseCase);
    await module.close();
  });
  it('requires an explicit credential for enabled shadow, without making a network probe', async () => {
    shadow();
    await expect(compile({ client: {} })).rejects.toThrow(/OPENROUTER_API_KEY/u);
    process.env.OPENROUTER_API_KEY = 'fixture-key';
    const module = await compile({ client: {} });
    expect(module.get(RunReaderValueTickUseCase)).toBe(module.get(RunReaderValueTickUseCase));
    expect(module.get(RunReaderValueTickUseCase)).toBeInstanceOf(RunReaderValueTickUseCase);
    await module.close();
  });
  it('wires primary only with its due poller, persistence, and credential', async () => {
    shadow();
    process.env.READER_VALUE_MODE = 'jev_primary_v3';
    process.env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP = 'enabled';
    process.env.SUMMARY_PERSISTENCE = 'prisma';
    process.env.OPENROUTER_API_KEY = 'fixture-key';
    const module = await compile({ client: {} });
    expect(module.get(RunReaderValueTickUseCase)).toBeInstanceOf(RunReaderValueTickUseCase);
    await module.close();
  });
  it('wires production primary without an explicit mode or scope allowlist', async () => {
    Object.assign(process.env, { NODE_ENV: 'production', RELEVANCE_PERSISTENCE: 'prisma',
      SUMMARY_PERSISTENCE: 'prisma', OPENROUTER_API_KEY: 'fixture-key' });
    const module = await compile({ client: {} });
    expect(module.get(RunReaderValueTickUseCase)).toBeInstanceOf(RunReaderValueTickUseCase);
    await module.close();
  });
});
