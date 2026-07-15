import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  CryptoIdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import { Pool } from "pg";
import request from "supertest";
import type { Response } from "supertest";

import { AppModule } from "../apps/api-gateway/src/app.module";
import { PrismaReaderSummaryTopicRecommendationDecisionRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-topic-recommendation-decision.repository";
import { PrismaSummaryConnection } from "../libs/summary/adapters/persistence/prisma/prisma-summary-connection";

const tenant = tenantId("00000000-0000-7000-8000-000000000551");
const workspace = workspaceId("00000000-0000-7000-8000-000000000552");
const topicLabel = "AI agent observability";

type TopicRecommendationDecisionResponse = {
  readonly decisionStatus: "pending" | "accepted" | "rejected";
  readonly decision?: {
    readonly recommendationId: string;
    readonly topicLabel: string;
    readonly status: "accepted" | "rejected";
    readonly decidedBy: string;
    readonly note?: string;
  };
  readonly application: {
    readonly status:
      | "not_requested"
      | "applied"
      | "already_applied"
      | "no_supported_bindings";
    readonly changedSourceBindingCount: number;
    readonly sourceBindingUpdates: readonly {
      readonly sourceBindingId: string;
      readonly interestId: string;
      readonly providerKey: string;
      readonly changed: boolean;
      readonly changedConfigPaths: readonly string[];
    }[];
  };
  readonly reversion: {
    readonly status:
      | "not_requested"
      | "reverted"
      | "partially_reverted"
      | "nothing_to_revert"
      | "blocked";
    readonly revertedSourceBindingCount: number;
  };
};

async function main(): Promise<void> {
  const databaseUrl = requiredEnv("DATABASE_URL");
  configureLivePrismaRuntime(databaseUrl);

  const runId = Date.now().toString(36);
  const recommendationId = `rest-prisma-topic-rec:${runId}`;
  const pool = new Pool({ connectionString: databaseUrl });

  await seedWorkspaceScope(pool);
  await seedSourceCatalog(pool);

  const app = await createApp();
  try {
    const interestId = await createInterest(app, runId);
    const sourceBindingId = await bindRedditSource(app, interestId, runId);

    await acceptRecommendation({
      app,
      recommendationId,
      interestId,
      sourceBindingId,
    });
    await assertPersistedDecision(databaseUrl, recommendationId, "accepted");
    await assertSourceBindingHasAcceptedTopic(pool, sourceBindingId);

    await undoRecommendation(app, recommendationId);
    await assertDecisionDeleted(databaseUrl, recommendationId);
    await assertSourceBindingReverted(pool, sourceBindingId);

    await rejectRecommendation(app, recommendationId);
    await assertPersistedDecision(databaseUrl, recommendationId, "rejected");

    console.log("Summary topic recommendation REST Prisma e2e OK");
  } finally {
    await app.close();
    await pool.end();
  }
}

function configureLivePrismaRuntime(databaseUrl: string): void {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SOCIAL_MONITOR_RUNTIME_PROFILE = "local-dev";
  process.env.SUMMARY_PERSISTENCE = "prisma";
  process.env.MONITORING_PERSISTENCE = "prisma";
  process.env.MONITORING_SCAN_QUEUE = "in-memory";
  process.env.SUMMARY_MODEL_PROVIDER = "deterministic";
  process.env.READER_SUMMARY_MODEL_PROVIDER = "deterministic";
  process.env.READER_SUMMARY_TOPIC_LABELER = "deterministic";
  process.env.SOURCE_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
    "base64",
  );
  process.env.SOURCE_CONFIG_ENCRYPTION_KEY_ID = "rest-prisma-live-test";
  process.env.SOURCE_CREDENTIAL_SECRET_ENCRYPTION_KEY = Buffer.alloc(
    32,
    7,
  ).toString("base64");
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return app;
}

async function seedSourceCatalog(pool: Pool): Promise<void> {
  const sourceId = "00000000-0000-7000-8000-000000000553";
  const profileId = "00000000-0000-7000-8000-000000000554";

  await pool.query(
    `
      insert into source_catalog_entries
        (id, provider_key, display_name, acquisition_mode, readiness, updated_at)
      values ($1, 'reddit', 'Reddit', 'api', 'ready', now())
      on conflict (provider_key) do update set
        display_name = excluded.display_name,
        acquisition_mode = excluded.acquisition_mode,
        readiness = excluded.readiness,
        updated_at = now()
    `,
    [sourceId],
  );
  await pool.query(
    `
      insert into capability_profiles (id, source_id, version, config)
      values ($1, $2, 1, '{}'::jsonb)
      on conflict (source_id, version) do update set
        config = excluded.config
    `,
    [profileId, sourceId],
  );
}

