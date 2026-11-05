import { READER_VALUE_SCORING_PROVIDER } from "@social-monitor/relevance/interfaces/rest/reader-value-scoring-provider-tokens";
import type { ReaderValueScoringProvider } from "@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config";
import { ConservativeReaderValueInputBuilder } from "@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder";
import { ReaderPostCurrentAssessmentIdentityAdapter } from "@social-monitor/relevance/infrastructure/reader-value/reader-post-current-assessment-identity.adapter";
import { SystemClock } from "@social-monitor/shared-kernel";
import type { Provider } from "@nestjs/common";
import { SourceContentSafetyPolicy } from "@social-monitor/relevance/domain/source-content-safety";
import { PrismaReaderPostCatalog, type ReaderPostsSqlClient } from "../../adapters/persistence/prisma/prisma-reader-post-catalog";
import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import { ListReaderPostsUseCase } from "../../features/list-reader-posts/list-reader-posts.use-case";
import { SUMMARY_PRISMA_CLIENT } from "./summary-provider-tokens";

export const readerPostsProviders: readonly Provider[] = [{
  provide: ListReaderPostsUseCase,
  inject: [SUMMARY_PRISMA_CLIENT, READER_VALUE_SCORING_PROVIDER],
  useFactory: (client: PrismaSummaryClient | null, provider: ReaderValueScoringProvider) => new ListReaderPostsUseCase(
    client === null ? { read: async () => [] } : new PrismaReaderPostCatalog(
      client as unknown as ReaderPostsSqlClient, new SourceContentSafetyPolicy(),
      new ReaderPostCurrentAssessmentIdentityAdapter(
        new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy(), provider), provider)),
    new SystemClock(),
  ),
}];
