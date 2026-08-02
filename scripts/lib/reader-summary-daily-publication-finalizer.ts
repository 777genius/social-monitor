import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  linkSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { classifyAgentRuntimeError } from "@social-monitor/summary/adapters/model/agent-runtime-model-support";
import {
  assertOpenAiReaderSummaryDraftShape,
  normalizeOpenAiReaderSummaryDraft,
} from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-draft-normalizer";
import { currentReaderSummaryPromptRelease } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-prompt";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";
import { StoryRankingMetricsRecorder } from "@social-monitor/summary/adapters/metrics/story-ranking-metrics.recorder";
import { PrismaReaderSummaryGitHubProjectionReader } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-github-projection.reader";
import type { ReaderSummaryDailyCanonicalPublication } from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";
import { BuildReaderSummaryTopicMapUseCase } from "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
} from "@social-monitor/summary/ports";
import type { Clock } from "@social-monitor/shared-kernel";

import type { ReaderSummaryDailyPublicationFinalizer } from "./reader-summary-daily-terminal-runner";
import {
  verifyReaderSummaryDailySourceAuthority,
  type VerifiedReaderSummaryDailySourceAuthority,
} from "./reader-summary-daily-source-authority-snapshot";

const dailyResponsePathEnv = "DURABLE_READER_SUMMARY_DAILY_RESPONSE_PATH";
const dailyReceiptPathEnv = "DURABLE_READER_SUMMARY_DAILY_RECEIPT_PATH";
const dailyAuthorityPathEnv = "DURABLE_READER_SUMMARY_DAILY_AUTHORITY_PATH";
const dailyModelJobIdentityEnv =
  "DURABLE_READER_SUMMARY_DAILY_MODEL_JOB_IDENTITY";

export type ReaderSummaryDailyReplayInput = Readonly<{
  responseBytes: Buffer;
  receiptBytes: Buffer;
  authoritySha256: string;
  ingestionCutoff: string;
  modelJobIdentity: string;
  authority: VerifiedReaderSummaryDailySourceAuthority;
}>;

export const createReaderSummaryDailyCaptureContext = (input: {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly operationalClock: Clock;
}): Readonly<{
  dailyReplay: ReaderSummaryDailyReplayInput | null;
  operationalClock: Clock;
}> => Object.freeze({
  dailyReplay: loadReaderSummaryDailyReplayInput(input.env),
  operationalClock: input.operationalClock,
});

export const loadReaderSummaryDailyReplayInput = (
  env: Readonly<Record<string, string | undefined>>,
): ReaderSummaryDailyReplayInput | null => {
  const paths = [
    readEnv(env, dailyResponsePathEnv),
    readEnv(env, dailyReceiptPathEnv),
    readEnv(env, dailyAuthorityPathEnv),
    readEnv(env, dailyModelJobIdentityEnv),
  ];
  if (paths.every((value) => value === undefined)) return null;
  if (paths.some((value) => value === undefined)) {
    throw new Error("Daily persisted replay inputs must be supplied together");
  }
  const responseBytes = readFileSync(paths[0]!);
  const receiptBytes = readFileSync(paths[1]!);
  const authorityBytes = readFileSync(paths[2]!);
  const authorityRecord = parseRecord(authorityBytes, "source authority");
  const tenantId = requiredText(authorityRecord.tenantId, "authority tenant");
  const workspaceId = requiredText(
    authorityRecord.workspaceId,
    "authority workspace",
  );
  const requestedUtcDate = requiredText(
    authorityRecord.requestedUtcDate,
    "authority date",
  );
  const ingestionCutoff = requiredText(
    authorityRecord.ingestionCutoff,
    "authority cutoff",
  );
  const verified = verifyReaderSummaryDailySourceAuthority({
    tenantId,
    workspaceId,
    requestedUtcDate,
    authority: {
      requestedUtcDate,
      ingestionCutoff,
      canonicalBytes: authorityBytes,
      canonicalSha256: sha256(authorityBytes),
    },
  });
  const modelJobIdentity = requiredText(
    paths[3],
    "daily model job identity",
  );
  if (!/^[0-9a-f]{64}$/u.test(modelJobIdentity)) {
    throw new Error("Daily model job identity is invalid");
  }
  return Object.freeze({
    responseBytes,
    receiptBytes,
    authoritySha256: verified.canonicalSha256,
    ingestionCutoff: verified.ingestionCutoff,
    modelJobIdentity,
    authority: verified,
  });
};

