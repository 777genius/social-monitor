import type { ReaderSummaryExecutionLeasePolicy } from "../../features/execute-reader-summary-job/reader-summary-execution-lease.policy";
import { PrepareReaderValueSummaryUseCase } from
  "@social-monitor/relevance/application/use-cases/prepare-reader-value-summary.use-case";
import type { ReaderValueInputBuilder } from
  "@social-monitor/relevance/application/contracts/reader-value-inventory";
import type { AssessmentSqlClient } from
  "@social-monitor/relevance/infrastructure/reader-value/assessment-sql";
import { PrismaReaderValueAssessmentStore } from
  "@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store";
import { PrismaReaderValueInventory } from
  "@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-inventory";
import { PrismaReaderValueWorkspaceInterests } from
  "@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-workspace-interests";
import { type ConfiguredInterestReaderPort } from
  "@social-monitor/relevance/ports";
import type { Clock, IdGenerator } from "@social-monitor/shared-kernel";
import { RelevanceReaderSummaryV3PreparationSource } from
  "../evidence/relevance-reader-summary-v3-preparation-source";
import type { RelevanceReaderSummaryEvidenceSelector } from
  "../evidence/relevance-reader-summary-evidence.selector";
import { RelevanceReaderSummaryV3Promotion } from
  "../evidence/relevance-reader-summary-v3-promotion";
import { PresentationRuntimeGuardedPromotion } from
  "../evidence/relevance-reader-summary-v3-presentation-runtime-guard";
import { AgentRuntimePromotionPresentationV3Builder,
  type AgentRuntimePromotionPresentationV3BuilderOptions } from
  "../model/agent-runtime-promotion-presentation-v3.builder";
import type { GrpcAgentRuntimeClient } from "../model/grpc-agent-runtime-client";
import { PrismaReaderSummaryJobRepository } from
  "../persistence/prisma/prisma-reader-summary-job.repository";
import type { PrismaSummaryClient } from
  "../persistence/prisma/prisma-summary-client";
import { PrismaReaderSummaryV3Preflight } from
  "../persistence/prisma/prisma-reader-summary-v3-preflight";
import type { ReaderSummaryV3PreflightPort,
  ReaderSummaryV3PromotionPort } from "../../ports";

export const createReaderSummaryV3Preflight = (client: PrismaSummaryClient, jobs: PrismaReaderSummaryJobRepository, interests: ConfiguredInterestReaderPort, clock: Clock, ids: IdGenerator, builder: ReaderValueInputBuilder, lease?: ReaderSummaryExecutionLeasePolicy): ReaderSummaryV3PreflightPort => {
    const relevanceClient = client as unknown as AssessmentSqlClient;
    const store = new PrismaReaderValueAssessmentStore(relevanceClient);
    const source = new RelevanceReaderSummaryV3PreparationSource(
      new PrepareReaderValueSummaryUseCase(new PrismaReaderValueInventory(relevanceClient),
        builder,
        store, ids, interests, clock), store,
      new PrismaReaderValueWorkspaceInterests(relevanceClient));
    if (!(jobs instanceof PrismaReaderSummaryJobRepository)) {
      throw new Error("Jev primary preflight requires the Prisma job repository");
    }
    return new PrismaReaderSummaryV3Preflight(client, jobs, source, lease);
};

export const createReaderSummaryV3Promotion = (prisma: PrismaSummaryClient, options: AgentRuntimePromotionPresentationV3BuilderOptions, runtime: GrpcAgentRuntimeClient, supplementalEvidence: RelevanceReaderSummaryEvidenceSelector): ReaderSummaryV3PromotionPort => {
    const client = prisma as unknown as AssessmentSqlClient;
    const assessments = new PrismaReaderValueAssessmentStore(client);
    return new PresentationRuntimeGuardedPromotion(
      new AgentRuntimePromotionPresentationV3Builder({ ...options, client: runtime }),
      (presentation) => new RelevanceReaderSummaryV3Promotion(
        assessments, presentation, supplementalEvidence));
};
