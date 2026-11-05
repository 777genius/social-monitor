import { spawnSync } from "node:child_process";
import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import { InMemoryConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/in-memory-conversation-unit.repository";
import { PrismaConversationUnitRepository } from "@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository";
import type { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryFeedProjectionAdapter } from "../../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter";
import { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { InMemoryScanLeaseAdapter } from "../../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter";
import { InMemoryScanAttemptRepository } from "../../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository";
import { InMemoryScanCursorRepository } from "../../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository";
import { InMemorySourceItemRepository } from "../../libs/ingestion/adapters/persistence/in-memory-source-item.repository";
import { PrismaScanAttemptRepository } from "../../libs/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanCursorRepository } from "../../libs/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository";
import { PrismaSourceItemRepository } from "../../libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import { InMemoryScanFailureQueueAdapter } from "../../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter";
import { PrismaScanFailureQueueAdapter } from "../../libs/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter";
import { PrismaScanLeaseAdapter } from "../../libs/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import type { LivePersistenceConfig, LivePersistenceBundle} from "./live-multi-provider-summary-support";
import { assert, sameDatabaseUrl, SequenceIdGenerator, RandomUuidGenerator } from "./live-multi-provider-summary-support";
import { readOptionalEnv, readBooleanEnv, sampledAt, xFallbackFreshnessMinutes } from "./live-multi-provider-summary-config";

export const readLivePersistenceConfig = (): LivePersistenceConfig => {
  const mode =
    readOptionalEnv("LIVE_MULTI_PROVIDER_PERSISTENCE") ?? "in-memory";
  if (mode === "in-memory") {
    return { mode };
  }

  if (mode !== "prisma") {
    throw new Error(
      'LIVE_MULTI_PROVIDER_PERSISTENCE must be "in-memory" or "prisma"',
    );
  }

  assert(
    readBooleanEnv("LIVE_MULTI_PROVIDER_E2E_ALLOW_PERSISTENCE", false),
    "LIVE_MULTI_PROVIDER_PERSISTENCE=prisma requires LIVE_MULTI_PROVIDER_E2E_ALLOW_PERSISTENCE=true",
  );

  const rawDatabaseUrl = readOptionalEnv(
    "LIVE_MULTI_PROVIDER_E2E_DATABASE_URL",
  );
  assert(
    rawDatabaseUrl !== undefined,
    "LIVE_MULTI_PROVIDER_PERSISTENCE=prisma requires LIVE_MULTI_PROVIDER_E2E_DATABASE_URL",
  );

  const schema = readOptionalEnv("LIVE_MULTI_PROVIDER_E2E_SCHEMA");
  assert(
    schema === undefined,
    [
      "LIVE_MULTI_PROVIDER_E2E_SCHEMA is not supported with the current PrismaPg runtime.",
      "Use a separate LIVE_MULTI_PROVIDER_E2E_DATABASE_URL for live E2E isolation.",
    ].join(" "),
  );

  const productionDatabaseUrl = readOptionalEnv("DATABASE_URL");
  if (productionDatabaseUrl !== undefined) {
    assert(
      !sameDatabaseUrl(rawDatabaseUrl, productionDatabaseUrl),
      "LIVE_MULTI_PROVIDER_E2E_DATABASE_URL must point at a separate test database, not DATABASE_URL.",
    );
  }

  const feedFreshnessStartedAt = new Date(
    sampledAt.getTime() - xFallbackFreshnessMinutes * 60_000,
  );

  return {
    mode,
    rawDatabaseUrl,
    databaseUrl: rawDatabaseUrl,
    migrate: readBooleanEnv("LIVE_MULTI_PROVIDER_E2E_MIGRATE", true),
    feedFreshnessStartedAt,
  };
};

export const createLivePersistence = async (params: {
  readonly config: LivePersistenceConfig;
  readonly metrics: InMemoryMetricsRecorder;
}): Promise<LivePersistenceBundle> => {
  if (params.config.mode === "in-memory") {
    const feedItems = new InMemoryFeedItemReadRepository();
    const conversationUnits = new InMemoryConversationUnitRepository();

    return {
      mode: "in-memory",
      feedItems,
      conversationUnits,
      sourceItems: new InMemorySourceItemRepository(),
      feedProjection: new InMemoryFeedProjectionAdapter(feedItems),
      scanAttempts: new InMemoryScanAttemptRepository(),
      scanCursors: new InMemoryScanCursorRepository(),
      scanFailures: new InMemoryScanFailureQueueAdapter(params.metrics),
      scanLeases: new InMemoryScanLeaseAdapter(),
      sourceItemIds: new SequenceIdGenerator("live-multi-provider-source-item"),
      conversationUnitIds: new SequenceIdGenerator(
        "live-multi-provider-conversation-unit",
      ),
      async close() {},
    };
  }

  await prepareLiveE2eDatabase(params.config);

  process.env.DATABASE_URL = params.config.databaseUrl;
  const connection = await PrismaIngestionWorkerConnection.createForProcess(params.config.databaseUrl, "admin-tool");
  const ids = new RandomUuidGenerator();
  const conversationUnits = new PrismaConversationUnitRepository(
    connection,
    ids,
  );

  return {
    mode: "prisma",
    feedItems: new PrismaFeedItemReadRepository(connection),
    conversationUnits,
    sourceItems: new PrismaSourceItemRepository(connection),
    feedProjection: new PrismaFeedProjectionAdapter(connection, ids),
    scanAttempts: new PrismaScanAttemptRepository(connection),
    scanCursors: new PrismaScanCursorRepository(connection, ids),
    scanFailures: new PrismaScanFailureQueueAdapter(
      connection,
      params.metrics,
      ids,
    ),
    scanLeases: new PrismaScanLeaseAdapter(connection, ids),
    sourceItemIds: ids,
    conversationUnitIds: ids,
    feedObservedAfter: params.config.feedFreshnessStartedAt,
    close: () => connection.close(),
  };
};

const prepareLiveE2eDatabase = async (
  config: Extract<LivePersistenceConfig, { readonly mode: "prisma" }>,
): Promise<void> => {
  if (!config.migrate) {
    return;
  }

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: config.databaseUrl,
      },
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error("Live multi-provider E2E database migration failed");
  }
};