export const createReaderSummaryDailyAuthorityEvidenceSelector = (input: {
  readonly delegate: ReaderSummaryEvidenceSelectorPort;
  readonly authority: VerifiedReaderSummaryDailySourceAuthority;
}): ReaderSummaryEvidenceSelectorPort => ({
  select: async (query) => {
    assertAuthorityQuery(input.authority, query);
    const selection = await input.delegate.select({
      ...query,
      observedThrough: new Date(input.authority.ingestionCutoff),
    });
    assertSelectionUsesAuthority(input.authority, selection.selectedEvidence);
    return selection;
  },
});

export const createReaderSummaryDailyAuthorityGitHubProjectionReader = (
  delegate: ReaderSummaryGitHubProjectionReaderPort,
  authority: VerifiedReaderSummaryDailySourceAuthority,
): ReaderSummaryGitHubProjectionReaderPort => ({
  read: (query) => delegate.read({
    ...query,
    observedThrough: new Date(authority.ingestionCutoff),
  }),
});

export const createReaderSummaryDailyPublicationWiring = (input: {
  readonly replay: ReaderSummaryDailyReplayInput;
  readonly evidenceSelector: ReaderSummaryEvidenceSelectorPort;
  readonly githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  readonly attestationSink: VerifiedReaderSummaryExecutionAttestationSink;
}) => Object.freeze({
  evidenceSelector: createReaderSummaryDailyAuthorityEvidenceSelector({
    delegate: input.evidenceSelector,
    authority: input.replay.authority,
  }),
  githubProjectionReader:
    createReaderSummaryDailyAuthorityGitHubProjectionReader(
      input.githubProjectionReader,
      input.replay.authority,
    ),
  model: createReaderSummaryDailyPersistedResponseModel({
    responseBytes: input.replay.responseBytes,
    receiptBytes: input.replay.receiptBytes,
    modelJobIdentity: input.replay.modelJobIdentity,
    requestedUtcDate: input.replay.authority.requestedUtcDate,
    sourceAuthoritySha256: input.replay.authoritySha256,
    attestationSink: input.attestationSink,
  }),
  topicMapBuilder: new BuildReaderSummaryTopicMapUseCase(),
  inventory: feedInventoryFromAuthority(input.replay.authority.items),
});

export const createReaderSummaryDailyPublicationExecutionWiring = (input: {
  readonly replay: ReaderSummaryDailyReplayInput | null;
  readonly feedItems: FeedItemReadRepositoryPort;
  readonly summaryClient: ConstructorParameters<
    typeof PrismaReaderSummaryGitHubProjectionReader
  >[0];
  readonly clock: Clock;
  readonly attestationSink: VerifiedReaderSummaryExecutionAttestationSink;
}): ReaderSummaryDailyPublicationExecutionWiring => {
  const rankFeedItems = new RankFeedItemsUseCase(
    input.feedItems,
    new InMemoryUserRelevanceProfileRepository(),
    input.clock,
  );
  const evidenceSelector = new RelevanceReaderSummaryEvidenceSelector(
    rankFeedItems,
    input.feedItems,
    input.clock,
    new StoryRankingMetricsRecorder(new InMemoryMetricsRecorder()),
  );
  const githubProjectionReader =
    new PrismaReaderSummaryGitHubProjectionReader(input.summaryClient);
  if (input.replay === null) {
    return Object.freeze({ evidenceSelector, githubProjectionReader });
  }
  return createReaderSummaryDailyPublicationWiring({
    replay: input.replay,
    evidenceSelector,
    githubProjectionReader,
    attestationSink: input.attestationSink,
  });
};

