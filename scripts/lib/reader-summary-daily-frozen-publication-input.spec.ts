import {
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import {
  buildReaderSummaryPeriod,
  ReaderSummaryJob,
  type ReaderSummaryPublicationPolicy,
} from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryPolicyRepositoryPort,
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationPort,
} from "@social-monitor/summary/ports";

import { canonicalJsonBytes, sha256 } from "./reader-summary-daily-canonical-recovery-v4";
import { createReaderSummaryDailyPublicationExecutionWiring } from "./reader-summary-daily-publication-finalizer";
import { createReaderSummaryDailyFrozenOutputTextWiring } from "./reader-summary-daily-frozen-publication-input";
import { buildReaderSummaryDailyCanonicalRecoveryReceipt } from "./reader-summary-daily-model-job-receipt";
import {
  readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
  verifyReaderSummaryDailySourceAuthority,
} from "./reader-summary-daily-source-authority-snapshot";

const scope = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
};
const hash = (seed: string) => sha256(Buffer.from(seed, "utf8"));

describe("reader summary daily frozen publication input", () => {
  it("routes verified V4 provenance through Jul24 and every reviewed date", async () => {
    for (const requestedUtcDate of [
      "2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27",
    ]) {
      const replay = recoveryReplay(requestedUtcDate, "checked_at_collection_anchor");
      const wiring = frozenWiring(replay);
      const selection = await wiring.evidenceSelector.select(
        evidenceQuery(requestedUtcDate, nextDay(requestedUtcDate)),
      );
      expect(selection.selectedEvidence).toEqual([]);
      expect(selection.clusters).toEqual([]);
      expect(selection.sourceWindow.selectedFeedItemIds).toEqual([]);
      expect(selection.sourceWindow.storyClusterIds).toEqual([]);
      expect(wiring.recoveryProvenance).toMatchObject({
        recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
        sourceAuthoritySha256: replay.authority.canonicalSha256,
        modelJobIdentity: replay.modelJobIdentity,
        outputTextSha256: sha256(replay.responseBytes),
        outputTextByteLength: replay.responseBytes.length,
      });
      await expect(wiring.githubProjectionReader.read(githubQuery(requestedUtcDate)))
        .rejects.toThrow(/unavailable/u);
    }

    for (const [requestedUtcDate, projectionMode] of reviewedRecoveryDays) {
      const published = await executeVerifiedRecovery(
        requestedUtcDate,
        projectionMode,
      );
      if (!published.result.ok) throw published.result.error;
      expect(published.savedDecision).toMatchObject({ status: "published" });
      expect(published.result.value).toMatchObject({ status: "no_signal" });
      expect(published.publicationCommands).toHaveLength(1);
      expect(published.savedAudit).toMatchObject({
        status: projectionMode === "historical_omission" ? "not_required" : "verified",
        recoveryV4: {
          recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
          requestedUtcDate,
          selectedOutputKind: "output_text",
        },
      });
    }
  });

  it.each(["2026-07-23", "2026-07-28", "2026-07-29", "2026-07-30"]) (
    "preserves the exact cutoff-bound historical GitHub omission for %s",
    async (requestedUtcDate) => {
      const replay = recoveryReplay(requestedUtcDate, "historical_omission");
      const wiring = frozenWiring(replay);
      expect(wiring.historicalGithubOmission).toEqual({
        reason: readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
        authorizedAt: nextDay(requestedUtcDate),
      });
      await expect(wiring.githubProjectionReader.read(githubQuery(requestedUtcDate)))
        .rejects.toThrow(/unavailable/u);
    },
  );

  it("rejects historical omissions outside the exact four reviewed dates", () => {
    for (const requestedUtcDate of [
      "2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27",
    ]) {
      expect(() => verifiedAuthority(requestedUtcDate, "historical_omission"))
        .toThrow(/omission is invalid/u);
    }
  });

  it("requires the canonical omission reason, cutoff authorization, and zero GitHub source items", () => {
    const wrongReason = authorityValue(authorityInput("2026-07-23", "historical_omission"));
    record(wrongReason.githubProjection).reason = "Reviewed, but not canonical.";
    expect(() => verifyAuthorityValue("2026-07-23", wrongReason))
      .toThrow(/omission is invalid/u);

    const wrongCutoff = authorityValue(authorityInput("2026-07-28", "historical_omission"));
    record(wrongCutoff.githubProjection).authorizedAt = "2026-07-28T23:59:59.000Z";
    expect(() => verifyAuthorityValue("2026-07-28", wrongCutoff))
      .toThrow(/omission is invalid/u);

    const withGithub = authorityValue(authorityInput("2026-07-23", "checked_at_collection_anchor"));
    withGithub.githubProjection = {
      mode: "historical_omission",
      reason: readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
      authorizedAt: "2026-07-24T00:00:00.000Z",
    };
    expect(() => verifyAuthorityValue("2026-07-23", withGithub))
      .toThrow(/omission is invalid/u);
  });

  it("rejects removed, duplicated, reordered, altered, and wrongly paged checked-at anchors", () => {
    const baseline = authorityValue(authorityInput("2026-07-24", "checked_at_collection_anchor"));
    expect(() => verifyAuthorityValue("2026-07-24", baseline)).not.toThrow();

    const removed = clone(baseline);
    record(removed.githubProjection).items = array(record(removed.githubProjection).items).slice(1);
    expect(() => verifyAuthorityValue("2026-07-24", removed)).toThrow(/incomplete/u);

    const duplicated = clone(baseline);
    const duplicateProjection = record(duplicated.githubProjection);
    duplicateProjection.items = Array.from({ length: 10 }, () =>
      array(duplicateProjection.items)[0]);
    expect(() => verifyAuthorityValue("2026-07-24", duplicated)).toThrow(/diverged/u);

    const reordered = clone(baseline);
    const reorderedProjection = record(reordered.githubProjection);
    reorderedProjection.items = [...array(reorderedProjection.items)].reverse();
    expect(() => verifyAuthorityValue("2026-07-24", reordered)).toThrow(/diverged/u);

    const altered = clone(baseline);
    record(array(record(altered.githubProjection).items)[0]).canonicalUrl =
      "https://github.com/fixture/tampered";
    expect(() => verifyAuthorityValue("2026-07-24", altered)).toThrow(/diverged/u);

    const wrongPage = clone(baseline);
    record(wrongPage.githubProjection).pageCount = 3;
    expect(() => verifyAuthorityValue("2026-07-24", wrongPage))
      .toThrow(/page count diverged/u);
  });

  it("requires the exact checked-at collection-anchor schema and cross-checks each anchor", () => {
    const missingAnchor = authorityValue(authorityInput("2026-07-24", "checked_at_collection_anchor"));
    delete record(array(record(missingAnchor.githubProjection).items)[0])
      .checkedAtCollectionAnchor;
    expect(() => verifyAuthorityValue("2026-07-24", missingAnchor))
      .toThrow(/fields outside authority v2/u);

    const oldSchema = authorityValue(authorityInput("2026-07-24", "checked_at_collection_anchor"));
    const projection = record(oldSchema.githubProjection);
    projection.mode = "frozen";
    delete projection.unavailableField;
    delete projection.anchorField;
    delete projection.allowedRequestedUtcDates;
    expect(() => verifyAuthorityValue("2026-07-24", oldSchema))
      .toThrow(/mode is invalid/u);

    const wrongAnchor = authorityValue(authorityInput("2026-07-24", "checked_at_collection_anchor"));
    record(array(record(wrongAnchor.githubProjection).items)[0]).checkedAtCollectionAnchor =
      "2026-07-25T00:00:00.000Z";
    expect(() => verifyAuthorityValue("2026-07-24", wrongAnchor))
      .toThrow(/diverged/u);
  });

  it("requires recovery evidence reads to use the sealed cutoff", async () => {
    const wiring = frozenWiring(recoveryReplay("2026-07-24", "checked_at_collection_anchor"));
    await expect(wiring.evidenceSelector.select(evidenceQuery(
      "2026-07-24",
      new Date("2026-07-25T00:00:01.000Z"),
    ))).rejects.toThrow(/publication query/u);
  });

  it("requires exact authority SHA, model identity, output SHA, length, and output_text receipt", () => {
    const replay = recoveryReplay("2026-07-24", "checked_at_collection_anchor");
    expect(() => createReaderSummaryDailyFrozenOutputTextWiring({
      ...replay,
      sourceAuthoritySha256: "f".repeat(64),
      clock: fixedClock,
    })).toThrow(/not bound/u);
    expect(() => createReaderSummaryDailyFrozenOutputTextWiring({
      ...replay,
      modelJobIdentity: "e".repeat(64),
      clock: fixedClock,
    })).toThrow(/receipt binding diverged/u);
    expect(() => createReaderSummaryDailyFrozenOutputTextWiring({
      ...replay,
      responseBytes: Buffer.concat([replay.responseBytes, Buffer.from(" ")]),
      clock: fixedClock,
    })).toThrow(/output_text/u);
    const forgedResponseBytes = canonicalJsonBytes({
      ...validOutput(),
      citationMap: [{
        citationId: "c1",
        feedItemId: "30000000-0000-4000-8000-000000000003",
        sourceItemId: "40000000-0000-4000-8000-000000000099",
        providerKey: "github-trending-page",
        field: "canonicalUrl",
      }],
    });
    const forgedReceipt = buildReaderSummaryDailyCanonicalRecoveryReceipt({
      modelJobIdentity: replay.modelJobIdentity,
      requestedUtcDate: "2026-07-24",
      sourceAuthoritySha256: replay.sourceAuthoritySha256,
      responseBytes: forgedResponseBytes,
      attestation: persistedOutputTextAttestation(forgedResponseBytes),
    });
    expect(() => createReaderSummaryDailyFrozenOutputTextWiring({
      ...replay,
      responseBytes: forgedResponseBytes,
      receiptBytes: forgedReceipt.receiptBytes,
      clock: fixedClock,
    })).toThrow(/frozen authority/u);
    const structuredReceipt = authorityValue({
      ...replay.authority,
      canonicalBytes: replay.receiptBytes,
      canonicalSha256: sha256(replay.receiptBytes),
    });
    record(record(structuredReceipt).attestation).selectedOutputKind = "structured_output";
    expect(() => createReaderSummaryDailyFrozenOutputTextWiring({
      ...replay,
      receiptBytes: canonicalJsonBytes(structuredReceipt),
      clock: fixedClock,
    })).toThrow(/receipt|attestation/u);
    expect(() => createReaderSummaryDailyPublicationExecutionWiring({
      replay: { ...replay, outputKind: "structured_output" },
      summaryClient: { $queryRaw: jest.fn() } as never,
      clock: fixedClock,
      attestationSink: { record: jest.fn(async () => undefined) },
    })).toThrow(/requires output_text/u);
  });

  it("does not call Prisma for the verified output_text execution wiring", async () => {
    const replay = recoveryReplay("2026-07-24", "checked_at_collection_anchor");
    const queryRaw = jest.fn(() => {
      throw new Error("live Prisma read must not occur");
    });
    const wiring = createReaderSummaryDailyPublicationExecutionWiring({
      replay: {
        ...replay,
        authoritySha256: replay.sourceAuthoritySha256,
        outputKind: "output_text",
      },
      summaryClient: { $queryRaw: queryRaw } as never,
      clock: fixedClock,
      attestationSink: { record: jest.fn(async () => undefined) },
    });

    await wiring.evidenceSelector.select(evidenceQuery("2026-07-24", nextDay("2026-07-24")));
    await expect(wiring.githubProjectionReader.read(githubQuery("2026-07-24")))
      .rejects.toThrow(/unavailable/u);
    expect(wiring.recoveryProvenance).toBeDefined();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("rejects a tampered canonical authority before recovery wiring exists", () => {
    const authority = authorityInput("2026-07-24", "checked_at_collection_anchor");
    expect(() => verifyReaderSummaryDailySourceAuthority({
      ...scope,
      requestedUtcDate: "2026-07-24",
      authority: {
        ...authority,
        canonicalBytes: Buffer.from(authority.canonicalBytes).subarray(1),
      },
    })).toThrow(/SHA-256 diverged/u);
    const wrongDateAuthority = authorityInput(
      "2026-07-25",
      "checked_at_collection_anchor",
    );
    expect(() => verifyReaderSummaryDailySourceAuthority({
      ...scope,
      requestedUtcDate: "2026-07-24",
      authority: wrongDateAuthority,
    })).toThrow(/scope, date, or cutoff diverged/u);
  });

  it("rejects a resealed source-binding mutation against its checked-at anchor", () => {
    const value = authorityValue(authorityInput("2026-07-24", "checked_at_collection_anchor"));
    record(array(value.items)[0]).sourceBindingId =
      "51000000-0000-4000-8000-000000000099";
    expect(() => verifyAuthorityValue("2026-07-24", value))
      .toThrow(/eligible bindings diverged/u);
  });

  it("refuses a hash-valid legacy V1 authority", () => {
    const legacy = {
      schemaVersion: 1,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      requestedUtcDate: "2026-07-24",
      ingestionCutoff: "2026-07-25T00:00:00.000Z",
      items: [],
    };
    const bytes = canonicalJsonBytes(legacy);
    const authority = verifyReaderSummaryDailySourceAuthority({
      ...scope,
      requestedUtcDate: "2026-07-24",
      authority: {
        requestedUtcDate: "2026-07-24",
        ingestionCutoff: "2026-07-25T00:00:00.000Z",
        canonicalBytes: bytes,
        canonicalSha256: sha256(bytes),
      },
    });
    expect(() => createReaderSummaryDailyFrozenOutputTextWiring({
      authority,
      sourceAuthoritySha256: authority.canonicalSha256,
      ingestionCutoff: authority.ingestionCutoff,
      modelJobIdentity: "d".repeat(64),
      responseBytes: canonicalJsonBytes(validOutput()),
      receiptBytes: Buffer.from("{}"),
      clock: fixedClock,
    })).toThrow(/authority v2/u);
  });
});

const fixedClock = { now: () => new Date("2026-07-24T13:00:00.000Z") };

const recoveryReplay = (
  requestedUtcDate: string,
  projectionMode: "checked_at_collection_anchor" | "historical_omission",
) => {
  const authority = verifiedAuthority(requestedUtcDate, projectionMode);
  const responseBytes = canonicalJsonBytes(validOutput());
  const modelJobIdentity = hash(`model:${requestedUtcDate}`);
  const receipt = buildReaderSummaryDailyCanonicalRecoveryReceipt({
    modelJobIdentity,
    requestedUtcDate,
    sourceAuthoritySha256: authority.canonicalSha256,
    responseBytes,
    attestation: persistedOutputTextAttestation(responseBytes),
  });
  return {
    authority,
    sourceAuthoritySha256: authority.canonicalSha256,
    ingestionCutoff: authority.ingestionCutoff,
    modelJobIdentity,
    responseBytes,
    receiptBytes: receipt.receiptBytes,
  };
};

const frozenWiring = (replay: ReturnType<typeof recoveryReplay>) =>
  createReaderSummaryDailyFrozenOutputTextWiring({ ...replay, clock: fixedClock });

const executeVerifiedRecovery = async (
  requestedUtcDate: string,
  projectionMode: "checked_at_collection_anchor" | "historical_omission",
) => {
  const replay = recoveryReplay(requestedUtcDate, projectionMode);
  const cutoff = new Date(replay.ingestionCutoff);
  const clock = { now: () => cutoff };
  const wiring = createReaderSummaryDailyPublicationExecutionWiring({
    replay: {
      ...replay,
      authoritySha256: replay.sourceAuthoritySha256,
      outputKind: "output_text",
    },
    summaryClient: { $queryRaw: jest.fn() } as never,
    clock,
    attestationSink: { record: async () => undefined },
  });
  if (wiring.model === undefined || wiring.topicMapBuilder === undefined) {
    throw new Error("verified Jul24 recovery wiring is incomplete");
  }
  const period = buildReaderSummaryPeriod({
    cadence: "daily",
    startedAt: new Date(`${requestedUtcDate}T00:00:00.000Z`),
    endedAt: cutoff,
    timezone: "UTC",
  });
  const requested = ReaderSummaryJob.request({
    id: `reader-summary-recovery-${requestedUtcDate}`,
    tenantId: tenantId(scope.tenantId),
    workspaceId: workspaceId(scope.workspaceId),
    scope: { type: "workspace" },
    period,
    idempotencyKey: `reader-summary-recovery-${requestedUtcDate}`,
    requestedAt: new Date(`${requestedUtcDate}T00:00:00.000Z`),
  });
  const jobsById = new Map([[requested.toSnapshot().id, requested]]);
  const jobs: Pick<
    ReaderSummaryJobRepositoryPort,
    "save" | "findById" | "claimForExecution"
  > = {
    save: async (job) => {
      jobsById.set(job.toSnapshot().id, job);
    },
    findById: async ({ readerSummaryJobId }) =>
      jobsById.get(readerSummaryJobId) ?? null,
    claimForExecution: async ({ readerSummaryJobId, startedAt }) => {
      const job = jobsById.get(readerSummaryJobId);
      if (job === undefined || job.toSnapshot().status !== "requested") return null;
      const running = job.start({ startedAt });
      jobsById.set(readerSummaryJobId, running);
      return running;
    },
  };
  let savedAudit: unknown;
  let savedDecision: unknown;
  const artifacts: Pick<ReaderSummaryArtifactRepositoryPort, "save"> = {
    save: async (_artifact, options) => {
      savedAudit = options?.githubProjectionAudit;
      savedDecision = options?.publicationDecision;
    },
  };
  const policies: Pick<ReaderSummaryPolicyRepositoryPort, "findByScope"> = {
    findByScope: async () => null,
  };
  const publicationCommands: ReaderSummaryPublicationCommand[] = [];
  const publications: ReaderSummaryPublicationPort = {
    publish: async (command) => {
      publicationCommands.push(command);
      return "published";
    },
  };
  let generatedId = 0;
  const ids: IdGenerator = {
    generate: () => `reader-summary-recovery-e2e-${++generatedId}`,
  };
  const alwaysPublished = {
    evaluate: () => ({
      status: "published" as const,
      qualityPassed: true,
      canonicalScore: 1,
      shadow: {
        mode: "shadow" as const,
        policyVersion: "reader_summary_publication_shadow_v1",
        riskScore: 0,
        signals: [],
      },
      reasons: [],
    }),
  } as unknown as ReaderSummaryPublicationPolicy;
  const result = await new ExecuteReaderSummaryJobUseCase(
    jobs as ReaderSummaryJobRepositoryPort,
    artifacts as ReaderSummaryArtifactRepositoryPort,
    policies as ReaderSummaryPolicyRepositoryPort,
    wiring.evidenceSelector,
    wiring.model,
    publications,
    ids,
    clock,
    undefined,
    undefined,
    wiring.topicMapBuilder,
    alwaysPublished,
    wiring.githubProjectionReader,
    wiring.historicalGithubOmission,
    wiring.recoveryProvenance,
  ).execute({
    tenantId: tenantId(scope.tenantId),
    workspaceId: workspaceId(scope.workspaceId),
    readerSummaryJobId: requested.toSnapshot().id,
    maxEvidenceItems: 200,
  });
  return { result, publicationCommands, savedAudit, savedDecision };
};

const reviewedRecoveryDays = Object.freeze([
  ["2026-07-23", "historical_omission"],
  ["2026-07-24", "checked_at_collection_anchor"],
  ["2026-07-25", "checked_at_collection_anchor"],
  ["2026-07-26", "checked_at_collection_anchor"],
  ["2026-07-27", "checked_at_collection_anchor"],
  ["2026-07-28", "historical_omission"],
  ["2026-07-29", "historical_omission"],
  ["2026-07-30", "historical_omission"],
] as const);

const verifiedAuthority = (
  requestedUtcDate: string,
  projectionMode: "checked_at_collection_anchor" | "historical_omission",
) => verifyReaderSummaryDailySourceAuthority({
  ...scope,
  requestedUtcDate,
  authority: authorityInput(requestedUtcDate, projectionMode),
});

const authorityInput = (
  requestedUtcDate: string,
  projectionMode: "checked_at_collection_anchor" | "historical_omission",
) => {
  const cutoff = nextDay(requestedUtcDate).toISOString();
  const github = Array.from({ length: 10 }, (_, index) => githubSource(
    requestedUtcDate,
    index + 1,
  ));
  const rss = rssSource(requestedUtcDate);
  const value = {
    schemaVersion: 2,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    requestedUtcDate,
    ingestionCutoff: cutoff,
    items: projectionMode === "checked_at_collection_anchor" ? [...github, rss] : [rss],
    githubProjection: projectionMode === "checked_at_collection_anchor"
      ? {
          mode: "checked_at_collection_anchor",
          unavailableField: "fetchStartedAt",
          anchorField: "checkedAtCollectionAnchor",
          allowedRequestedUtcDates: [
            "2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27", "2026-07-29",
          ],
          eligibleBindingIds: [github[0]!.sourceBindingId],
          items: github.map((item, index) => ({
            feedItemId: item.feedItemId,
            sourceItemId: item.sourceItemId,
            sourceBindingId: item.sourceBindingId,
            providerKey: "github-trending-page",
            canonicalUrl: item.canonicalUrl,
            publishedAt: item.publishedAt,
            observedAt: item.observedAt,
            sourceContentHash: item.contentHash,
            sourceProviderContentHash: item.providerContentHash,
            scanJobId: fixtureUuid("b", 1),
            repositoryFullName: `fixture/repository-${index + 1}`,
            rank: index + 1,
            checkedAtCollectionAnchor: item.publishedAt,
          })),
          pageCount: 2,
        }
      : {
          mode: "historical_omission",
          reason: readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
          authorizedAt: cutoff,
        },
  };
  const canonicalBytes = canonicalJsonBytes(value);
  return {
    requestedUtcDate,
    ingestionCutoff: cutoff,
    canonicalBytes,
    canonicalSha256: sha256(canonicalBytes),
  };
};

const githubSource = (requestedUtcDate: string, rank: number) => {
  const second = String(rank).padStart(2, "0");
  const publishedAt = `${requestedUtcDate}T12:00:${second}.000Z`;
  return {
    feedItemId: fixtureUuid("3", rank),
    sourceItemId: fixtureUuid("4", rank),
    sourceBindingId: fixtureUuid("5", 1),
    interestId: fixtureUuid("6", 1),
    providerKey: "github-trending-page",
    canonicalUrl: `https://github.com/fixture/repository-${rank}`,
    title: `Frozen GitHub repository ${rank}`,
    bodyPreview: `A byte-sealed GitHub projection ${rank}.`,
    authorHandle: null,
    publishedAt,
    observedAt: `${requestedUtcDate}T12:10:${second}.000Z`,
    contentHash: hash(`github-source:${rank}`),
    providerContentHash: hash(`github-provider:${rank}`),
  };
};

const rssSource = (requestedUtcDate: string) => ({
  feedItemId: fixtureUuid("7", 1),
  sourceItemId: fixtureUuid("8", 1),
  sourceBindingId: fixtureUuid("9", 1),
  interestId: fixtureUuid("a", 1),
  providerKey: "rss",
  canonicalUrl: "https://fixture.invalid/frozen",
  title: "Frozen RSS item",
  bodyPreview: "A byte-sealed RSS item.",
  authorHandle: null,
  publishedAt: `${requestedUtcDate}T13:00:00.000Z`,
  observedAt: `${requestedUtcDate}T13:01:00.000Z`,
  contentHash: hash("rss-source"),
  providerContentHash: null,
});

const fixtureUuid = (prefix: string, index: number): string =>
  `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const nextDay = (date: string): Date =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000);

const evidenceQuery = (requestedUtcDate: string, observedThrough: Date) => ({
  tenantId: tenantId(scope.tenantId),
  workspaceId: workspaceId(scope.workspaceId),
  scope: { type: "workspace" as const },
  period: {
    startedAt: new Date(`${requestedUtcDate}T00:00:00.000Z`),
    endedAt: nextDay(requestedUtcDate),
    timezone: "UTC",
  },
  maxItems: 200,
  observedThrough,
});

const githubQuery = (requestedUtcDate: string) => ({
  tenantId: tenantId(scope.tenantId),
  workspaceId: workspaceId(scope.workspaceId),
  dayStartedAt: new Date(`${requestedUtcDate}T00:00:00.000Z`),
  dayEndedAt: nextDay(requestedUtcDate),
  observedThrough: nextDay(requestedUtcDate),
});

const authorityValue = (input: { readonly canonicalBytes: Buffer }): Record<string, unknown> =>
  JSON.parse(input.canonicalBytes.toString("utf8")) as Record<string, unknown>;

const verifyAuthorityValue = (
  requestedUtcDate: string,
  value: Record<string, unknown>,
) => {
  const canonicalBytes = canonicalJsonBytes(value);
  return verifyReaderSummaryDailySourceAuthority({
    ...scope,
    requestedUtcDate,
    authority: {
      requestedUtcDate,
      ingestionCutoff: nextDay(requestedUtcDate).toISOString(),
      canonicalBytes,
      canonicalSha256: sha256(canonicalBytes),
    },
  });
};

const persistedOutputTextAttestation = (responseBytes: Buffer) => ({
  schemaVersion: 1,
  requestId: "frozen-output-text-fixture",
  purpose: "social_monitor.reader_summary.weekly.generate",
  canonicalRequestSha256: hash("persisted-output-text-request"),
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  runtimeEngine: "subscription-runtime-cli",
  runtimePackageVersion: "1.2.3",
  launcherSha256: hash("persisted-output-text-launcher"),
  selectedOutputKind: "output_text",
  selectedOutputSha256: sha256(responseBytes),
});

const validOutput = () => ({
  headline: "Canonical day",
  executiveSummary: "Immutable evidence only.",
  narrativeSections: [],
  content: {
    headline: "Canonical day",
    oneLineTakeaway: "Immutable evidence only.",
    bullets: [],
    interestSections: [],
    sourceMix: [],
    topReads: [],
    claimBoard: [],
    reliabilityReport: {
      mode: "shadow",
      policyVersion: "reader_summary.reliability.v1",
      riskLevel: "low",
      riskScore: 0,
      risks: [],
    },
    trendDelta: {
      newSignals: [], growingSignals: [], repeatedSignals: [], fadingSignals: [],
    },
    openQuestions: [],
    risks: [],
    nextActions: [],
  },
  topStories: [],
  interestHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [],
  citationMap: [],
  qualityFlags: ["no_signal"],
  confidence: { level: "low", score: 0, rationale: "No invention." },
  noSignalReason: "No immutable signal.",
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error("fixture array is invalid");
  return value;
};

const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("fixture record is invalid");
  }
  return value as Record<string, unknown>;
};
