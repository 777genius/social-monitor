import { Test } from '@nestjs/testing';
import { PrismaReaderValueConnection } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-connection';
import { RunReaderValueTickUseCase } from '@social-monitor/relevance/application/use-cases/run-reader-value-tick.use-case';
import { CleanupReaderValueCacheUseCase } from '@social-monitor/relevance/application/use-cases/cleanup-reader-value-cache.use-case';
import { ReaderValueModule } from './reader-value.module';

const keys = ['READER_VALUE_MODE', 'READER_VALUE_SCORING_LOOP', 'RELEVANCE_PERSISTENCE', 'READER_VALUE_DISCOVERY_SCOPES',
  'READER_VALUE_BACKFILL_FROM', 'OPENROUTER_API_KEY', 'INTELLIGENCE_READER_SUMMARY_JOB_LOOP',
  'SUMMARY_PERSISTENCE'] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeEach(() => { for (const key of keys) delete process.env[key]; });
afterEach(() => { for (const key of keys) {
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
});
