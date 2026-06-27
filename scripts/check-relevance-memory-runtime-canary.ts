import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { InfinityContextClient } from "@infinity-context/sdk";
import { MemoStackRelevanceMemoryProjector } from "@social-monitor/relevance/adapters/memory/memo-stack-relevance-memory.projector";
import { InMemoryRelevanceFeedbackLearningStore } from "@social-monitor/relevance/adapters/persistence/in-memory-relevance-feedback-learning.store";
import { InMemoryRelevanceFeedbackRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-relevance-feedback.repository";
import { InMemoryRelevanceMemoryProjectionRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-relevance-memory-projection.repository";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { PrismaRelevanceConnection } from "@social-monitor/relevance/adapters/persistence/prisma/prisma-relevance-connection";
import { PrismaRelevanceFeedbackLearningStore } from "@social-monitor/relevance/adapters/persistence/prisma/prisma-relevance-feedback-learning.store";
import { PrismaRelevanceMemoryProjectionRepository } from "@social-monitor/relevance/adapters/persistence/prisma/prisma-relevance-memory-projection.repository";
import { ProjectRelevanceMemoryBatchUseCase } from "@social-monitor/relevance/features/project-relevance-memory/project-relevance-memory-batch.use-case";
import { RecordRelevanceFeedbackUseCase } from "@social-monitor/relevance/features/record-relevance-feedback/record-relevance-feedback.use-case";
import {
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import type {
  RelevanceFeedbackLearningStorePort,
  RelevanceMemoryProjectionRepositoryPort,
} from "@social-monitor/relevance/ports";

import { writeLiveEvidenceArtifactAtomically } from "./lib/live-evidence-artifact";

const evidencePathEnv = "RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH";
const baseUrl = requiredEnv("INFINITY_CONTEXT_URL");
const token = requiredEnv("INFINITY_CONTEXT_TOKEN");
const runId =
  readOptionalEnv("RELEVANCE_MEMORY_RUNTIME_CANARY_RUN_ID") ??
  `relevance-memory-live-${Date.now()}`;
const persistenceMode = resolvePersistenceMode();
const now = new Date("2026-06-24T09:00:00.000Z");
const tenant = tenantId(randomUUID());
const workspace = workspaceId(randomUUID());
const userId = randomUUID();
const topic = `topic-ai-tooling-${runId}`;
const feedbackIdempotencyKey = `relevance-memory-runtime-canary:${runId}`;
const memoryScope = userPreferenceScope(userId);
const space = spaceSlug(tenant, workspace);

async function main(): Promise<void> {
  const clock = new FixedClock(now);
  const ids = new SequenceIdGenerator(runId);
  const persistence = createPersistence();

  try {
    const record = await new RecordRelevanceFeedbackUseCase(
      persistence.learning,
      ids,
      clock,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId,
      idempotencyKey: feedbackIdempotencyKey,
      action: "more_like_this",
      rating: 5,
      target: {
        feedItemId: `feed-${runId}`,
        topicId: topic,
        providerKey: "github",
        title:
          "Trending AI developer tooling library for autonomous coding workflows",
        bodyPreview:
          "Strong signal: GitHub stars are accelerating and users discuss agent orchestration quality.",
        canonicalUrl: `https://github.com/example/${runId}`,
      },
    });

    assert(
      record.ok,
      `relevance feedback command must succeed: ${resultErrorMessage(record)}`,
    );
    assert.equal(
      record.value.created,
      true,
      "canary feedback must be newly recorded",
    );
    assert.equal(
      record.value.learningDirection,
      "positive",
      "canary feedback must produce positive learning",
    );
    assert.equal(
      await persistence.countDue(["pending"]),
      1,
      "feedback transaction must enqueue one pending memory projection",
    );

    const batch = await new ProjectRelevanceMemoryBatchUseCase(
      persistence.projections,
      new MemoStackRelevanceMemoryProjector({
        baseUrl,
        token,
        timeoutMs: readPositiveIntegerEnv(
          "RELEVANCE_MEMORY_RUNTIME_CANARY_TIMEOUT_MS",
          30_000,
          1_000,
          60_000,
        ),
      }),
      clock,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    assert(
      batch.ok,
      `memory projection batch must succeed: ${resultErrorMessage(batch)}`,
    );
    assert.equal(
      batch.value.evaluated,
      1,
      "batch must evaluate the queued projection",
    );
    assert.equal(
      batch.value.projected,
      1,
      "batch must write the projection to infinity context",
    );
    assert.equal(
      batch.value.failed,
      0,
      "batch must not leave failed projections",
    );
    const pendingAfterProjection = await persistence.countDue([
      "pending",
      "failed",
    ]);
    assert.equal(
      pendingAfterProjection,
      0,
      "batch must drain pending/failed projections",
    );
    const projectedAfterProjection = await persistence.countDue(["projected"]);
    assert.equal(
      projectedAfterProjection,
      1,
      "projection must be marked projected",
    );

    const client = new InfinityContextClient({
      baseUrl: normalizeBaseUrl(baseUrl),
      token,
      timeoutMs: readPositiveIntegerEnv(
        "RELEVANCE_MEMORY_RUNTIME_CANARY_TIMEOUT_MS",
        30_000,
        1_000,
        60_000,
      ),
    });
    const fact = await waitForProjectedFact(client);
    const context = await waitForProjectedContext(client);

    writeOptionalEvidenceArtifact({
      projectedCount: batch.value.projected,
      pendingAfterProjection,
      projectedAfterProjection,
      fact,
      contextMatched: context.matched,
    });

    console.log(
      [
        "Relevance memory runtime canary OK",
        `Run id: ${runId}`,
        `Persistence: ${persistenceMode}`,
        `Space: ${space}`,
        `Memory scope: ${memoryScope}`,
        `Projected fact id: ${factId(fact)}`,
        `Projected fact category: ${factCategory(fact)}`,
        `Context matched: ${context.matched}`,
      ].join("\n"),
    );
  } finally {
    await persistence.close();
  }
}

async function waitForProjectedFact(
  client: InfinityContextClient,
): Promise<unknown> {
  let latest: unknown;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await client.facts.listFacts({
      spaceSlug: space,
      memoryScopeExternalRef: memoryScope,
      category: "user_preferences",
      status: "active",
      limit: 25,
    });
    latest = response;
    const fact = factsFromResponse(response).find(projectedFactMatches);
    if (fact !== undefined) {
      return fact;
    }
    await sleep(500);
  }

  throw new Error(
    `runtime canary did not find relevance preference fact; last=${safeJson(latest)}`,
  );
}

async function waitForProjectedContext(
  client: InfinityContextClient,
): Promise<{ readonly matched: boolean }> {
  let latest: unknown;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await client.context.buildContext({
      spaceSlug: space,
      memoryScopeExternalRefs: [memoryScope],
      query: `relevance guidance for user ${userId} topic ${topic} github ai developer tooling`,
      tokenBudget: 800,
      maxFacts: 10,
      maxChunks: 0,
      maxEvidenceItems: 5,
      consistencyMode: "best_effort",
      includeStale: false,
    });
    latest = response;
    if (projectedContextMatches(response)) {
      return { matched: true };
    }
    await sleep(500);
  }

  throw new Error(
    `runtime canary did not retrieve projected relevance memory context; last=${safeJson(latest)}`,
  );
}

function projectedFactMatches(fact: unknown): boolean {
  const text = stringAt(fact, ["text"]).toLowerCase();
  const category = stringAt(fact, ["category"]);
  const tags = arrayAt(fact, ["tags"]).map(String);

  return (
    category === "user_preferences" &&
    tags.includes("relevance-feedback") &&
    tags.includes("provider-github") &&
    text.includes(topic.toLowerCase()) &&
    text.includes("prefer similar github evidence")
  );
}

function projectedContextMatches(response: unknown): boolean {
  const rendered = stringAt(response, ["data", "rendered_text"]).toLowerCase();
  const serialized = safeJson(response).toLowerCase();

  return (
    rendered.includes("prefer similar github evidence") ||
    rendered.includes(topic.toLowerCase()) ||
    serialized.includes("social-monitor.relevance-feedback") ||
    serialized.includes(feedbackIdempotencyKey.toLowerCase())
  );
}

function factsFromResponse(response: unknown): readonly unknown[] {
  const data = valueAt(response, ["data"]);
  if (Array.isArray(data)) {
    return data;
  }
  const nested = valueAt(response, ["data", "items"]);
  if (Array.isArray(nested)) {
    return nested;
  }

  return [];
}

type EvidenceArtifactInput = {
  readonly projectedCount: number;
  readonly pendingAfterProjection: number;
  readonly projectedAfterProjection: number;
  readonly fact: unknown;
  readonly contextMatched: boolean;
};

function writeOptionalEvidenceArtifact(input: EvidenceArtifactInput): void {
  const path = readOptionalEnv(evidencePathEnv);
  if (path === undefined) {
    return;
  }

  writeLiveEvidenceArtifactAtomically(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        artifactId: "relevance-memory-runtime-canary-v1",
        generatedAt: new Date().toISOString(),
        runId,
        baseUrlOrigin: safeOrigin(baseUrl),
        persistenceMode,
        result: {
          projectedCount: input.projectedCount,
          pendingAfterProjection: input.pendingAfterProjection,
          projectedAfterProjection: input.projectedAfterProjection,
          projectedFactMatched: projectedFactMatches(input.fact),
          projectedFactCategory: factCategory(input.fact),
          contextMatched: input.contextMatched,
          spaceSlugHash: hashForEvidence(space),
          memoryScopeHash: hashForEvidence(memoryScope),
        },
        redaction: {
          tokenIncluded: false,
          rawAuthorizationHeaderIncluded: false,
          rawMemoryTextIncluded: false,
          rawSourceTextIncluded: false,
        },
      },
      null,
      2,
    )}\n`,
    evidencePathEnv,
  );
}

function factId(fact: unknown): string {
  return stringAt(fact, ["id"]) || stringAt(fact, ["fact_id"]) || "unknown";
}

function factCategory(fact: unknown): string {
  return stringAt(fact, ["category"]) || "unknown";
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function stringAt(value: unknown, path: readonly string[]): string {
  const result = valueAt(value, path);

  return typeof result === "string" ? result : "";
}

function arrayAt(value: unknown, path: readonly string[]): readonly unknown[] {
  const result = valueAt(value, path);

  return Array.isArray(result) ? result : [];
}

function safeJson(value: unknown): string {
  return (
    JSON.stringify(value, (key, nested) =>
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("authorization")
        ? "[redacted]"
        : nested,
    ) ?? "undefined"
  );
}

function requiredEnv(name: string): string {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required for relevance memory runtime canary`);
  }

  return value;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function readPositiveIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

