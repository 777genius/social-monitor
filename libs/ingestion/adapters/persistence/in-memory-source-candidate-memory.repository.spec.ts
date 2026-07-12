import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { SourceCandidateMemoryScope } from "../../ports/source-candidate-memory.port";
import { InMemorySourceCandidateMemoryRepository } from "./in-memory-source-candidate-memory.repository";

describe("InMemorySourceCandidateMemoryRepository", () => {
  it("suppresses only active records with the same scope and fingerprint", async () => {
    const repository = new InMemorySourceCandidateMemoryRepository();
    const scope = memoryScope();
    await repository.remember({
      ...scope,
      rememberedAt: new Date("2026-07-11T00:00:00.000Z"),
      candidates: [
        {
          externalId: "x-twitter:1",
          fingerprint: "fingerprint-1",
          contentFingerprint: "content-1",
          decision: "rejected",
          reasonCode: "ranked_out",
          expiresAt: new Date("2026-07-11T06:00:00.000Z"),
        },
      ],
    });

    await expect(
      repository.screen({
        ...scope,
        screenedAt: new Date("2026-07-11T01:00:00.000Z"),
        candidates: [
          {
            externalId: "x-twitter:1",
            fingerprint: "fingerprint-1",
            contentFingerprint: "content-1",
          },
          {
            externalId: "x-twitter:2",
            fingerprint: "fingerprint-2",
            contentFingerprint: "content-2",
          },
        ],
      }),
    ).resolves.toMatchObject({
      suppressedExternalIds: ["x-twitter:1"],
    });
    await expect(
      repository.screen({
        ...scope,
        screenedAt: new Date("2026-07-11T06:00:00.000Z"),
        candidates: [
          {
            externalId: "x-twitter:1",
            fingerprint: "fingerprint-1",
            contentFingerprint: "content-1",
          },
        ],
      }),
    ).resolves.toMatchObject({
      suppressedExternalIds: [],
      activeRecords: [],
    });
    await expect(
      repository.screen({
        ...scope,
        screenedAt: new Date("2026-07-11T01:00:00.000Z"),
        candidates: [
          {
            externalId: "x-twitter:1",
            fingerprint: "changed",
            contentFingerprint: "changed",
          },
        ],
      }),
    ).resolves.toMatchObject({
      suppressedExternalIds: [],
      activeRecords: [],
    });
  });

  it("isolates tenants and refreshes records without losing first seen time", async () => {
    const repository = new InMemorySourceCandidateMemoryRepository();
    const scope = memoryScope();
    const firstSeenAt = new Date("2026-07-11T00:00:00.000Z");
    const refreshedAt = new Date("2026-07-11T02:00:00.000Z");
    const candidate = {
      externalId: "x-twitter:1",
      fingerprint: "fingerprint-1",
      contentFingerprint: "content-1",
      decision: "processed" as const,
      reasonCode: "already_processed" as const,
      expiresAt: new Date("2026-07-14T00:00:00.000Z"),
    };

    await repository.remember({
      ...scope,
      rememberedAt: firstSeenAt,
      candidates: [candidate],
    });
    await repository.remember({
      ...scope,
      rememberedAt: refreshedAt,
      candidates: [candidate],
    });

    expect(repository.all()).toEqual([
      expect.objectContaining({
        firstSeenAt,
        lastSeenAt: refreshedAt,
        seenCount: 2,
        contentFingerprint: "content-1",
        engagementFingerprint: null,
        schemaVersion: 2,
      }),
    ]);
    await expect(
      repository.screen({
        ...scope,
        tenantId: tenantId("another-tenant"),
        screenedAt: refreshedAt,
        candidates: [candidate],
      }),
    ).resolves.toMatchObject({
      suppressedExternalIds: [],
      activeRecords: [],
    });
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
