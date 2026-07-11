import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { SourceItem } from "../../../domain";
import type { PrismaIngestionClient } from "./prisma-ingestion-client";
import type { PrismaSourceItemRecord } from "./prisma-ingestion-records";
import { PrismaSourceItemRepository } from "./prisma-source-item.repository";

describe("PrismaSourceItemRepository", () => {
  it("preloads existing items in one query and deduplicates repeats inside the batch", async () => {
    const existing = record("existing", "00000000-0000-7000-8000-000000000101");
    const records = new Map([[existing.providerItemId, existing]]);
    let findManyCalls = 0;
    let findFirstCalls = 0;
    let createCalls = 0;
    const sourceItem: PrismaIngestionClient["sourceItem"] = {
      findMany: async (args) => {
        findManyCalls += 1;
        return [...records.values()].filter((item) =>
          args.where.providerItemId.in.includes(item.providerItemId),
        );
      },
      findFirst: async (args) => {
        findFirstCalls += 1;
        return records.get(args.where.providerItemId) ?? null;
      },
      create: async (args) => {
        createCalls += 1;
        const created = record(args.data.providerItemId, args.data.id);
        records.set(created.providerItemId, created);
        return created;
      },
    };
    const repository = new PrismaSourceItemRepository({
      sourceItem,
    } as unknown as PrismaIngestionClient);

    const result = await repository.saveBatch({
      tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
      providerKey: "x-twitter",
      items: [
        source("existing", "00000000-0000-7000-8000-000000000201"),
        source("new", "00000000-0000-7000-8000-000000000202"),
        source("new", "00000000-0000-7000-8000-000000000203"),
      ],
    });

    expect(result).toMatchObject({ inserted: 1, skippedDuplicates: 2 });
    expect(findManyCalls).toBe(1);
    expect(findFirstCalls).toBe(0);
    expect(createCalls).toBe(1);
  });
});

const source = (externalId: string, id: string): SourceItem =>
  SourceItem.ingest({
    id,
    tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
    workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
    sourceBindingId: "00000000-0000-7000-8000-000000000004",
    externalId,
    canonicalUrl: `https://x.com/builder/status/${externalId}`,
    title: `Post ${externalId}`,
    body: `Body ${externalId}`,
    publishedAt: new Date("2026-07-10T12:00:00.000Z"),
    ingestedAt: new Date("2026-07-11T00:00:00.000Z"),
  });

const record = (
  providerItemId: string,
  id: string,
): PrismaSourceItemRecord => ({
  id,
  tenantId: "00000000-0000-7000-8000-000000000001",
  workspaceId: "00000000-0000-7000-8000-000000000002",
  sourceBindingId: "00000000-0000-7000-8000-000000000004",
  providerKey: "x-twitter",
  providerItemId,
  canonicalUrl: `https://x.com/builder/status/${providerItemId}`,
  title: `Post ${providerItemId}`,
  body: `Body ${providerItemId}`,
  authorHandle: "builder",
  publishedAt: new Date("2026-07-10T12:00:00.000Z"),
  observedAt: new Date("2026-07-11T00:00:00.000Z"),
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
  metadata: {},
});
