import {
  CryptoIdGenerator,
  FixedClock,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";

import { PrismaSummaryConnection } from "../libs/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaReaderSummaryTopicRecommendationDecisionRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision.repository";
import { DecideReaderSummaryTopicRecommendationUseCase } from "../libs/summary/features/decide-reader-summary-topic-recommendation/decide-reader-summary-topic-recommendation.use-case";
import { resolveSummaryPersistenceMode } from "../libs/summary/interfaces/rest/summary-provider-tokens";
import type {
  ReaderSummaryAcceptedTopicApplierPort,
  SummaryEventPublisherPort,
} from "../libs/summary/ports";

const clock = new FixedClock(new Date("2026-07-05T12:00:00.000Z"));
const tenant = tenantId("00000000-0000-7000-8000-000000000451");
const workspace = workspaceId("00000000-0000-7000-8000-000000000452");
const recommendationId = "live-prisma-topic-rec:ai-agent-tooling";
const topicLabel = "AI agent tooling";

async function main(): Promise<void> {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const mode = resolveSummaryPersistenceMode({
    SUMMARY_PERSISTENCE: "prisma",
    DATABASE_URL: databaseUrl,
  });
  assert(mode === "prisma", "SUMMARY_PERSISTENCE=prisma must use Prisma mode");

  await decide(databaseUrl, "accept", "accepted via live Prisma gate");
  await assertDecision(
    databaseUrl,
    "accepted",
    "accepted via live Prisma gate",
  );
  await decide(databaseUrl, "undo", "undo via live Prisma gate");
  await assertDecisionDeleted(databaseUrl);

  await decide(databaseUrl, "reject", "rejected via live Prisma gate");
  await assertDecision(
    databaseUrl,
    "rejected",
    "rejected via live Prisma gate",
  );

  console.log("Summary topic recommendation live Prisma persistence OK");
}

async function decide(
  databaseUrl: string,
  action: "accept" | "reject" | "undo",
  note: string,
): Promise<void> {
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "admin-tool"),
  );
  try {
    const repository =
      new PrismaReaderSummaryTopicRecommendationDecisionRepository(
        connection,
        new CryptoIdGenerator(),
      );
    const result = await new DecideReaderSummaryTopicRecommendationUseCase(
      repository,
      clock,
      new LiveGateAcceptedTopicApplier(),
      new LiveGateSummaryEvents(),
      new CryptoIdGenerator(),
    ).execute({
        tenantId: tenant,
        workspaceId: workspace,
        recommendationId,
        topicLabel,
        action,
        interestIds: action === "accept" ? ["00000000-0000-7000-8000-000000000454"] : undefined,
        decidedBy: "live-prisma-gate",
        note,
      });

    assert(result.ok, `decision action ${action} must succeed`);
  } finally {
    await connection.close();
  }
}

async function assertDecision(
  databaseUrl: string,
  expectedStatus: "accepted" | "rejected",
  expectedNote: string,
): Promise<void> {
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "admin-tool"),
  );
  try {
    const repository =
      new PrismaReaderSummaryTopicRecommendationDecisionRepository(
        connection,
        new CryptoIdGenerator(),
      );
    const decisions = await repository.listByRecommendationIds({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationIds: [recommendationId],
    });
    const snapshot = decisions[0]?.toSnapshot();
    assert(
      decisions.length === 1,
      "decision must survive a new Prisma connection",
    );
    assert(
      snapshot?.status === expectedStatus,
      `decision status must be ${expectedStatus} after reconnect`,
    );
    assert(
      snapshot?.note === expectedNote,
      "decision note must survive reconnect",
    );
    if (expectedStatus === "accepted") {
      assert(
        snapshot?.application?.sourceBindingUpdates[0]?.rollbackToken
          ?.schemaVersion === 1,
        "accepted decision rollback token must survive reconnect",
      );
    }
  } finally {
    await connection.close();
  }
}

async function assertDecisionDeleted(databaseUrl: string): Promise<void> {
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "admin-tool"),
  );
  try {
    const repository =
      new PrismaReaderSummaryTopicRecommendationDecisionRepository(
        connection,
        new CryptoIdGenerator(),
      );
    const decision = await repository.findByRecommendationId({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId,
    });

    assert(decision === null, "decision undo/delete must survive reconnect");
  } finally {
    await connection.close();
  }
}

class LiveGateAcceptedTopicApplier
  implements ReaderSummaryAcceptedTopicApplierPort
{
  async apply() {
    return ok({
      status: "applied",
      changedSourceBindingCount: 1,
      sourceBindingUpdates: [
        {
          sourceBindingId: "00000000-0000-7000-8000-000000000453",
          interestId: "00000000-0000-7000-8000-000000000454",
          providerKey: "reddit",
          changed: true,
          changedConfigPaths: ["promotedTopics"],
          rollbackToken: {
            schemaVersion: 1,
            sourceBindingId: "00000000-0000-7000-8000-000000000453",
          },
        },
      ],
    } as const);
  }

  async revert() {
    return ok({
      status: "reverted",
      revertedSourceBindingCount: 1,
      sourceBindingReversions: [
        {
          sourceBindingId: "00000000-0000-7000-8000-000000000453",
          interestId: "00000000-0000-7000-8000-000000000454",
          providerKey: "reddit",
          reverted: true,
          restoredConfigPaths: ["promotedTopics"],
        },
      ],
    } as const);
  }
}

class LiveGateSummaryEvents implements SummaryEventPublisherPort {
  async publish(): Promise<void> {}
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for live Prisma summary check`);
  }

  return value;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
