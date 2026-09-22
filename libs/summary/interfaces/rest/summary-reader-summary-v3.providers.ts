import type { Provider } from "@nestjs/common";
import { PrepareReaderValueSummaryUseCase } from
  "@social-monitor/relevance/application/use-cases/prepare-reader-value-summary.use-case";
import { SourceContentSafetyPolicy } from
  "@social-monitor/relevance/domain/source-content-safety";
import type { AssessmentSqlClient } from
  "@social-monitor/relevance/infrastructure/reader-value/assessment-sql";
import { PrismaReaderValueAssessmentStore } from
  "@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store";
import { PrismaReaderValueInventory } from
  "@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-inventory";
import { ConservativeReaderValueInputBuilder } from
  "@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder";
import { CONFIGURED_INTEREST_READER, type ConfiguredInterestReaderPort } from
  "@social-monitor/relevance/ports";
import { CryptoIdGenerator } from "@social-monitor/shared-kernel";
import { RelevanceReaderSummaryV3PreparationSource } from
  "../../adapters/evidence/relevance-reader-summary-v3-preparation-source";
import { RelevanceReaderSummaryEvidenceSelector } from
  "../../adapters/evidence/relevance-reader-summary-evidence.selector";
import { RelevanceReaderSummaryV3Promotion } from
  "../../adapters/evidence/relevance-reader-summary-v3-promotion";
import { AgentRuntimePromotionPresentationV3Builder,
  type AgentRuntimePromotionPresentationV3BuilderOptions } from
  "../../adapters/model/agent-runtime-promotion-presentation-v3.builder";
import { GrpcAgentRuntimeClient } from "../../adapters/model/grpc-agent-runtime-client";
import { PrismaReaderSummaryJobRepository } from
  "../../adapters/persistence/prisma/prisma-reader-summary-job.repository";
import type { PrismaSummaryClient } from
  "../../adapters/persistence/prisma/prisma-summary-client";
import { PrismaReaderSummaryV3Preflight } from
  "../../adapters/persistence/prisma/prisma-reader-summary-v3-preflight";
import type { ReaderSummaryJobRepositoryPort, ReaderSummaryV3PreflightPort,
  ReaderSummaryV3PromotionPort } from "../../ports";
import { READER_SUMMARY_JOB_REPOSITORY,
  READER_SUMMARY_V3_PREFLIGHT, READER_SUMMARY_V3_PROMOTION,
  SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT,
  type SummaryPersistenceMode } from "./summary-provider-tokens";
import { SUMMARY_AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_OPTIONS } from
  "./summary-agent-runtime-provider-tokens";

export const readerSummaryV3Providers: readonly Provider[] = [{
  provide: READER_SUMMARY_V3_PREFLIGHT,
  useFactory: (mode: SummaryPersistenceMode, prisma: PrismaSummaryClient | null,
    jobs: ReaderSummaryJobRepositoryPort, interests: ConfiguredInterestReaderPort):
  ReaderSummaryV3PreflightPort | undefined => {
    if (mode !== "prisma") return undefined;
    const client = requirePrismaSummaryClient(prisma);
    const relevanceClient = client as unknown as AssessmentSqlClient;
    const store = new PrismaReaderValueAssessmentStore(relevanceClient);
    const source = new RelevanceReaderSummaryV3PreparationSource(
      new PrepareReaderValueSummaryUseCase(new PrismaReaderValueInventory(relevanceClient),
        new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy()),
        store, new CryptoIdGenerator(), interests), store);
    if (!(jobs instanceof PrismaReaderSummaryJobRepository)) {
      throw new Error("Jev primary preflight requires the Prisma job repository");
    }
    return new PrismaReaderSummaryV3Preflight(client, jobs, source);
  }, inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT,
    READER_SUMMARY_JOB_REPOSITORY, CONFIGURED_INTEREST_READER],
}, {
  provide: READER_SUMMARY_V3_PROMOTION,
  useFactory: (mode: SummaryPersistenceMode, prisma: PrismaSummaryClient | null,
    options: AgentRuntimePromotionPresentationV3BuilderOptions,
    runtime: GrpcAgentRuntimeClient,
    supplementalEvidence: RelevanceReaderSummaryEvidenceSelector):
  ReaderSummaryV3PromotionPort | undefined => {
    if (mode !== "prisma") return undefined;
    const client = requirePrismaSummaryClient(prisma) as unknown as AssessmentSqlClient;
    return new RelevanceReaderSummaryV3Promotion(
      new PrismaReaderValueAssessmentStore(client),
      new AgentRuntimePromotionPresentationV3Builder({ ...options, client: runtime }),
      supplementalEvidence);
  }, inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT,
    SUMMARY_AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_OPTIONS,
    GrpcAgentRuntimeClient, RelevanceReaderSummaryEvidenceSelector],
}];

const requirePrismaSummaryClient = (client: PrismaSummaryClient | null) => {
  if (client === null) throw new Error(
    "Prisma summary client is required when SUMMARY_PERSISTENCE=prisma");
  return client;
};
