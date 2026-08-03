import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { SystemClock } from "@social-monitor/shared-kernel";
import {
  defaultPostgresRuntimePoolConfig,
  runWithTenantDatabaseAccess,
} from "@social-monitor/platform-persistence";
import { Pool } from "pg";

import { PrismaReaderSummaryWeeklyReviewManifest } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-review-manifest";
import { PrismaSummaryConnection } from "../libs/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { AgentRuntimeClientPort } from "../libs/summary/ports/agent-runtime-client.port";
import { loadDotenvIfPresent } from "./lib/env-file";
import {
  loadReaderSummaryWeeklyProductionDbState,
  readerSummaryWeeklyReviewAuthorityFromProductionState,
  resolveCompletedReaderSummaryWeeklyProductionWindow,
  withReaderSummaryWeeklyProductionDatabaseAccess,
  type ReaderSummaryWeeklyProductionScope,
} from "./lib/reader-summary-weekly-production-postgres-contract";
import {
  runReaderSummaryWeeklyReviewProducer,
} from "./lib/reader-summary-weekly-review-producer";

loadDotenvIfPresent(".env");

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const weekStartedOn = requiredOption(process.argv.slice(2), "--week-started-on");
  const databaseUrl = requiredEnv("DATABASE_URL");
  const scope = readScope();
  const window = resolveCompletedReaderSummaryWeeklyProductionWindow(
    weekStartedOn,
    new Date(),
  );
  const pool = new Pool({
    connectionString: databaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "daily-runner"),
  );
  try {
    const manifestStore = new PrismaReaderSummaryWeeklyReviewManifest(connection);
    const result = await runWithTenantDatabaseAccess(scope, () =>
      runReaderSummaryWeeklyReviewProducer({
        authorityLoader: {
          load: async () => withReaderSummaryWeeklyProductionDatabaseAccess(
            pool,
            {
              kind: "tenant",
              tenantId: scope.tenantId,
              workspaceId: scope.workspaceId,
            },
            async (client) => readerSummaryWeeklyReviewAuthorityFromProductionState(
              await loadReaderSummaryWeeklyProductionDbState(client, scope, window),
            ),
          ),
        },
        manifestStore,
        agentRuntime: lazyAgentRuntime(),
      }),
    );
    console.log(
      `outcome=${result.outcome} manifest_id=${result.manifest.manifestId} model_call=${result.modelCallPerformed} write=${result.writePerformed}`,
    );
  } finally {
    await connection.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

const lazyAgentRuntime = (): AgentRuntimeClientPort => {
  let client: GrpcAgentRuntimeClient | undefined;
  const resolve = (): GrpcAgentRuntimeClient => {
    client ??= GrpcAgentRuntimeClient.connect({
      address: requiredEnv("AGENT_RUNTIME_GRPC_ADDRESS"),
      clock: new SystemClock(),
      options: {
        timeoutMs: 600_000,
        serviceToken: process.env.AGENT_RUNTIME_SERVICE_TOKEN,
      },
    });
    return client;
  };
  return Object.freeze({
    runTask: (command: Parameters<AgentRuntimeClientPort["runTask"]>[0]) =>
      resolve().runTask(command),
    checkHealth: (service: Parameters<AgentRuntimeClientPort["checkHealth"]>[0]) =>
      resolve().checkHealth(service),
  });
};

const readScope = (): ReaderSummaryWeeklyProductionScope => {
  const tenantId = requiredEnv("READER_SUMMARY_TENANT_ID");
  const workspaceId = requiredEnv("READER_SUMMARY_WORKSPACE_ID");
  const scopeType = process.env.READER_SUMMARY_SCOPE_TYPE ?? "workspace";
  if (scopeType === "workspace") {
    return Object.freeze({
      tenantId,
      workspaceId,
      scope: Object.freeze({ type: "workspace" as const }),
    });
  }
  if (scopeType === "interest") {
    return Object.freeze({
      tenantId,
      workspaceId,
      scope: Object.freeze({
        type: "interest" as const,
        interestId: requiredEnv("READER_SUMMARY_INTEREST_ID"),
      }),
    });
  }
  throw new Error("READER_SUMMARY_SCOPE_TYPE must be workspace or interest");
};

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const requiredOption = (args: readonly string[], name: string): string => {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required`);
  }
  return value;
};
