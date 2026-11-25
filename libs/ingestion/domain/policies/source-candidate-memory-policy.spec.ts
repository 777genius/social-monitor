import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  SourceCandidateMemoryRecord,
  SourceCandidateMemoryScope,
} from "../../ports/source-candidate-memory.port";
import {
  classifySourceCandidateChange,
  sourceCandidateContentFingerprint,
  sourceCandidateFingerprint,
  sourceCandidateFingerprintSet,
  sourceCandidateMemoryRecordIsActive,
  sourceCandidateObservationIntervalMs,
  sourceCandidateRefreshExpiresAt,
  sourceCandidateScopeFingerprint,
} from "./source-candidate-memory-policy";

describe("source candidate memory policy", () => {
  it("creates a stable policy-versioned fingerprint", () => {
    const base = {
      externalId: "x-twitter:1",
      canonicalUrl: "https://x.com/example/status/1",
      title: "Release",
      body: "Release details",
      publishedAt: new Date("2026-07-10T12:00:00.000Z"),
    };

    const left = sourceCandidateFingerprint({
      policyVersion: "policy-v1",
      candidate: {
        ...base,
        metadata: { metrics: { likes: 4, reposts: 2 }, kind: "x_post" },
      },
    });
    const right = sourceCandidateFingerprint({
      policyVersion: "policy-v1",
      candidate: {
        ...base,
        metadata: { kind: "x_post", metrics: { reposts: 2, likes: 4 } },
      },
    });
    const changedPolicy = sourceCandidateFingerprint({
      policyVersion: "policy-v2",
      candidate: base,
    });

    expect(left).toMatch(/^[a-f0-9]{64}$/u);
    expect(left).toBe(right);
    expect(changedPolicy).not.toBe(left);
  });

  it("splits content from known engagement and volatile provenance", () => {
    const base = {
      externalId: "x-twitter:1",
      canonicalUrl: "https://x.com/example/status/1",
      title: "Release",
      body: "Release details",
      publishedAt: new Date("2026-07-10T12:00:00.000Z"),
      metadata: {
        kind: "x_post",
        searchQuery: "agents",
        sourceQueryLane: { mode: "search", query: "agents" },
        trendScore: 100,
        likes: 4,
        metrics: { likes: 4, reposts: 2 },
      },
    };
    const changedEngagement = {
      ...base,
      metadata: {
        ...base.metadata,
        searchQuery: "monitoring",
        sourceQueryLane: { mode: "search", query: "monitoring" },
        trendScore: 999,
        likes: 8,
        metrics: { likes: 8, reposts: 2 },
      },
    };

    expect(
      sourceCandidateContentFingerprint({
        candidate: base,
        providerKey: "x-twitter",
        policyVersion: "policy-v1",
      }),
    ).toBe(
      sourceCandidateContentFingerprint({
        candidate: changedEngagement,
        providerKey: "x-twitter",
        policyVersion: "policy-v1",
      }),
    );
    expect(
      sourceCandidateFingerprintSet({
        candidate: base,
        providerKey: "x-twitter",
        policyVersion: "policy-v1",
        observedAt: new Date("2026-07-10T13:00:00.000Z"),
      }).engagementFingerprint,
    ).not.toBe(
      sourceCandidateFingerprintSet({
        candidate: changedEngagement,
        providerKey: "x-twitter",
        policyVersion: "policy-v1",
        observedAt: new Date("2026-07-10T13:00:00.000Z"),
      }).engagementFingerprint,
    );
  });

  it("keeps ambiguous unknown-provider metadata in the content fingerprint", () => {
    const candidate = {
      externalId: "unknown:1",
      canonicalUrl: "https://example.com/1",
      title: "Release",
      body: "Release details",
      publishedAt: new Date("2026-07-10T12:00:00.000Z"),
      metadata: { kind: "unknown_item", score: 4 },
    };
    const changed = { ...candidate, metadata: { ...candidate.metadata, score: 8 } };

    expect(
      sourceCandidateContentFingerprint({
        candidate,
        providerKey: "unknown-provider",
        policyVersion: "policy-v1",
      }),
    ).not.toBe(
      sourceCandidateContentFingerprint({
        candidate: changed,
        providerKey: "unknown-provider",
        policyVersion: "policy-v1",
      }),
    );
  });

  it.each([
    [0, 30 * 60 * 1_000],
    [6, 60 * 60 * 1_000],
    [24, 3 * 60 * 60 * 1_000],
    [72, 12 * 60 * 60 * 1_000],
    [24 * 7, 24 * 60 * 60 * 1_000],
  ])("uses an adaptive observation interval at %s hours", (ageHours, expected) => {
    const observedAt = new Date("2026-07-11T00:00:00.000Z");
    expect(
      sourceCandidateObservationIntervalMs({
        publishedAt: new Date(observedAt.getTime() - ageHours * 60 * 60 * 1_000),
        observedAt,
      }),
    ).toBe(expected);
  });

  it("classifies split, expired and legacy records conservatively", () => {
    const scope = memoryScope();
    const now = new Date("2026-07-11T01:00:00.000Z");
    const candidate = {
      externalId: "x-twitter:1",
      fingerprint: "legacy-current",
      contentFingerprint: "content-current",
      engagementFingerprint: "engagement-current",
      observationIntervalMs: 60 * 60 * 1_000,
    };
    const record: SourceCandidateMemoryRecord = {
      ...scope,
      externalId: candidate.externalId,
      fingerprint: candidate.fingerprint,
      contentFingerprint: candidate.contentFingerprint,
      engagementFingerprint: candidate.engagementFingerprint,
      decision: "processed",
      reasonCode: "already_processed",
      expiresAt: new Date("2026-07-11T02:00:00.000Z"),
      firstSeenAt: new Date("2026-07-11T00:00:00.000Z"),
      lastSeenAt: new Date("2026-07-11T00:00:00.000Z"),
      seenCount: 1,
      schemaVersion: 2,
    };
    const kind = (
      overrides: Partial<typeof candidate> = {},
      recordOverrides: Partial<SourceCandidateMemoryRecord> = {},
    ) =>
      classifySourceCandidateChange({
        scope,
        candidate: { ...candidate, ...overrides },
        record: { ...record, ...recordOverrides },
        now,
      });

    expect(
      classifySourceCandidateChange({ scope, candidate, now }).kind,
    ).toBe("new");
    expect(kind().kind).toBe("unchanged");
    expect(kind({ contentFingerprint: "changed" }).kind).toBe(
      "content_changed",
    );
    expect(kind({ engagementFingerprint: "changed" }).kind).toBe(
      "engagement_changed",
    );
    expect(
      kind({}, { expiresAt: new Date("2026-07-11T01:00:00.000Z") }).kind,
    ).toBe("observation_due");
    expect(
      kind(
        { engagementFingerprint: "changed" },
        { expiresAt: new Date("2026-07-11T01:00:00.000Z") },
      ).kind,
    ).toBe("engagement_changed");
    expect(
      kind(
        { engagementFingerprint: undefined, observationIntervalMs: undefined },
        {
          engagementFingerprint: null,
          expiresAt: new Date("2026-07-11T01:00:00.000Z"),
        },
      ).kind,
    ).toBe("content_changed");
    expect(
      kind({}, { schemaVersion: 1, contentFingerprint: null }).legacyFallback,
    ).toBe(true);
    expect(
      kind(
        { fingerprint: "changed-legacy" },
        { schemaVersion: 1, contentFingerprint: null },
      ).kind,
    ).toBe("content_changed");
  });

  it("uses decision-specific refresh TTLs", () => {
    const refreshedAt = new Date("2026-07-11T00:00:00.000Z");
    const policy = {
      policyVersion: "policy-v1",
      processedRefreshTtlMs: 72 * 60 * 60 * 1_000,
      rejectedRefreshTtlMs: 6 * 60 * 60 * 1_000,
    };

    expect(
      sourceCandidateRefreshExpiresAt({
        decision: "processed",
        refreshedAt,
        policy,
      }).toISOString(),
    ).toBe("2026-07-14T00:00:00.000Z");
    expect(
      sourceCandidateRefreshExpiresAt({
        decision: "rejected",
        refreshedAt,
        policy,
      }).toISOString(),
    ).toBe("2026-07-11T06:00:00.000Z");
  });

  it("scopes replay suppression to the same query and target window", () => {
    const base = {
      interestId: "interest-memory",
      sourceBindingId: "binding-memory",
      providerKey: "x-twitter",
      sourceQuery: {
        mode: "search",
        query: "AI agents",
        parameters: {
          targetPublishedWindow: {
            startInclusive: "2026-07-10T00:00:00.000Z",
            endExclusive: "2026-07-11T00:00:00.000Z",
          },
        },
      },
    };
    const fingerprint = sourceCandidateScopeFingerprint({
      scope: base,
      policyVersion: "policy-v1",
    });

    expect(fingerprint).toBe(
      sourceCandidateScopeFingerprint({
        scope: {
          ...base,
          sourceQuery: {
            ...base.sourceQuery,
            parameters: {
              targetPublishedWindow: {
                endExclusive: "2026-07-11T00:00:00.000Z",
                startInclusive: "2026-07-10T00:00:00.000Z",
              },
            },
          },
        },
        policyVersion: "policy-v1",
      }),
    );
    expect(fingerprint).not.toBe(
      sourceCandidateScopeFingerprint({
        scope: {
          ...base,
          sourceQuery: { ...base.sourceQuery, query: "Flutter" },
        },
        policyVersion: "policy-v1",
      }),
    );
  });

  it("fails open when scope, policy, fingerprint or expiry changes", () => {
    const scope = memoryScope();
    const record: SourceCandidateMemoryRecord = {
      ...scope,
      externalId: "x-twitter:1",
      fingerprint: "fingerprint-1",
      contentFingerprint: null,
      engagementFingerprint: null,
      decision: "rejected",
      reasonCode: "ranked_out",
      expiresAt: new Date("2026-07-11T06:00:00.000Z"),
      firstSeenAt: new Date("2026-07-11T00:00:00.000Z"),
      lastSeenAt: new Date("2026-07-11T00:00:00.000Z"),
      seenCount: 1,
      schemaVersion: 1,
    };
    const candidate = {
      externalId: record.externalId,
      fingerprint: record.fingerprint,
      contentFingerprint: "content-1",
    };

    expect(
      sourceCandidateMemoryRecordIsActive({
        record,
        scope,
        candidate,
        now: new Date("2026-07-11T05:59:59.999Z"),
      }),
    ).toBe(true);
    expect(
      sourceCandidateMemoryRecordIsActive({
        record,
        scope: { ...scope, policyVersion: "policy-v2" },
        candidate,
        now: new Date("2026-07-11T01:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      sourceCandidateMemoryRecordIsActive({
        record,
        scope,
        candidate: { ...candidate, fingerprint: "changed" },
        now: new Date("2026-07-11T01:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      sourceCandidateMemoryRecordIsActive({
        record,
        scope,
        candidate,
        now: record.expiresAt,
      }),
    ).toBe(false);
  });
});

const memoryScope = (): SourceCandidateMemoryScope => ({
  tenantId: tenantId("tenant-memory"),
  workspaceId: workspaceId("workspace-memory"),
  interestId: "interest-memory",
  sourceBindingId: "binding-memory",
  providerKey: "x-twitter",
  scopeFingerprint: "scope-v1",
  policyVersion: "policy-v1",
});
