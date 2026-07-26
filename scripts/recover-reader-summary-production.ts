import {
  defaultPostgresRuntimePoolConfig,
  runWithTenantDatabaseAccess,
} from "@social-monitor/platform-persistence";
import { PrismaFeedConnection } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import {
  AgentRuntimeReaderSummaryModelAdapter,
} from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter";
import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { PrismaReaderSummaryGitHubProjectionReader } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-github-projection.reader";
import { PrismaReaderSummaryProductionRecoveryAuthority } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority";
import { PrismaReaderSummaryRecoveryFinalization } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-recovery-finalization";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import {
  CryptoIdGenerator,
  SystemClock,
} from "@social-monitor/shared-kernel";

import { loadDotenvIfPresent } from "./lib/env-file";
import { READER_SUMMARY_PRODUCTION_RUNTIME_POLICY } from "./lib/reader-summary-production-runtime-policy";
import {
  createProductionRecoveryDayExecutor,
  runReaderSummaryProductionRecovery,
} from "./lib/reader-summary-production-recovery-cli";

loadDotenvIfPresent(".env");

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Reader summary production recovery failed: ${message}`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  if (!process.argv.slice(2).includes("--apply")) {
    throw new Error("Pass --apply to run Jul23/Jul24 production recovery");
  }
  const databaseUrl = requiredEnv("DATABASE_URL");
  const agentRuntimeAddress = requiredEnv("AGENT_RUNTIME_GRPC_ADDRESS");
  const scope = {
    tenantId: requiredEnv("READER_SUMMARY_PRODUCTION_RECOVERY_TENANT_ID"),
    workspaceId: requiredEnv("READER_SUMMARY_PRODUCTION_RECOVERY_WORKSPACE_ID"),
  };
  const clock = new SystemClock();
  const runtimePoolConfig = defaultPostgresRuntimePoolConfig(
    databaseUrl,
    "admin-tool",
  );
  const summaryConnection =
    await PrismaSummaryConnection.create(runtimePoolConfig);
  const feedConnection = await PrismaFeedConnection.create(runtimePoolConfig);
  const agentRuntimeClient = GrpcAgentRuntimeClient.connect({
    address: agentRuntimeAddress,
    clock,
    options: {
      timeoutMs: READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs,
      serviceToken: readEnv("AGENT_RUNTIME_SERVICE_TOKEN"),
    },
  });

  try {
    const result = await runWithTenantDatabaseAccess(scope, () =>
      runReaderSummaryProductionRecovery({
        apply: true,
        authority: new PrismaReaderSummaryProductionRecoveryAuthority(
          summaryConnection,
        ),
        executeDay: createProductionRecoveryDayExecutor({
          model: new AgentRuntimeReaderSummaryModelAdapter({
            client: agentRuntimeClient,
            agentProvider: "codex",
            model: "gpt-5.5",
            reasoningEffort: "xhigh",
            timeoutMs:
              READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs,
          }),
          finalization: new PrismaReaderSummaryRecoveryFinalization(
            summaryConnection,
          ),
          feedItems: new PrismaFeedItemReadRepository(feedConnection),
          githubProjectionReader: new PrismaReaderSummaryGitHubProjectionReader(
            summaryConnection,
          ),
          ids: new CryptoIdGenerator(),
          clock,
        }),
      }),
    );
    console.log(`outcome=${result.outcome}`);
    console.log(`recovery=${result.plan.recoveryId}`);
    for (const day of result.dayResults) {
      console.log(
        [
          `date=${day.requestedUtcDate}`,
          `outcome=${day.outcome}`,
          day.readerSummaryJobId === undefined
            ? undefined
            : `job=${day.readerSummaryJobId}`,
          day.readerSummaryId === undefined
            ? undefined
            : `artifact=${day.readerSummaryId}`,
        ]
          .filter((part): part is string => part !== undefined)
          .join(" "),
      );
    }
  } finally {
    await Promise.all([summaryConnection.close(), feedConnection.close()]);
  }
}

function requiredEnv(name: string): string {
  const value = readEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}