async function seedWorkspaceScope(pool: Pool): Promise<void> {
  await pool.query(
    `
      insert into tenants (id, slug, name, updated_at)
      values ($1, 'summary-topic-rec-rest-prisma', 'Summary Topic REST Prisma', now())
      on conflict (id) do update set
        name = excluded.name,
        updated_at = now()
    `,
    [tenant],
  );
  await pool.query(
    `
      insert into workspaces (id, tenant_id, slug, name, updated_at)
      values (
        $1,
        $2,
        'summary-topic-rec-rest-prisma',
        'Summary Topic REST Prisma',
        now()
      )
      on conflict (id) do update set
        name = excluded.name,
        updated_at = now()
    `,
    [workspace, tenant],
  );
}

async function createInterest(
  app: INestApplication,
  runId: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/interests")
    .set("x-tenant-id", tenant)
    .set("x-workspace-id", workspace)
    .set("x-workspace-role", "admin")
    .set("x-request-id", `topic-rec-rest-prisma-interest-${runId}`)
    .set("idempotency-key", `topic-rec-rest-prisma-interest-${runId}`)
    .send({
      name: `Topic Recommendation REST Prisma ${runId}`,
      query: "AI agent observability",
    });

  assertHttpStatus(response, 201, "create interest");

  return response.body.interestId as string;
}

async function bindRedditSource(
  app: INestApplication,
  interestId: string,
  runId: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post(`/interests/${interestId}/source-bindings`)
    .set("x-tenant-id", tenant)
    .set("x-workspace-id", workspace)
    .set("x-workspace-role", "admin")
    .set("x-request-id", `topic-rec-rest-prisma-bind-${runId}`)
    .set("idempotency-key", `topic-rec-rest-prisma-bind-${runId}`)
    .send({
      providerKey: "reddit",
      config: {
        mode: "search",
        query: "AI agent monitoring",
      },
    });

  assertHttpStatus(response, 201, "bind reddit source");

  return response.body.sourceBindingId as string;
}

async function acceptRecommendation(params: {
  readonly app: INestApplication;
  readonly recommendationId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
}): Promise<void> {
  const response = await request(params.app.getHttpServer())
    .post(
      `/reader-summary-topic-recommendations/${params.recommendationId}/decision`,
    )
    .set("x-tenant-id", tenant)
    .set("x-workspace-id", workspace)
    .set("x-workspace-role", "admin")
    .set("x-user-id", "topic-rec-rest-prisma-admin")
    .send({
      action: "accept",
      topicLabel,
      interestIds: [params.interestId],
      providerKeys: ["reddit"],
      note: "accepted through REST Prisma e2e",
    });

  assertHttpStatus(response, 201, "accept topic recommendation");
  const body = response.body as TopicRecommendationDecisionResponse;
  const decision = body.decision;
  assert(body.decisionStatus === "accepted", "accept response status");
  assert(decision !== undefined, "accept must return decision");
  assert(
    decision.recommendationId === params.recommendationId,
    "accept recommendation id",
  );
  assert(decision.topicLabel === topicLabel, "accept topic label");
  assert(decision.status === "accepted", "accept decision status");
  assert(
    decision.decidedBy === "topic-rec-rest-prisma-admin",
    "accept actor",
  );
  assert(decision.note === "accepted through REST Prisma e2e", "accept note");
  assert(body.application.status === "applied", "accept application status");
  assert(
    body.application.changedSourceBindingCount === 1,
    "accept changed source binding count",
  );
  const update = body.application.sourceBindingUpdates[0];
  assert(update !== undefined, "accept must return source binding update");
  assert(update.sourceBindingId === params.sourceBindingId, "accept binding id");
  assert(update.interestId === params.interestId, "accept interest id");
  assert(update.providerKey === "reddit", "accept provider");
  assert(update.changed === true, "accept changed flag");
  assert(
    sameStringSet(update.changedConfigPaths, ["promotedTopics", "scanPasses"]),
    "accept changed config paths",
  );
}

