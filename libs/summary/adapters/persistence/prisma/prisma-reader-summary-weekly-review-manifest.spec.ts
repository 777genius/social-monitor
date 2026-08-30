import { createHash } from "node:crypto";

import {
  createReaderSummaryWeeklyReviewManifest,
  deriveReaderSummaryWeeklyReviewStoryCandidates,
  type ReaderSummaryWeeklyReviewAuthority,
} from "../../../domain/value-objects/reader-summary-weekly-review-manifest";
import {
  ReaderSummaryWeeklyReviewManifestCorruptionError,
} from "../../../ports/reader-summary-weekly-review-manifest.port";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  PrismaReaderSummaryWeeklyReviewManifest,
} from "./prisma-reader-summary-weekly-review-manifest";

describe("PrismaReaderSummaryWeeklyReviewManifest", () => {
  it("reads only a row whose canonical bytes and seal-bound columns agree", async () => {
    const manifest = manifestFor(authority());
    const adapter = new PrismaReaderSummaryWeeklyReviewManifest(fakePrisma([rowFor(manifest)]));

    const found = await adapter.findBySeal({
      tenantId: manifest.tenantId,
      workspaceId: manifest.workspaceId,
      scope: manifest.scope,
      weekStartedOn: manifest.weekStartedOn,
      sealId: manifest.sealId,
    });

    expect(found?.manifestId).toBe(manifest.manifestId);
    expect(found?.toBytes()).toEqual(manifest.toBytes());
  });

  it("classifies forged byte or column bindings as canonical corruption", async () => {
    const manifest = manifestFor(authority());
    const adapter = new PrismaReaderSummaryWeeklyReviewManifest(fakePrisma([{
      ...rowFor(manifest),
      manifest_sha256: "f".repeat(64),
    }]));

    const lookup = adapter.findBySeal({
      tenantId: manifest.tenantId,
      workspaceId: manifest.workspaceId,
      scope: manifest.scope,
      weekStartedOn: manifest.weekStartedOn,
      sealId: manifest.sealId,
    });

    await expect(lookup).rejects.toBeInstanceOf(
      ReaderSummaryWeeklyReviewManifestCorruptionError,
    );
    await expect(lookup).rejects.toMatchObject({
      reason: "canonical_divergence",
    });
  });

  it("classifies ambiguous persisted rows as typed corruption", async () => {
    const manifest = manifestFor(authority());
    const adapter = new PrismaReaderSummaryWeeklyReviewManifest(fakePrisma([{}, {}]));

    const lookup = adapter.findBySeal({
      tenantId: manifest.tenantId,
      workspaceId: manifest.workspaceId,
      scope: manifest.scope,
      weekStartedOn: manifest.weekStartedOn,
      sealId: manifest.sealId,
    });

    await expect(lookup).rejects.toMatchObject({
      reason: "ambiguous_lookup",
    });
  });

  it("classifies an invalid persisted canonical scope as typed corruption", async () => {
    const manifest = manifestFor(authority());
    const adapter = new PrismaReaderSummaryWeeklyReviewManifest(fakePrisma([{
      ...rowFor(manifest),
      canonical_record: {
        ...manifest.canonicalRecord,
        scope: { type: "unsupported" },
      },
    }]));

    const lookup = adapter.findBySeal({
      tenantId: manifest.tenantId,
      workspaceId: manifest.workspaceId,
      scope: manifest.scope,
      weekStartedOn: manifest.weekStartedOn,
      sealId: manifest.sealId,
    });

    await expect(lookup).rejects.toBeInstanceOf(
      ReaderSummaryWeeklyReviewManifestCorruptionError,
    );
    await expect(lookup).rejects.toMatchObject({
      reason: "invalid_canonical_scope",
    });
  });

  it("requires an exact persistence proof from the definer function", async () => {
    const manifest = manifestFor(authority());
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        outcome: "persisted",
        manifest_id: manifest.manifestId,
        manifest_sha256: manifest.manifestSha256,
        seal_id: manifest.sealId,
      }]);
    const adapter = new PrismaReaderSummaryWeeklyReviewManifest(
      { $queryRaw: queryRaw } as unknown as PrismaSummaryClient,
    );

    await expect(adapter.persist({ manifest })).resolves.toMatchObject({
      outcome: "persisted",
      manifest: { manifestId: manifest.manifestId },
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});

const fakePrisma = (rows: readonly Record<string, unknown>[]): PrismaSummaryClient => ({
  $queryRaw: jest.fn(async () => rows),
} as unknown as PrismaSummaryClient);

const rowFor = (manifest: ReturnType<typeof manifestFor>) => ({
  manifest_id: manifest.manifestId,
  manifest_sha256: manifest.manifestSha256,
  tenant_id: manifest.tenantId,
  workspace_id: manifest.workspaceId,
  scope_type: manifest.scope.type,
  scope_key: manifest.scopeKey,
  week_started_on: manifest.weekStartedOn,
  week_ended_on: manifest.weekEndedOn,
  seal_id: manifest.sealId,
  seal_sha256: manifest.sealSha256,
  review_authority: manifest.reviewAuthority,
  review_authority_sha256: manifest.reviewAuthoritySha256,
  observations: manifest.observations,
  citations: manifest.citations,
  model_response_sha256: manifest.modelResponseSha256,
  execution_attestation: manifest.executionAttestation,
  execution_attestation_sha256: manifest.executionAttestationSha256,
  canonical_record: manifest.canonicalRecord,
  canonical_bytes: manifest.toBytes(),
});

const manifestFor = (source: ReaderSummaryWeeklyReviewAuthority) => {
  const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(source)[0]!;
  return createReaderSummaryWeeklyReviewManifest({
    authority: source,
    selections: [{
      story: candidate.story,
      label: "observation",
      citationSelectors: [candidate.citations[0]!.selector],
    }],
    modelResponseSha256: sha("response"),
    executionAttestation: {
      schemaVersion: 1,
      requestId: "reader-summary-weekly-review:test",
      purpose: "social_monitor.reader_summary.weekly.review.v2",
      canonicalRequestSha256: sha("request"),
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "1.2.3",
      launcherSha256: sha("launcher"),
      selectedOutputKind: "structured_output",
      selectedOutputSha256: sha("response"),
    },
  });
};

const authority = (): ReaderSummaryWeeklyReviewAuthority => ({
  sealId: `reader_summary.weekly_certification_seal.v1:${sha("seal")}`,
  sealSha256: sha("seal"),
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  scope: { type: "workspace" },
  weekStartedOn: "2026-07-20",
  weekEndedOn: "2026-07-26",
  days: Array.from({ length: 7 }, (_, index) => {
    const date = utcDateAfter("2026-07-20", index);
    return {
      requestedUtcDate: date,
      publicationId: `publication:${date}`,
      publicationEvidenceIdentity: `reader_summary.weekly_publication_evidence.v1:${sha(date)}`,
      publicationEvidenceSha256: sha(date),
      providerEvidenceSha256: sha(`provider:${date}`),
      githubEvidenceSha256: sha(`github:${date}`),
      semanticStatus: "COMPLETED" as const,
      githubMode: "verified" as const,
      providerEvidence: [{
        providerKey: "rss" as const,
        citationId: `citation:${date}`,
        feedItemId: `feed:${date}`,
        sourceItemId: `source:${date}`,
        sourceBindingId: `binding:${date}`,
        providerItemId: `provider-item:${date}`,
        canonicalUrl: "https://example.com/stable-story",
        sourceContentHash: sha(`content:${date}`),
        publishedAt: `${date}T08:00:00.000Z`,
        observedAt: `${date}T09:00:00.000Z`,
        title: "Sealed source",
        sourceText: "Sealed source body for weekly review.",
      }],
    };
  }),
});

const sha = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const utcDateAfter = (date: string, offset: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
