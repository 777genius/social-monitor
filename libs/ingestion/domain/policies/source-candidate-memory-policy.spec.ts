import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  SourceCandidateMemoryRecord,
  SourceCandidateMemoryScope,
} from "../../ports/source-candidate-memory.port";
import {
  sourceCandidateFingerprint,
  sourceCandidateMemoryRecordIsActive,
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
      decision: "rejected",
      reasonCode: "ranked_out",
      expiresAt: new Date("2026-07-11T06:00:00.000Z"),
      firstSeenAt: new Date("2026-07-11T00:00:00.000Z"),
      lastSeenAt: new Date("2026-07-11T00:00:00.000Z"),
      seenCount: 1,
    };
    const candidate = {
      externalId: record.externalId,
      fingerprint: record.fingerprint,
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