type PersistenceMode = "in-memory" | "prisma";

type CanaryPersistence = {
  readonly learning: RelevanceFeedbackLearningStorePort;
  readonly projections: RelevanceMemoryProjectionRepositoryPort;
  countDue(statuses: readonly string[]): Promise<number>;
  close(): Promise<void>;
};

function resolvePersistenceMode(): PersistenceMode {
  const value =
    readOptionalEnv("RELEVANCE_MEMORY_RUNTIME_CANARY_PERSISTENCE") ??
    "in-memory";
  if (value === "in-memory" || value === "prisma") {
    return value;
  }

  throw new Error(
    'RELEVANCE_MEMORY_RUNTIME_CANARY_PERSISTENCE must be "in-memory" or "prisma"',
  );
}

function createPersistence(): CanaryPersistence {
  if (persistenceMode === "prisma") {
    const connection = new PrismaRelevanceConnection(
      requiredEnv("DATABASE_URL"),
    );

    return {
      learning: new PrismaRelevanceFeedbackLearningStore(connection),
      projections: new PrismaRelevanceMemoryProjectionRepository(connection),
      countDue: async (statuses) =>
        (
          await connection.relevanceMemoryProjection.findMany({
            where: {
              status: { in: statuses },
              nextAttemptAt: { lte: new Date("2999-01-01T00:00:00.000Z") },
              tenantId: tenant,
              workspaceId: workspace,
            },
            orderBy: [
              { nextAttemptAt: "asc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
            take: 25,
          })
        ).length,
      close: async () => connection.close(),
    };
  }

  const profiles = new InMemoryUserRelevanceProfileRepository();
  const feedback = new InMemoryRelevanceFeedbackRepository();
  const projections = new InMemoryRelevanceMemoryProjectionRepository();

  return {
    learning: new InMemoryRelevanceFeedbackLearningStore(
      profiles,
      feedback,
      projections,
    ),
    projections,
    countDue: async (statuses) =>
      projections.all().filter((projection) => {
        const snapshot = projection.toSnapshot();

        return (
          statuses.includes(snapshot.status) &&
          snapshot.tenantId === tenant &&
          snapshot.workspaceId === workspace
        );
      }).length,
    close: async () => undefined,
  };
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

function safeOrigin(value: string): string {
  try {
    return new URL(normalizeBaseUrl(value)).origin;
  } catch {
    return "invalid-url-redacted";
  }
}

function hashForEvidence(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function spaceSlug(tenantValue: string, workspaceValue: string): string {
  return `social-monitor:${tenantValue}:${workspaceValue}`;
}

function userPreferenceScope(userValue: string): string {
  return `user:${userValue}:preferences`;
}

function resultErrorMessage(result: unknown): string {
  if (
    result === null ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    (result as { ok?: unknown }).ok !== false
  ) {
    return "none";
  }

  const error = (result as { error?: unknown }).error;
  if (error instanceof Error) {
    return error.message;
  }
  if (error !== null && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;

    return typeof message === "string" ? message : safeJson(error);
  }

  return String(error);
}

class SequenceIdGenerator implements IdGenerator {
  constructor(prefix: string) {
    void prefix;
  }

  generate(): string {
    return randomUUID();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