async function undoRecommendation(
  app: INestApplication,
  recommendationId: string,
): Promise<void> {
  const response = await request(app.getHttpServer())
    .post(`/reader-summary-topic-recommendations/${recommendationId}/decision`)
    .set("x-tenant-id", tenant)
    .set("x-workspace-id", workspace)
    .set("x-workspace-role", "admin")
    .set("x-user-id", "topic-rec-rest-prisma-admin")
    .send({
      action: "undo",
      topicLabel,
      note: "undo through REST Prisma e2e",
    });

  assertHttpStatus(response, 201, "undo topic recommendation");
  const body = response.body as TopicRecommendationDecisionResponse;
  assert(body.decisionStatus === "pending", "undo response status");
  assert(body.decision === undefined, "undo must not return decision");
  assert(body.application.status === "not_requested", "undo application status");
  assert(
    body.application.changedSourceBindingCount === 0,
    "undo application change count",
  );
  assert(body.reversion.status === "reverted", "undo reversion status");
  assert(
    body.reversion.revertedSourceBindingCount === 1,
    "undo reverted binding count",
  );
}

async function rejectRecommendation(
  app: INestApplication,
  recommendationId: string,
): Promise<void> {
  const response = await request(app.getHttpServer())
    .post(`/reader-summary-topic-recommendations/${recommendationId}/decision`)
    .set("x-tenant-id", tenant)
    .set("x-workspace-id", workspace)
    .set("x-workspace-role", "admin")
    .set("x-user-id", "topic-rec-rest-prisma-admin")
    .send({
      action: "reject",
      topicLabel,
      note: "rejected through REST Prisma e2e",
    });

  assertHttpStatus(response, 201, "reject topic recommendation");
  const body = response.body as TopicRecommendationDecisionResponse;
  const decision = body.decision;
  assert(body.decisionStatus === "rejected", "reject response status");
  assert(decision !== undefined, "reject must return decision");
  assert(decision.recommendationId === recommendationId, "reject id");
  assert(decision.topicLabel === topicLabel, "reject topic label");
  assert(decision.status === "rejected", "reject decision status");
  assert(decision.note === "rejected through REST Prisma e2e", "reject note");
  assert(body.application.status === "not_requested", "reject application status");
  assert(
    body.application.changedSourceBindingCount === 0,
    "reject application change count",
  );
}

async function assertPersistedDecision(
  databaseUrl: string,
  recommendationId: string,
  status: "accepted" | "rejected",
): Promise<void> {
  const connection = new PrismaSummaryConnection(databaseUrl);
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
    const snapshot = decision?.toSnapshot();

    assert(snapshot !== undefined, "decision must persist in Prisma");
    assert(snapshot.status === status, `decision status must be ${status}`);
    if (status === "accepted") {
      assert(
        snapshot.application?.sourceBindingUpdates[0]?.rollbackToken
          ?.schemaVersion === 1,
        "accepted decision rollback token must persist in Prisma",
      );
    }
  } finally {
    await connection.close();
  }
}

async function assertDecisionDeleted(
  databaseUrl: string,
  recommendationId: string,
): Promise<void> {
  const connection = new PrismaSummaryConnection(databaseUrl);
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

    assert(decision === null, "undo must delete persisted decision");
  } finally {
    await connection.close();
  }
}

async function assertSourceBindingHasAcceptedTopic(
  pool: Pool,
  sourceBindingId: string,
): Promise<void> {
  const config = await readSourceBindingConfig(pool, sourceBindingId);
  const promotedTopics = readStringArray(config.promotedTopics);
  const scanPasses = Array.isArray(config.scanPasses) ? config.scanPasses : [];

  assert(
    promotedTopics.includes(topicLabel),
    "source binding config must include accepted promoted topic",
  );
  assert(
    scanPasses.some(
      (pass) =>
        isRecord(pass) &&
        pass.mode === "search" &&
        pass.query === topicLabel,
    ),
    "source binding config must include accepted Reddit scan pass",
  );
}

async function assertSourceBindingReverted(
  pool: Pool,
  sourceBindingId: string,
): Promise<void> {
  const config = await readSourceBindingConfig(pool, sourceBindingId);

  assert(
    !readStringArray(config.promotedTopics).includes(topicLabel),
    "undo must remove accepted promoted topic",
  );
  assert(
    !readRecordArray(config.scanPasses).some(
      (pass) => pass.mode === "search" && pass.query === topicLabel,
    ),
    "undo must remove accepted Reddit scan pass",
  );
}

async function readSourceBindingConfig(
  pool: Pool,
  sourceBindingId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const result = await pool.query(
    "select config from source_bindings where id = $1",
    [sourceBindingId],
  );
  const config = result.rows[0]?.config;

  assert(isRecord(config), "source binding config must exist");

  return config;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readRecordArray(
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    right.every((value) => left.includes(value))
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for REST Prisma summary check`);
  }

  return value;
}

function assertHttpStatus(
  response: Response,
  expectedStatus: number,
  label: string,
): void {
  assert(
    response.status === expectedStatus,
    `${label} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(response.body)}`,
  );
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
