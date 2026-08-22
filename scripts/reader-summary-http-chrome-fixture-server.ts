import { emitReaderSummaryFixtureStage } from
  "./lib/reader-summary-fixture-stage-reporter";

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";

import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { MetricsRuntimeModule } from
  "@social-monitor/platform-metrics/nest/metrics-runtime.module";

import {
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import {
  type ApprovedSameStoryRelation,
  ReaderSummaryJob,
  type StoryCluster,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { enabledReaderSummaryPromotionControl } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { SummaryRestModule } from "@social-monitor/summary/interfaces/rest/summary-rest.module";
import {
  READER_SUMMARY_ARTIFACT_REPOSITORY,
  READER_SUMMARY_JOB_REPOSITORY,
  READER_SUMMARY_POLICY_REPOSITORY,
  READER_SUMMARY_PUBLICATION,
} from "@social-monitor/summary/interfaces/rest/summary-provider-tokens";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryPolicyRepositoryPort,
  ReaderSummaryPublicationPort,
} from "@social-monitor/summary/ports";

import { DomainErrorFilter } from "../apps/api-gateway/src/domain-error.filter";
import { createReaderSummaryFixtureLifecycle } from
  "./lib/reader-summary-fixture-resource-lifecycle";

const fixtureTenantId = tenantId("00000000-0000-7000-8000-000000000701");
const fixtureWorkspaceId = workspaceId("00000000-0000-7000-8000-000000000702");
const periodStart = new Date("2026-08-14T00:00:00.000Z");
const periodEnd = new Date("2026-08-15T00:00:00.000Z");
const cutoff = new Date("2026-08-15T01:00:00.000Z");
const fixtureJobId = "00000000-0000-7000-8000-000000000703";
const fixtureArtifactId = "00000000-0000-7000-8000-000000000704";
const repositoryRoot = process.cwd();
let fixtureApp: INestApplication | undefined;
let fixtureModule: TestingModule | undefined;
let fixtureDatabaseServer: PGLiteSocketServer | undefined;
let fixtureDatabase: PGlite | undefined;
const fixtureLifecycle = createReaderSummaryFixtureLifecycle({
  application: () => fixtureApp,
  testingModule: () => fixtureModule,
  databaseServer: () => fixtureDatabaseServer,
  database: () => fixtureDatabase,
  resourceCloseTimeoutMs: 5_000,
  report: (message) => { process.stderr.write(message); },
  exit: (code) => { process.exit(code); },
});

const evidence = [
  item("cursor-hn", "hacker-news", "Cursor agent update reaches HN", {
    provider: "hacker_news", points: 50,
  }, "story", "story:cursor", "https://news.ycombinator.com/item?id=cursor50"),
  item("cursor-x-official", "x-twitter", "Cursor official same-story note", {
    provider: "x", likes: 15, reposts: 10, weightedScore: 35,
  }, "original_post", "story:cursor-official", "https://x.com/cursor/status/fixture", true),
  item("spacex-github-24", "github-repo-radar", "SpaceX repository accelerates", {
    provider: "github_radar", snapshotKind: "repository_growth",
    windowStartedAt: new Date("2026-08-13T12:00:00.000Z"),
    windowEndedAt: new Date("2026-08-14T12:00:00.000Z"), starsDelta: 50, forksDelta: 0,
  }, "repository", "story:spacex", "https://github.com/spacex/fixture"),
  item("anthropic-watermark-x", "x-twitter", "Anthropic publishes official watermark guidance", {
    provider: "x", likes: 30, reposts: 20, weightedScore: 70,
  }, "original_post", "story:anthropic-watermark", "https://x.com/anthropic/status/watermark", true),
  item("github-48-top", "github-repo-radar", "GitHub 48 hour exact top", {
    provider: "github_radar", snapshotKind: "repository_growth",
    windowStartedAt: new Date("2026-08-12T12:00:00.000Z"),
    windowEndedAt: new Date("2026-08-14T12:00:00.000Z"), starsDelta: 0, forksDelta: 100,
  }, "repository", "story:github-48-top", "https://github.com/fixture/top-48"),
  item("reddit-top", "reddit", "Reddit exact top threshold", {
    provider: "reddit", score: 50, upvoteRatio: 0.60,
  }, "original_post", "story:reddit-top", "https://reddit.com/r/fixture/comments/top/story"),
  item("reddit-additional", "reddit", "Reddit exact additional threshold", {
    provider: "reddit", score: 25, upvoteRatio: 0.55,
  }, "original_post", "story:reddit-additional", "https://reddit.com/r/fixture/comments/additional/story"),
  item("hn-additional", "hacker-news", "HN exact additional threshold", {
    provider: "hacker_news", points: 25,
  }, "story", "story:hn-additional", "https://news.ycombinator.com/item?id=hn25"),
  item("x-additional", "x-twitter", "X exact additional threshold", {
    provider: "x", likes: 15, reposts: 10, weightedScore: 35,
  }, "original_post", "story:x-additional", "https://x.com/fixture/status/x35"),
  item("github-24-additional", "github-repo-radar", "GitHub 24 hour exact additional", {
    provider: "github_radar", snapshotKind: "repository_growth",
    windowStartedAt: new Date("2026-08-13T12:00:00.000Z"),
    windowEndedAt: new Date("2026-08-14T12:00:00.000Z"), starsDelta: 25, forksDelta: 0,
  }, "repository", "story:github-24-additional", "https://github.com/fixture/additional-24"),
  item("github-48-additional", "github-repo-radar", "GitHub 48 hour exact additional", {
    provider: "github_radar", snapshotKind: "repository_growth",
    windowStartedAt: new Date("2026-08-12T12:00:00.000Z"),
    windowEndedAt: new Date("2026-08-14T12:00:00.000Z"), starsDelta: 0, forksDelta: 50,
  }, "repository", "story:github-48-additional", "https://github.com/fixture/additional-48"),
  item("duplicate-additional", "hacker-news", "Duplicate Additional must lose to Top", {
    provider: "hacker_news", points: 25,
  }, "story", "story:spacex", "https://news.ycombinator.com/item?id=duplicate"),
  item("related-topic-eligible", "reddit", "Eligible related topic must stay absent", {
    provider: "reddit", score: 25, upvoteRatio: 0.55,
  }, "original_post", "related:eligible", "https://reddit.com/r/fixture/comments/related/story"),
  item("reddit-seven-comments", "reddit", "Reddit 7 score 5 comments absent", {
    provider: "reddit", score: 7, upvoteRatio: 1,
  }, "original_post", "negative:reddit-seven", "https://reddit.com/r/fixture/comments/seven/story"),
  item("reddit-zero-nineteen", "reddit", "Reddit 0 score 19 comments absent", {
    provider: "reddit", score: 0, upvoteRatio: 1,
  }, "original_post", "negative:reddit-zero-nineteen",
  "https://reddit.com/r/fixture/comments/zero-nineteen/story"),
  item("negative-controversy", "reddit", "Negative controversy must stay absent", {
    provider: "reddit", score: 80, upvoteRatio: -0.2,
  }, "original_post", "negative:controversy", "https://reddit.com/r/fixture/comments/negative/story"),
  item("x-reply-only", "x-twitter", "X reply-only evidence absent", {
    provider: "x", likes: 500, reposts: 500, weightedScore: 1500,
  }, "reply", "negative:x-reply", "https://x.com/fixture/status/reply"),
  item("missing-metrics", "hacker-news", "Missing metrics absent", undefined,
    "story", "negative:missing", "https://news.ycombinator.com/item?id=missing"),
  item("conflicting-metrics", "x-twitter", "Conflicting metrics absent", {
    provider: "x", likes: 30, reposts: 20, weightedScore: 69,
  }, "original_post", "negative:conflict", "https://x.com/fixture/status/conflict"),
  item("threshold-minus-one-x", "x-twitter", "X threshold minus one absent", {
    provider: "x", likes: 14, reposts: 10, weightedScore: 34,
  }, "original_post", "negative:x-minus-one", "https://x.com/fixture/status/minus-one"),
  item("threshold-minus-one-reddit", "reddit", "Reddit threshold minus one absent", {
    provider: "reddit", score: 24, upvoteRatio: 1,
  }, "original_post", "negative:reddit-minus-one", "https://reddit.com/r/fixture/comments/minus/story"),
  item("threshold-minus-one-hn", "hacker-news", "HN threshold minus one absent", {
    provider: "hacker_news", points: 24,
  }, "story", "negative:hn-minus-one", "https://news.ycombinator.com/item?id=hn24"),
  item("threshold-minus-one-github", "github-repo-radar", "GitHub threshold minus one absent", {
    provider: "github_radar", snapshotKind: "repository_growth",
    windowStartedAt: new Date("2026-08-13T12:00:00.000Z"),
    windowEndedAt: new Date("2026-08-14T12:00:00.000Z"), starsDelta: 24, forksDelta: 0,
  }, "repository", "negative:github-minus-one", "https://github.com/fixture/minus-one"),
] as const satisfies readonly SummaryEvidenceItem[];

const sameStoryRelations: readonly ApprovedSameStoryRelation[] = [
  {
    leftFeedItemId: "cursor-hn",
    rightFeedItemId: "cursor-x-official",
    confidence: 0.92,
  },
  {
    leftFeedItemId: "spacex-github-24",
    rightFeedItemId: "duplicate-additional",
    confidence: 0.92,
  },
];

const relatedTopicRelations = [{
  relationId: "related-topic:v1:reddit:weak-related:x-twitter:anthropic-watermark-x",
  subjectStoryClusterId: "cluster:weak-related",
  targetStoryClusterId: "cluster:anthropic-watermark-x",
  subjectFeedItemId: "related-topic-eligible",
  subjectProviderKey: "reddit",
  subjectSourceItemId: "related-topic-eligible",
  subjectCanonicalUrl: "https://reddit.com/r/fixture/comments/related/story",
  subjectProviderMetrics: [{ label: "Comments", value: "19" }],
  officialAnchorFeedItemId: "anthropic-watermark-x",
  officialAnchorProviderKey: "x-twitter",
  officialAnchorSourceItemId: "anthropic-watermark-x",
  officialAnchorContentQuality: evidence[3].contentQuality!,
  subjectIsOfficial: false,
  officialAnchorIsOfficial: true,
}] as const;

const clusters = evidence
  .filter(({ feedItemId }) => ![
    "cursor-x-official",
    "duplicate-additional",
  ].includes(feedItemId))
  .map((entry) => {
    if (entry.feedItemId === "cursor-hn") return {
      ...cluster(entry),
      duplicateFeedItemIds: ["cursor-x-official"],
      providerKeys: ["hacker-news", "x-twitter"],
    };
    if (entry.feedItemId === "spacex-github-24") return {
      ...cluster(entry),
      duplicateFeedItemIds: ["duplicate-additional"],
      providerKeys: ["github-repo-radar", "hacker-news"],
    };
    return cluster(entry);
  });
const sourceWindow = {
  windowId: "fixture-window",
  startedAt: periodStart,
  endedAt: periodEnd,
  periodStartedAt: periodStart,
  periodEndedAt: periodEnd,
  ingestionCutoff: cutoff,
  selectedFeedItemIds: evidence.map(({ feedItemId }) => feedItemId),
  storyClusterIds: clusters.map(({ id }) => id),
};
const selection: SummaryEvidenceSelection = {
  rankingPolicyVersion: "story-ranking.v1",
  personalization: {
    memoryGuidanceStatus: "unavailable",
    memoryGuidanceApplied: false,
    providerPreferenceCount: 0,
    keywordPreferenceCount: 0,
    mutedKeywordCount: 0,
    blockedProviderCount: 0,
    signals: [],
  },
  selectedEvidence: evidence,
  clusters,
  sourceWindow,
  approvedSameStoryRelations: sameStoryRelations,
  relatedTopicRelations,
};

const start = async (): Promise<void> => {
  emitReaderSummaryFixtureStage("pglite_construction_start");
  const database = await PGlite.create("memory://", {
    extensions: { pgcrypto },
  });
  fixtureDatabase = database;
  emitReaderSummaryFixtureStage("pglite_construction_end");
  const databaseServer = new PGLiteSocketServer({
    db: database,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 20,
  });
  fixtureDatabaseServer = databaseServer;
  emitReaderSummaryFixtureStage("pglite_socket_start");
  await databaseServer.start();
  emitReaderSummaryFixtureStage("pglite_socket_started");
  const databaseUrl = databaseUrlFrom(databaseServer.getServerConn());
  emitReaderSummaryFixtureStage("prisma_db_push_start");
  await pushPrismaSchema(databaseUrl);
  emitReaderSummaryFixtureStage("prisma_db_push_end");
  await installPublicationBoundary(database);
  configureFixtureRuntime(databaseUrl);

  emitReaderSummaryFixtureStage("nest_module_compile_start");
  const moduleRef = await Test.createTestingModule({
    imports: [
      MetricsRuntimeModule.register({ serviceName: "reader-summary-e2e" }),
      SummaryRestModule,
    ],
    providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
  }).compile();
  fixtureModule = moduleRef;
  emitReaderSummaryFixtureStage("nest_module_compile_end");
  const app = moduleRef.createNestApplication();
  fixtureApp = app;
  emitReaderSummaryFixtureStage("nest_app_create");
  app.enableCors({
    origin: true,
    methods: ["GET", "OPTIONS"],
    allowedHeaders: [
      "content-type",
      "x-tenant-id",
      "x-workspace-id",
      "x-workspace-role",
    ],
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  await app.init();

  emitReaderSummaryFixtureStage("seeding_start");
  const jobs = moduleRef.get<ReaderSummaryJobRepositoryPort>(
    READER_SUMMARY_JOB_REPOSITORY,
    { strict: false },
  );
  const repository = moduleRef.get<ReaderSummaryArtifactRepositoryPort>(
    READER_SUMMARY_ARTIFACT_REPOSITORY,
    { strict: false },
  );
  const policies = moduleRef.get<ReaderSummaryPolicyRepositoryPort>(
    READER_SUMMARY_POLICY_REPOSITORY,
    { strict: false },
  );
  const publications = moduleRef.get<ReaderSummaryPublicationPort>(
    READER_SUMMARY_PUBLICATION,
    { strict: false },
  );
  await jobs.save(ReaderSummaryJob.request({
    id: fixtureJobId,
    tenantId: fixtureTenantId,
    workspaceId: fixtureWorkspaceId,
    scope: { type: "workspace" },
    period: {
      cadence: "custom",
      startedAt: periodStart,
      endedAt: periodEnd,
      timezone: "UTC",
      periodKey:
        "custom:2026-08-14T00:00:00.000Z:2026-08-15T00:00:00.000Z:UTC",
    },
    idempotencyKey: "reader-summary-promotion-http-e2e",
    requestedAt: cutoff,
  }));
  const result = await new ExecuteReaderSummaryJobUseCase(
    jobs,
    repository,
    policies,
    { async select() { return selection; } },
    new DeterministicReaderSummaryModelAdapter(),
    publications,
    { generate: () => fixtureArtifactId } satisfies IdGenerator,
    new FixedClock(cutoff),
    undefined,
    undefined,
    undefined,
    undefined,
    { async read() { return {
      eligibleBindingIds: [],
      items: [],
      pageCount: 1,
    }; } },
    undefined,
    undefined,
    undefined,
    enabledReaderSummaryPromotionControl(),
  ).execute({
    tenantId: fixtureTenantId,
    workspaceId: fixtureWorkspaceId,
    readerSummaryJobId: fixtureJobId,
  });
  if (!result.ok || result.value.status !== "completed") {
    const rejected = await repository.findRejectedDebugById({
      tenantId: fixtureTenantId,
      workspaceId: fixtureWorkspaceId,
      readerSummaryId: fixtureArtifactId,
    });
    throw new Error(
      `Fixture execution failed: ${JSON.stringify({
        result,
        resultError: result.ok ? null : {
          message: result.error.message,
          stack: result.error.stack,
        },
        rejected,
      })}`,
    );
  }
  const persisted = await repository.findById({ tenantId: fixtureTenantId,
    workspaceId: fixtureWorkspaceId,
    readerSummaryId: fixtureArtifactId });
  if (persisted === null) throw new Error("Fixture artifact persistence failed");
  emitReaderSummaryFixtureStage("seeding_end");
  if (process.env.READER_SUMMARY_FIXTURE_PRINT === "1") {
    process.stdout.write(`${JSON.stringify(persisted.toSnapshot())}\n`);
    await fixtureLifecycle.close();
    return;
  }
  emitReaderSummaryFixtureStage("http_listen_start");
  await app.listen(0, "127.0.0.1");
  emitReaderSummaryFixtureStage("http_listening");
  const address = app.getHttpServer().address() as AddressInfo;
  emitReaderSummaryFixtureStage("ready");
  process.stdout.write(`${JSON.stringify({ status: "ready",
    baseUrl: `http://127.0.0.1:${address.port}` })}\n`);
};

void start().catch(() => fixtureLifecycle.handleStartupFailure());

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, () => {
    void fixtureLifecycle.close()
      .catch(() => {
        process.stderr.write("Reader summary fixture cleanup failed\n");
      })
      .finally(() => process.exit(0));
  });
}

const databaseUrlFrom = (connection: string): string =>
  `postgresql://postgres:social_monitor_local_password@${connection}/postgres?sslmode=disable`;

const installPublicationBoundary = async (database: PGlite): Promise<void> => {
  // db push supplies the current Prisma shape; this isolated in-memory database
  // then replaces its generated publication tables with the production boundary.
  // PGlite needs a superuser owner because the deployment bootstrap that normally
  // transfers reader_summary_artifacts ownership is intentionally not run here.
  await database.exec(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE ROLE social_monitor_reader_summary_publication_owner
      NOLOGIN SUPERUSER;
    CREATE ROLE social_monitor_reader_summary_publication_runtime NOLOGIN;
    GRANT social_monitor_reader_summary_publication_owner TO postgres;
    DROP TABLE reader_summary_publication_slots CASCADE;
    DROP TABLE reader_summary_publications CASCADE;
  `);
  const migration = await readFile(
    `${repositoryRoot}/prisma/migrations/` +
      "20260716170000_reader_summary_fail_closed_publication/migration.sql",
    "utf8",
  );
  await database.exec(migration);
};

const pushPrismaSchema = async (databaseUrl: string): Promise<void> => {
  const prisma = `${repositoryRoot}/node_modules/.bin/prisma`;
  const child = spawn(prisma, [
    "db",
    "push",
    "--schema",
    "prisma/schema.prisma",
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`Prisma fixture schema push failed (${exitCode}): ${stderr}`);
  }
};

const configureFixtureRuntime = (databaseUrl: string): void => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.POSTGRES_RUNTIME_PROCESS = "api-gateway";
  process.env.POSTGRES_RUNTIME_POOL_MIN = "0";
  process.env.POSTGRES_RUNTIME_POOL_MAX = "2";
  process.env.SOCIAL_MONITOR_RUNTIME_PROFILE = "local-dev";
  process.env.SUMMARY_PERSISTENCE = "prisma";
  process.env.SUMMARY_JOB_QUEUE_MODE = "in-memory";
  process.env.READER_SUMMARY_MODEL_PROVIDER = "deterministic";
  process.env.READER_SUMMARY_TOPIC_LABELER = "deterministic";
  process.env.READER_SUMMARY_PROMOTION_V1_ENABLED = "true";
};

function item(
  id: string, providerKey: string, title: string,
  metrics: NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"] | undefined,
  contentKind: NonNullable<SummaryEvidenceItem["promotionFacts"]>["contentKind"],
  canonicalIdentity: string, canonicalUrl: string, official = false,
): SummaryEvidenceItem {
  return { feedItemId: id, sourceItemId: id, sourceBindingId: `binding:${providerKey}`,
    interestId: "interest:fixture", providerKey, providerName: providerKey,
    canonicalUrl, title, bodyPreview: title,
    publishedAt: new Date("2026-08-14T12:00:00.000Z"),
    observedAt: new Date("2026-08-14T12:05:00.000Z"), score: 1,
    whyImportant: ["Independent source engagement qualifies this story."],
    providerMetricLabels: metricLabels(metrics),
    contentQuality: { qualityScore: 0.9, interestRelevanceScore: 0.9,
      engagementIntegrityScore: 0.9, eligibleForSummary: true,
      eligibleForTopRead: true, needsLlmReview: false, decision: "promote",
      flags: [], reason: "Deterministic fixture quality." },
    promotionFacts: { contentKind, canonicalIdentity, safetyValid: true,
      freshnessValid: true, metricsState: metrics === undefined ? "missing" : "observed",
      freshnessProvenance: { status: "observed",
        publishedAt: new Date("2026-08-14T12:00:00.000Z"),
        observedAt: new Date("2026-08-14T12:05:00.000Z"),
        ingestionCutoff: cutoff },
      ...(metrics?.provider === "github_radar"
        ? { checkedAt: metrics.windowEndedAt }
        : {}),
      ...(metrics === undefined ? {} : { metrics }),
      ...(official ? { authorityAttestation: { status: "attested", official: true,
        trusted: true, attestedBy: "source_catalog" } } : {}) },
  };
}

function cluster(entry: SummaryEvidenceItem): StoryCluster {
  return { id: `cluster:${entry.feedItemId}`, storyKey: entry.feedItemId,
    rankingPolicyVersion: "story-ranking.v1",
    representativeFeedItemId: entry.feedItemId, duplicateFeedItemIds: [],
    interestIds: [entry.interestId], providerKeys: [entry.providerKey], score: 1,
    observedAtRange: { startedAt: entry.observedAt, endedAt: entry.observedAt },
    whyImportant: ["Independent source engagement qualifies this story."] };
}

function metricLabels(
  metrics: NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"] | undefined,
): readonly { readonly label: string; readonly value: string }[] {
  if (metrics === undefined) return [];
  switch (metrics.provider) {
    case "x": return [{ label: "Likes", value: String(metrics.likes) },
      { label: "Reposts", value: String(metrics.reposts) }];
    case "reddit": return [{ label: "Score", value: String(metrics.score) }];
    case "hacker_news": return [{ label: "Points", value: String(metrics.points) }];
    case "github_radar": return [{ label: "Stars delta",
      value: String(Math.max(metrics.starsDelta, metrics.forksDelta)) }];
  }
}
