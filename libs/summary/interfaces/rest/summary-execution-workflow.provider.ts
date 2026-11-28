import type { FactoryProvider } from "@nestjs/common";

import { InMemorySummaryEventPublisher } from "../../adapters/messaging/in-memory-summary-event-publisher";
import { InMemorySummaryArtifactRepository } from "../../adapters/persistence/in-memory-summary-artifact.repository";
import { InMemorySummaryExecutionWorkflow } from "../../adapters/persistence/in-memory-summary-execution-workflow";
import { InMemorySummaryJobRepository } from "../../adapters/persistence/in-memory-summary-job.repository";
import type { PrismaSummaryClient } from "../../adapters/persistence/prisma/prisma-summary-client";
import { PrismaSummaryExecutionWorkflow } from "../../adapters/persistence/prisma/prisma-summary-execution-workflow";
import type { SummaryExecutionWorkflowPort } from "../../ports";
import {
  SUMMARY_EXECUTION_WORKFLOW,
  SUMMARY_PERSISTENCE_MODE,
  SUMMARY_PRISMA_CLIENT,
  type SummaryPersistenceMode,
} from "./summary-provider-tokens";

export const summaryExecutionWorkflowProvider: FactoryProvider<SummaryExecutionWorkflowPort> = {
  provide: SUMMARY_EXECUTION_WORKFLOW,
  useFactory: (
    mode: SummaryPersistenceMode,
    prisma: PrismaSummaryClient | null,
    jobs: InMemorySummaryJobRepository,
    artifacts: InMemorySummaryArtifactRepository,
    events: InMemorySummaryEventPublisher,
  ): SummaryExecutionWorkflowPort => {
    if (mode === "prisma") {
      if (prisma === null) {
        throw new Error("Prisma summary client is required when SUMMARY_PERSISTENCE=prisma");
      }
      return new PrismaSummaryExecutionWorkflow(prisma);
    }
    return new InMemorySummaryExecutionWorkflow(jobs, artifacts, events);
  },
  inject: [
    SUMMARY_PERSISTENCE_MODE,
    SUMMARY_PRISMA_CLIENT,
    InMemorySummaryJobRepository,
    InMemorySummaryArtifactRepository,
    InMemorySummaryEventPublisher,
  ],
};