type ReaderSummaryDailyPublicationExecutionWiring = Readonly<{
  evidenceSelector: ReaderSummaryEvidenceSelectorPort;
  githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  model?: ReaderSummaryModelPort;
  topicMapBuilder?: BuildReaderSummaryTopicMapUseCase;
  inventory?: readonly Readonly<{
    providerKey: string;
    itemCount: number;
    newestObservedAt: string;
  }>[];
}>;

export type ReaderSummaryDailyCaptureResult = Readonly<{
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  publicationId: string;
  reportSha256: string;
  proofSha256: string;
  weeklyEvidenceSha256: string;
  evidenceBytes: Buffer;
  frontendBytes: Buffer;
}>;

export type ReaderSummaryDailyCanonicalCapture = (
  input: Parameters<ReaderSummaryDailyPublicationFinalizer["publish"]>[0],
) => Promise<ReaderSummaryDailyCaptureResult>;

export const createReaderSummaryDailyPersistedResponseModel = (input: {
  readonly responseBytes: Buffer;
  readonly receiptBytes: Buffer;
  readonly modelJobIdentity: string;
  readonly requestedUtcDate: string;
  readonly sourceAuthoritySha256: string;
  readonly attestationSink: VerifiedReaderSummaryExecutionAttestationSink;
}): ReaderSummaryModelPort => {
  const response = parseRecord(input.responseBytes, "model response");
  const receipt = parseRecord(input.receiptBytes, "model receipt");
  const attestation = record(receipt.attestation);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.modelJobIdentity !== input.modelJobIdentity ||
    receipt.requestedUtcDate !== input.requestedUtcDate ||
    receipt.sourceAuthoritySha256 !== input.sourceAuthoritySha256 ||
    receipt.responseSha256 !== sha256(input.responseBytes) ||
    attestation === null ||
    attestation.provider !== "codex" ||
    attestation.model !== "gpt-5.6-sol" ||
    attestation.reasoningEffort !== "xhigh" ||
    attestation.runtimeEngine !== "subscription-runtime-cli" ||
    attestation.selectedOutputKind !== "structured_output" ||
    attestation.selectedOutputSha256 !== receipt.responseSha256
  ) {
    throw new Error("Daily persisted model receipt is invalid");
  }
  let generated = false;
  const route: ReaderSummaryModelRoute = {
    provider: "agent-runtime",
    model: "codex:gpt-5.6-sol:xhigh",
    promptVersion: currentReaderSummaryPromptRelease.id,
    schemaVersion: "reader_summary.artifact.v1",
  };
  const estimate = (): ReaderSummaryModelEstimate => ({
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  });
  return {
    route: () => route,
    estimate,
    generate: async (modelInput, selectedRoute) => {
      if (generated) {
        throw new Error("Daily persisted response may be consumed only once");
      }
      generated = true;
      const draft = normalizeOpenAiReaderSummaryDraft(
        response,
        modelInput,
        selectedRoute,
        estimate(),
        "reader_summary.eval.mvp.v1",
      );
      await input.attestationSink.record({
        taskRole: "summary",
        attempt: "persisted_daily_response",
        normalizedOutputSha256: canonicalJsonSha256(draft),
        attestation: attestation as Parameters<
          VerifiedReaderSummaryExecutionAttestationSink["record"]
        >[0]["attestation"],
      });
      return { route: selectedRoute, draft };
    },
    validateRawProviderResponse: (attempt: ProviderReaderSummaryAttempt) => {
      try {
        assertOpenAiReaderSummaryDraftShape(attempt.draft);
        if (attempt.route.model !== route.model ||
            attempt.route.schemaVersion !== route.schemaVersion) {
          throw new Error("Daily persisted response route diverged");
        }
        return { ok: true } as const;
      } catch (error) {
        return {
          ok: false,
          failure: {
            kind: "invalid_schema" as const,
            retryable: false,
            message: error instanceof Error ? error.message :
              "Daily persisted response is invalid",
          },
        };
      }
    },
    classifyError: (error) => classifyAgentRuntimeError(
      error,
      "Unknown daily persisted reader summary error",
    ),
  };
};

