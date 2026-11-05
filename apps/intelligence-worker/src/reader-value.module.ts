import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { SourceContentSafetyPolicy } from '@social-monitor/relevance/domain/source-content-safety';
import { AssessReaderValueBatchUseCase } from '@social-monitor/relevance/application/use-cases/assess-reader-value-batch.use-case';
import { DiscoverReaderValueBatchUseCase } from '@social-monitor/relevance/application/use-cases/discover-reader-value-batch.use-case';
import { RunReaderValueTickUseCase } from '@social-monitor/relevance/application/use-cases/run-reader-value-tick.use-case';
import { PrismaReaderValueInventory } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-inventory';
import { ConservativeReaderValueInputBuilder } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder';
import { OpenRouterReaderValueScorer } from '@social-monitor/relevance/infrastructure/reader-value/openrouter-reader-value-scorer';
import { OpenAiDecisionsReaderValueScorer } from '@social-monitor/relevance/infrastructure/reader-value/openai-decisions-reader-value-scorer';
import { resolveReaderValueScoringApiKey, resolveReaderValueScoringSelection } from '@social-monitor/relevance/interfaces/rest/reader-value-scoring-provider-tokens';
import { ReaderValueScoringLoop } from './reader-value-scoring-loop';
import { resolveReaderValueRuntimeOptions } from './reader-value-runtime-options';
import { Module } from '@nestjs/common';
import { resolvePostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import { CleanupReaderValueCacheUseCase } from '@social-monitor/relevance/application/use-cases/cleanup-reader-value-cache.use-case';
import { PrismaReaderValueConnection } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-connection';
import { PrismaReaderValueAssessmentStore } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { PrismaReaderValueMaintenanceScopes } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-maintenance-scopes';
import { resolveRelevancePersistenceMode } from '@social-monitor/relevance/interfaces/rest/relevance-provider-tokens';
import { ReaderValueCleanupLoop } from './reader-value-cleanup-loop';
import { READER_VALUE_CLEANUP_OPTIONS, resolveReaderValueCleanupOptions, type ReaderValueCleanupOptions } from './reader-value-provider-tokens';

@Module({
  providers: [
    { provide: READER_VALUE_CLEANUP_OPTIONS, useFactory: () => resolveReaderValueCleanupOptions(process.env) },
    { provide: PrismaReaderValueConnection, useFactory: () => resolveRelevancePersistenceMode(process.env) === 'prisma'
      ? PrismaReaderValueConnection.create(resolvePostgresRuntimePoolConfig(process.env)) : null },
    { provide: CleanupReaderValueCacheUseCase, useFactory: (connection: PrismaReaderValueConnection | null,
      options: ReaderValueCleanupOptions) => connection ? new CleanupReaderValueCacheUseCase(
        new PrismaReaderValueMaintenanceScopes(connection.client), new PrismaReaderValueAssessmentStore(connection.client), options.policy,
      ) : null, inject: [PrismaReaderValueConnection, READER_VALUE_CLEANUP_OPTIONS] },
    { provide: RunReaderValueTickUseCase, useFactory: (connection: PrismaReaderValueConnection | null) => {
      const options = resolveReaderValueRuntimeOptions(process.env);
      const selection = resolveReaderValueScoringSelection(process.env);
      if (!options.scoringLoopEnabled) return null;
      const key = resolveReaderValueScoringApiKey(process.env, selection.provider, options.scoringLoopEnabled);
      if (!connection) throw new Error('Enabled reader value scorer requires persistence');
      const store = new PrismaReaderValueAssessmentStore(connection.client);
      const scopes = new PrismaReaderValueMaintenanceScopes(connection.client);
      const ids = new CryptoIdGenerator();
      const clock = new SystemClock();
      const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy(), selection.provider);
      const scorer = selection.provider === 'openai-decisions'
        ? new OpenAiDecisionsReaderValueScorer(key, clock) : new OpenRouterReaderValueScorer(key, clock);
      return new RunReaderValueTickUseCase(
        new DiscoverReaderValueBatchUseCase(new PrismaReaderValueInventory(connection.client),
          builder, store, ids, clock),
        new AssessReaderValueBatchUseCase(store, scorer, ids),
        scopes,
        { discoveryScopes: options.discoveryScopes, backfillFrom: options.backfillFrom,
          modelConfigVersion: selection.configuration.modelConfigVersion, pinnedOnly: options.mode === 'legacy_v2',
          discoverAllActiveScopes: options.discoverAllActiveScopes }, store, scopes);
    }, inject: [PrismaReaderValueConnection] },
    ReaderValueScoringLoop,
    ReaderValueCleanupLoop,
  ],
})
export class ReaderValueModule {}
