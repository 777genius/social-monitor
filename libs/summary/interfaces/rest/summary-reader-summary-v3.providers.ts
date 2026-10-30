import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";
import { ConservativeReaderValueInputBuilder } from "@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder";
import { SourceContentSafetyPolicy } from "@social-monitor/relevance/domain/source-content-safety";
import { READER_VALUE_SCORING_PROVIDER, readerValueScoringProvider } from "@social-monitor/relevance/interfaces/rest/reader-value-scoring-provider-tokens";
import type { ReaderValueScoringProvider } from "@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config";
import { createReaderSummaryV3Preflight, createReaderSummaryV3Promotion } from "../../adapters/composition/reader-summary-v3-composition";
import type { Provider } from "@nestjs/common";
import { CONFIGURED_INTEREST_READER, type ConfiguredInterestReaderPort } from
  "@social-monitor/relevance/ports";
import { RelevanceReaderSummaryEvidenceSelector } from
  "../../adapters/evidence/relevance-reader-summary-evidence.selector";
import { type AgentRuntimePromotionPresentationV3BuilderOptions } from
  "../../adapters/model/agent-runtime-promotion-presentation-v3.builder";
import { PrismaReaderSummaryJobRepository } from
  "../../adapters/persistence/prisma/prisma-reader-summary-job.repository";
import type { PrismaSummaryClient } from
  "../../adapters/persistence/prisma/prisma-summary-client";
import type { AgentRuntimeClientPort, ReaderSummaryJobRepositoryPort,
  ReaderSummaryV3PreflightPort, ReaderSummaryV3PromotionPort } from "../../ports";
import { READER_SUMMARY_JOB_REPOSITORY,
  READER_SUMMARY_V3_PREFLIGHT, READER_SUMMARY_V3_PROMOTION,
  SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT,
  type SummaryPersistenceMode } from "./summary-provider-tokens";
import { SUMMARY_AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_OPTIONS,
  SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT } from "./summary-agent-runtime-provider-tokens";

export const readerSummaryV3Providers: readonly Provider[] = [{
  provide: READER_SUMMARY_V3_PREFLIGHT,
  useFactory: (mode: SummaryPersistenceMode, prisma: PrismaSummaryClient | null,
    jobs: ReaderSummaryJobRepositoryPort, interests: ConfiguredInterestReaderPort,
    scoringProvider: ReaderValueScoringProvider):
  ReaderSummaryV3PreflightPort | undefined => {
    if (mode !== "prisma") return undefined;
    if (!(jobs instanceof PrismaReaderSummaryJobRepository)) {
      throw new Error("Jev primary preflight requires the Prisma job repository");
    }
    return createReaderSummaryV3Preflight(requirePrismaSummaryClient(prisma), jobs, interests, new SystemClock(), new CryptoIdGenerator(),
      new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy(), scoringProvider));
  }, inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT,
    READER_SUMMARY_JOB_REPOSITORY, CONFIGURED_INTEREST_READER, READER_VALUE_SCORING_PROVIDER],
}, {
  provide: READER_SUMMARY_V3_PROMOTION,
  useFactory: (mode: SummaryPersistenceMode, prisma: PrismaSummaryClient | null,
    options: AgentRuntimePromotionPresentationV3BuilderOptions,
    runtime: AgentRuntimeClientPort,
    supplementalEvidence: RelevanceReaderSummaryEvidenceSelector):
  ReaderSummaryV3PromotionPort | undefined => {
    if (mode !== "prisma") return undefined;
    return createReaderSummaryV3Promotion(requirePrismaSummaryClient(prisma), options, runtime, supplementalEvidence);
  }, inject: [SUMMARY_PERSISTENCE_MODE, SUMMARY_PRISMA_CLIENT,
    SUMMARY_AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_OPTIONS,
    SUMMARY_READER_SUMMARY_AGENT_RUNTIME_CLIENT, RelevanceReaderSummaryEvidenceSelector],
}, readerValueScoringProvider];

const requirePrismaSummaryClient = (client: PrismaSummaryClient | null) => {
  if (client === null) throw new Error(
    "Prisma summary client is required when SUMMARY_PERSISTENCE=prisma");
  return client;
};