const assertAuthorityQuery = (
  authority: VerifiedReaderSummaryDailySourceAuthority,
  query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
): void => {
  const expectedStart = `${authority.requestedUtcDate}T00:00:00.000Z`;
  const expectedEnd = new Date(Date.parse(expectedStart) + 86_400_000)
    .toISOString();
  if (
    query.tenantId !== authority.tenantId ||
    query.workspaceId !== authority.workspaceId ||
    query.period.startedAt.toISOString() !== expectedStart ||
    query.period.endedAt.toISOString() !== expectedEnd
  ) {
    throw new Error("Daily source authority does not match publication query");
  }
};

const assertSelectionUsesAuthority = (
  authority: VerifiedReaderSummaryDailySourceAuthority,
  selected: Awaited<ReturnType<ReaderSummaryEvidenceSelectorPort["select"]>>[
    "selectedEvidence"
  ],
): void => {
  const authorityByFeedItemId = new Map(
    authority.items.map((item) => [item.feedItemId, item] as const),
  );
  for (const item of selected) {
    const sealed = authorityByFeedItemId.get(item.feedItemId);
    if (
      sealed === undefined ||
      item.sourceItemId !== sealed.sourceItemId ||
      item.providerKey !== sealed.providerKey ||
      item.publishedAt.toISOString() !== sealed.publishedAt ||
      item.observedAt.toISOString() !== sealed.observedAt
    ) {
      throw new Error("Daily publication selected evidence outside source authority");
    }
  }
};

const feedInventoryFromAuthority = (
  items: VerifiedReaderSummaryDailySourceAuthority["items"],
) => {
  const byProvider = new Map<string, { count: number; newest: string }>();
  for (const item of items) {
    const current = byProvider.get(item.providerKey);
    byProvider.set(item.providerKey, {
      count: (current?.count ?? 0) + 1,
      newest: current === undefined || current.newest < item.observedAt
        ? item.observedAt
        : current.newest,
    });
  }
  return [...byProvider.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerKey, value]) => ({
      providerKey,
      itemCount: value.count,
      newestObservedAt: value.newest,
    }));
};

export class CanonicalReaderSummaryDailyPublicationFinalizer
  implements ReaderSummaryDailyPublicationFinalizer
{
  constructor(private readonly dependencies: {
    readonly publicDirectory: string;
    readonly capture: ReaderSummaryDailyCanonicalCapture;
  }) {
    if (dependencies.publicDirectory.trim().length === 0) {
      throw new Error("Daily publication public directory is required");
    }
  }

  async publish(
    input: Parameters<ReaderSummaryDailyPublicationFinalizer["publish"]>[0],
  ): Promise<ReaderSummaryDailyCanonicalPublication> {
    const captured = await this.dependencies.capture(input);
    assertPublicBinding(
      input,
      captured,
      captured.evidenceBytes,
      captured.frontendBytes,
    );
    mkdirSync(this.dependencies.publicDirectory, { recursive: true });
    const evidencePath = join(
      this.dependencies.publicDirectory,
      `durable-reader-summary-${input.work.requestedUtcDate}.v1.json`,
    );
    const frontendPath = join(
      this.dependencies.publicDirectory,
      `frontend-reader-summary-${input.work.requestedUtcDate}.fixture.v1.json`,
    );
    const publicEvidenceBytes = installImmutable(
      evidencePath,
      captured.evidenceBytes,
    );
    const publicFrontendBytes = installImmutable(
      frontendPath,
      captured.frontendBytes,
    );
    assertPublicBinding(
      input,
      captured,
      publicEvidenceBytes,
      publicFrontendBytes,
    );
    return Object.freeze({
      readerSummaryJobId: captured.readerSummaryJobId,
      readerSummaryArtifactId: captured.readerSummaryArtifactId,
      publicationId: captured.publicationId,
      reportSha256: captured.reportSha256,
      proofSha256: captured.proofSha256,
      weeklyEvidenceSha256: captured.weeklyEvidenceSha256,
      publicEvidenceBytes,
      publicEvidenceSha256: sha256(publicEvidenceBytes),
      publicFrontendBytes,
      publicFrontendSha256: sha256(publicFrontendBytes),
    });
  }
}

