import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PrismaSourceCandidateMemoryClient } from "./prisma-ingestion-client";
import type { PrismaSourceCandidateMemoryRecord } from "./prisma-ingestion-records";
import { PrismaSourceCandidateMemoryRepository } from "./prisma-source-candidate-memory.repository";

describe("PrismaSourceCandidateMemoryRepository", () => {
  it("persists scoped fingerprints and suppresses only matching active records", async () => {
    const fake = new FakeCandidateMemoryClient();
    const repository = new PrismaSourceCandidateMemoryRepository(
      fake.client(),
      { generate: () => "00000000-0000-7000-8000-000000000901" },
    );
    const scope = memoryScope();

    await repository.remember({
      ...scope,
      rememberedAt: new Date("2026-07-11T00:00:00.000Z"),
      candidates: [
        {
          externalId: "x-twitter:1",
          fingerprint: "fingerprint-1",
          contentFingerprint: "content-1",
          decision: "processed",
          reasonCode: "already_processed",
          expiresAt: new Date("2026-07-11T12:00:00.000Z"),
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
        tenantId: tenantId("00000000-0000-7000-8000-000000000999"),
        screenedAt: new Date("2026-07-11T01:00:00.000Z"),
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
  });

  it("refreshes a record without replacing its first-seen timestamp", async () => {
    const fake = new FakeCandidateMemoryClient();
    const repository = new PrismaSourceCandidateMemoryRepository(
      fake.client(),
      { generate: () => "00000000-0000-7000-8000-000000000902" },
    );
    const command = {
      ...memoryScope(),
      candidates: [
        {
          externalId: "x-twitter:1",
          fingerprint: "fingerprint-1",
          contentFingerprint: "content-1",
          decision: "rejected" as const,
          reasonCode: "ranked_out" as const,
          expiresAt: new Date("2026-07-11T06:00:00.000Z"),
        },
      ],
    };

    await repository.remember({
      ...command,
      rememberedAt: new Date("2026-07-11T00:00:00.000Z"),
    });
    await repository.remember({
      ...command,
      rememberedAt: new Date("2026-07-11T02:00:00.000Z"),
    });

    expect(fake.records).toEqual([
      expect.objectContaining({
        firstSeenAt: new Date("2026-07-11T00:00:00.000Z"),
        lastSeenAt: new Date("2026-07-11T02:00:00.000Z"),
        seenCount: 2,
        contentFingerprint: "content-1",
        engagementFingerprint: null,
        schemaVersion: 2,
      }),
    ]);
  });

  it("returns an expired split record for due classification without suppressing it", async () => {
    const fake = new FakeCandidateMemoryClient();
    const repository = new PrismaSourceCandidateMemoryRepository(
      fake.client(),
      { generate: () => "00000000-0000-7000-8000-000000000904" },
    );
    const scope = memoryScope();
    const candidate = {
      externalId: "x-twitter:due",
      fingerprint: "legacy-due",
      contentFingerprint: "content-due",
      engagementFingerprint: "engagement-due",
      observationIntervalMs: 30 * 60 * 1_000,
    };
    await repository.remember({
      ...scope,
      rememberedAt: new Date("2026-07-11T00:00:00.000Z"),
      candidates: [
        {
          ...candidate,
          decision: "processed",
          reasonCode: "already_processed",
          expiresAt: new Date("2026-07-11T00:30:00.000Z"),
        },
      ],
    });

    await expect(
      repository.screen({
        ...scope,
        screenedAt: new Date("2026-07-11T00:30:00.000Z"),
        candidates: [candidate],
      }),
    ).resolves.toMatchObject({
      suppressedExternalIds: [],
      activeRecords: [],
      records: [
        expect.objectContaining({
          externalId: "x-twitter:due",
          schemaVersion: 2,
        }),
      ],
    });
  });

  it("purges expired replay memory before recording new decisions", async () => {
    const fake = new FakeCandidateMemoryClient();
    const repository = new PrismaSourceCandidateMemoryRepository(
      fake.client(),
      { generate: () => "00000000-0000-7000-8000-000000000903" },
    );
    const scope = memoryScope();
    await repository.remember({
      ...scope,
      rememberedAt: new Date("2026-07-11T00:00:00.000Z"),
      candidates: [
        {
          externalId: "expired",
          fingerprint: "expired-fingerprint",
          contentFingerprint: "expired-content",
          decision: "processed",
          reasonCode: "already_processed",
          expiresAt: new Date("2026-07-11T01:00:00.000Z"),
        },
      ],
    });
    await repository.remember({
      ...scope,
      rememberedAt: new Date("2026-07-11T02:00:00.000Z"),
      candidates: [
        {
          externalId: "active",
          fingerprint: "active-fingerprint",
          contentFingerprint: "active-content",
          decision: "processed",
          reasonCode: "already_processed",
          expiresAt: new Date("2026-07-11T14:00:00.000Z"),
        },
      ],
    });

    expect(fake.records.map((record) => record.providerItemId)).toEqual([
      "active",
    ]);
  });
});

const memoryScope = () => ({
  tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
  workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
  interestId: "00000000-0000-7000-8000-000000000003",
  sourceBindingId: "00000000-0000-7000-8000-000000000004",
  providerKey: "x-twitter",
  scopeFingerprint: "scope-v1",
  policyVersion: "policy-v1",
});

class FakeCandidateMemoryClient {
  readonly records: PrismaSourceCandidateMemoryRecord[] = [];

  client(): PrismaSourceCandidateMemoryClient {
    return {
      sourceCandidateMemory: {
        deleteMany: async (args) => {
          const before = this.records.length;
          for (let index = this.records.length - 1; index >= 0; index -= 1) {
            const record = this.records[index]!;
            if (
              record.tenantId === args.where.tenantId &&
              record.workspaceId === args.where.workspaceId &&
              args.where.id.in.includes(record.id)
            ) {
              this.records.splice(index, 1);
            }
          }
          return { count: before - this.records.length };
        },
        findMany: async (args: CandidateMemoryFindManyArgs) => {
          const records = this.records.filter(
            (record) =>
              record.tenantId === args.where.tenantId &&
              record.workspaceId === args.where.workspaceId &&
              (args.where.interestId === undefined ||
                record.interestId === args.where.interestId) &&
              (args.where.sourceBindingId === undefined ||
                record.sourceBindingId === args.where.sourceBindingId) &&
              (args.where.providerKey === undefined ||
                record.providerKey === args.where.providerKey) &&
              (args.where.scopeFingerprint === undefined ||
                record.scopeFingerprint === args.where.scopeFingerprint) &&
              (args.where.policyVersion === undefined ||
                record.policyVersion === args.where.policyVersion) &&
              (args.where.providerItemId === undefined ||
                args.where.providerItemId.in.includes(record.providerItemId)) &&
              (args.where.expiresAt?.gt === undefined ||
                record.expiresAt > args.where.expiresAt.gt) &&
              (args.where.expiresAt?.lte === undefined ||
                record.expiresAt <= args.where.expiresAt.lte),
          );
          return records.slice(0, args.take ?? records.length);
        },
        upsert: async (args: CandidateMemoryUpsertArgs) => {
          const key =
            args.where
              .tenantId_workspaceId_interestId_sourceBindingId_providerKey_scopeFingerprint_providerItemId;
          const existingIndex = this.records.findIndex(
            (record) =>
              record.tenantId === key.tenantId &&
              record.workspaceId === key.workspaceId &&
              record.interestId === key.interestId &&
              record.sourceBindingId === key.sourceBindingId &&
              record.providerKey === key.providerKey &&
              record.scopeFingerprint === key.scopeFingerprint &&
              record.providerItemId === key.providerItemId,
          );
          const existing = this.records[existingIndex];
          const record: PrismaSourceCandidateMemoryRecord =
            existing === undefined
              ? { ...args.create, seenCount: 1 }
              : {
                  ...existing,
                  ...args.update,
                  seenCount:
                    existing.seenCount + args.update.seenCount.increment,
                };
          if (existingIndex < 0) {
            this.records.push(record);
          } else {
            this.records[existingIndex] = record;
          }
          return record;
        },
      },
    };
  }
}

type CandidateMemoryFindManyArgs = Parameters<
  PrismaSourceCandidateMemoryClient["sourceCandidateMemory"]["findMany"]
>[0];

type CandidateMemoryUpsertArgs = Parameters<
  PrismaSourceCandidateMemoryClient["sourceCandidateMemory"]["upsert"]
>[0];