const assertPublicBinding = (
  input: Parameters<ReaderSummaryDailyPublicationFinalizer["publish"]>[0],
  captured: ReaderSummaryDailyCaptureResult,
  evidenceBytes: Buffer,
  frontendBytes: Buffer,
): void => {
  for (const [label, value] of [
    ["report", captured.reportSha256],
    ["proof", captured.proofSha256],
    ["weekly evidence", captured.weeklyEvidenceSha256],
  ] as const) {
    if (!/^[0-9a-f]{64}$/u.test(value)) {
      throw new Error(`Daily canonical ${label} SHA-256 is invalid`);
    }
  }
  if (
    captured.publicationId !== captured.readerSummaryArtifactId ||
    evidenceBytes.length === 0 ||
    frontendBytes.length === 0
  ) {
    throw new Error("Daily canonical publication capture is incomplete");
  }
  const evidence = parseRecord(evidenceBytes, "evidence");
  const result = record(evidence.result);
  const scope = record(evidence.scope);
  const provenance = record(evidence.provenance);
  const authority = record(provenance?.dailySourceAuthority);
  if (
    scope?.tenantId !== input.work.tenantId ||
    scope.workspaceId !== input.work.workspaceId ||
    result?.readerSummaryJobId !== captured.readerSummaryJobId ||
    result.readerSummaryId !== captured.readerSummaryArtifactId ||
    authority?.canonicalSha256 !==
      input.work.sourceAuthority.canonicalSha256 ||
    authority.modelJobIdentity !== input.work.modelJob.value
  ) {
    throw new Error("Daily public evidence does not bind the canonical DB rows");
  }
  const frontend = parseRecord(frontendBytes, "frontend");
  const frontendArtifact = record(frontend.readerSummaryArtifact);
  if (
    frontend.tenantId !== input.work.tenantId ||
    frontend.workspaceId !== input.work.workspaceId ||
    frontendArtifact?.readerSummaryId !== captured.readerSummaryArtifactId
  ) {
    throw new Error("Daily public frontend artifact has the wrong scope");
  }
};

const installImmutable = (path: string, bytes: Buffer): Buffer => {
  try {
    const existing = readFileSync(path);
    return existing;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const temporary = `${path}.next-${randomUUID()}`;
  try {
    writeFileSync(temporary, bytes, { flag: "wx", mode: 0o444 });
    try {
      linkSync(temporary, path);
    } catch (error) {
      if (!isDestinationRace(error)) throw error;
      return readFileSync(path);
    }
  } finally {
    rmSync(temporary, { force: true });
  }
  return verifyExactFile(path, bytes);
};

const verifyExactFile = (path: string, expected: Buffer): Buffer => {
  const bytes = readFileSync(path);
  if (!bytes.equals(expected) || sha256(bytes) !== sha256(expected)) {
    throw new Error(`Daily public file verification failed for ${path}`);
  }
  return bytes;
};

const parseRecord = (bytes: Buffer, label: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
    const value = record(parsed);
    if (value !== null) return value;
  } catch {
    // The stable error below intentionally excludes payload bytes.
  }
  throw new Error(`Daily public ${label} bytes are invalid`);
};

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readEnv = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined => {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const requiredText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Daily ${label} is required`);
  }
  return value;
};

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

const isMissing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  error.code === "ENOENT";

const isDestinationRace = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  ["EEXIST", "ENOTEMPTY"].includes(String(error.code));
