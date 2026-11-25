import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { SourceItem } from "../../../domain";
import type { PrismaIngestionClient } from "./prisma-ingestion-client";
import type { PrismaSourceItemRecord } from "./prisma-ingestion-records";
import { PrismaSourceItemRepository } from "./prisma-source-item.repository";

const scope = {
  tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
  workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
  providerKey: "hacker-news",
};
const binding = "00000000-0000-7000-8000-000000000003";
const otherBinding = "00000000-0000-7000-8000-000000000004";
const now = new Date("2026-09-27T00:00:00.000Z");

const incoming = (externalId: string, id: string): SourceItem => SourceItem.ingest({
  id, ...scope, sourceBindingId: binding, externalId,
  canonicalUrl: `https://news.ycombinator.com/item?id=${externalId}`,
  title: "Incoming title", body: "Incoming body", publishedAt: now, ingestedAt: now,
  metadata: { marker: "incoming" },
});

const existing = (externalId: string, id: string, sourceBindingId: string): PrismaSourceItemRecord => ({
  id, ...scope, sourceBindingId, providerItemId: externalId,
  canonicalUrl: `https://news.ycombinator.com/item?id=${externalId}`,
  title: "Original title", body: "Original body", authorHandle: null,
  publishedAt: now, observedAt: now, lastObservedAt: now, contentUpdatedAt: now,
  createdAt: now, contentHash: "original-hash", providerContentHash: null,
  metadata: { marker: "original" },
});

const command = (...items: SourceItem[]) => ({ ...scope, items });

class TransactionalFixture {
  readonly rows = new Map<string, PrismaSourceItemRecord>();
  readonly isolationLevels: string[] = [];
  updates = 0;
  creates = 0;
  race?: PrismaSourceItemRecord;
  raceCode = "P2002";
  private raced = false;

  readonly $transaction = async <T>(
    operation: (transaction: PrismaIngestionClient) => Promise<T>,
    options: { readonly isolationLevel: "Serializable" },
  ): Promise<T> => {
    this.isolationLevels.push(options.isolationLevel);
    const staged = new Map(this.rows);
    const sourceItem = {
      findMany: async (args: { readonly where: { readonly providerItemId: { readonly in: readonly string[] } } }) =>
        [...staged.values()].filter((row) => args.where.providerItemId.in.includes(row.providerItemId)),
      findFirst: async (args: { readonly where: { readonly providerItemId: string } }) =>
        staged.get(args.where.providerItemId) ?? null,
      create: async (args: { readonly data: Omit<PrismaSourceItemRecord, "createdAt"> }) => {
        this.creates += 1;
        const race = this.race;
        if (race !== undefined && race.providerItemId === args.data.providerItemId && !this.raced) {
          this.raced = true;
          this.rows.set(race.providerItemId, race);
          throw { code: this.raceCode };
        }
        if (staged.has(args.data.providerItemId)) throw { code: "P2002" };
        const created = { ...args.data, createdAt: now } satisfies PrismaSourceItemRecord;
        staged.set(created.providerItemId, created);
        return created;
      },
      update: async (args: { readonly where: { readonly id: string }; readonly data: Partial<PrismaSourceItemRecord> }) => {
        this.updates += 1;
        const current = [...staged.values()].find((row) => row.id === args.where.id);
        if (current === undefined) throw new Error("Missing fixture row");
        const updated = { ...current, ...args.data };
        staged.set(updated.providerItemId, updated);
        return updated;
      },
    };
    const result = await operation({ sourceItem } as unknown as PrismaIngestionClient);
    this.rows.clear();
    for (const [key, row] of staged) this.rows.set(key, row);
    return result;
  };

  client(): PrismaIngestionClient {
    return { $transaction: this.$transaction } as unknown as PrismaIngestionClient;
  }
}

describe("PrismaSourceItemRepository insert-only mode", () => {
  it("keeps the dedicated import entrypoint insert-only on a default repository", async () => {
    const fixture = new TransactionalFixture();
    const original = existing("hn:100", "00000000-0000-7000-8000-000000000100", otherBinding);
    fixture.rows.set(original.providerItemId, original);
    const repository = new PrismaSourceItemRepository(fixture.client());

    await expect(repository.saveBatchInsertOnly(command(incoming("hn:100", "00000000-0000-7000-8000-000000000200"))))
      .rejects.toThrow("Insert-only source item batch conflicts with an existing ID");
    expect(fixture.rows.get(original.providerItemId)).toEqual(original);
    expect(fixture.updates).toBe(0);
  });

  it("inserts a new batch inside one Serializable transaction", async () => {
    const fixture = new TransactionalFixture();
    const repository = new PrismaSourceItemRepository(fixture.client(), "insert-only");

    const result = await repository.saveBatch(command(
      incoming("hn:1", "00000000-0000-7000-8000-000000000701"),
      incoming("hn:2", "00000000-0000-7000-8000-000000000702"),
    ));

    expect(result).toMatchObject({ inserted: 2, contentUpdated: 0, skippedDuplicates: 0 });
    expect(result.items.map((item) => item.mutationKind)).toEqual(["inserted", "inserted"]);
    expect(fixture.isolationLevels).toEqual(["Serializable"]);
    expect(fixture.rows.size).toBe(2);
    expect(fixture.updates).toBe(0);
  });

  it.each([binding, otherBinding])("rejects an existing ID in binding %s without changing its row", async (owner) => {
    const fixture = new TransactionalFixture();
    const original = existing("hn:101", "00000000-0000-7000-8000-000000000101", owner);
    fixture.rows.set(original.providerItemId, original);
    const repository = new PrismaSourceItemRepository(fixture.client(), "insert-only");

    await expect(repository.saveBatch(command(incoming("hn:101", "00000000-0000-7000-8000-000000000201"))))
      .rejects.toThrow("Insert-only source item batch conflicts with an existing ID");

    expect(fixture.isolationLevels).toEqual(["Serializable"]);
    expect(fixture.rows.get(original.providerItemId)).toEqual(original);
    expect(fixture.creates).toBe(0);
    expect(fixture.updates).toBe(0);
  });

  it("rolls back earlier inserts and does not replay a concurrent unique conflict into an update", async () => {
    const fixture = new TransactionalFixture();
    fixture.race = existing("hn:202", "00000000-0000-7000-8000-000000000302", otherBinding);
    const repository = new PrismaSourceItemRepository(fixture.client(), "insert-only");

    await expect(repository.saveBatch(command(
      incoming("hn:201", "00000000-0000-7000-8000-000000000301"),
      incoming("hn:202", "00000000-0000-7000-8000-000000000303"),
      incoming("hn:203", "00000000-0000-7000-8000-000000000304"),
    ))).rejects.toMatchObject({ code: "P2002" });

    expect(fixture.isolationLevels).toEqual(["Serializable"]);
    expect([...fixture.rows.values()]).toEqual([fixture.race]);
    expect(fixture.creates).toBe(2);
    expect(fixture.updates).toBe(0);
  });

  it("rechecks a committed competing ID after a Serializable retry", async () => {
    const fixture = new TransactionalFixture();
    const competing = existing("hn:252", "00000000-0000-7000-8000-000000000352", otherBinding);
    fixture.race = competing;
    fixture.raceCode = "P2034";
    const repository = new PrismaSourceItemRepository(fixture.client(), "insert-only");

    await expect(repository.saveBatch(command(
      incoming("hn:251", "00000000-0000-7000-8000-000000000351"),
      incoming("hn:252", "00000000-0000-7000-8000-000000000353"),
    ))).rejects.toThrow("Insert-only source item batch conflicts with an existing ID");

    expect(fixture.isolationLevels).toEqual(["Serializable", "Serializable"]);
    expect([...fixture.rows.values()]).toEqual([competing]);
    expect(fixture.updates).toBe(0);
  });

  it("rejects an existing later candidate before inserting any batch member", async () => {
    const fixture = new TransactionalFixture();
    const original = existing("hn:302", "00000000-0000-7000-8000-000000000402", binding);
    fixture.rows.set(original.providerItemId, original);
    const repository = new PrismaSourceItemRepository(fixture.client(), "insert-only");

    await expect(repository.saveBatch(command(
      incoming("hn:301", "00000000-0000-7000-8000-000000000401"),
      incoming("hn:302", "00000000-0000-7000-8000-000000000403"),
    ))).rejects.toThrow("Insert-only source item batch conflicts with an existing ID");

    expect([...fixture.rows.values()]).toEqual([original]);
    expect(fixture.creates).toBe(0);
    expect(fixture.updates).toBe(0);
  });

  it("requires transaction support before any write", async () => {
    const create = jest.fn();
    const repository = new PrismaSourceItemRepository({ sourceItem: { create } } as unknown as PrismaIngestionClient, "insert-only");
    await expect(repository.saveBatch(command(incoming("hn:401", "00000000-0000-7000-8000-000000000501"))))
      .rejects.toThrow("Insert-only source item writes require a Serializable transaction");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects repeated IDs within one insert-only batch before opening a transaction", async () => {
    const fixture = new TransactionalFixture();
    const repository = new PrismaSourceItemRepository(fixture.client(), "insert-only");
    await expect(repository.saveBatch(command(
      incoming("hn:401", "00000000-0000-7000-8000-000000000501"),
      incoming("hn:401", "00000000-0000-7000-8000-000000000502"),
    ))).rejects.toThrow("Insert-only source item batch contains a duplicate ID");
    expect(fixture.isolationLevels).toEqual([]);
    expect(fixture.rows.size).toBe(0);
  });

  it("preserves ordinary update behavior for the default mode", async () => {
    const fixture = new TransactionalFixture();
    const original = existing("hn:501", "00000000-0000-7000-8000-000000000601", otherBinding);
    fixture.rows.set(original.providerItemId, original);
    const repository = new PrismaSourceItemRepository(fixture.client());

    const result = await repository.saveBatch(command(incoming("hn:501", "00000000-0000-7000-8000-000000000602")));

    expect(result).toMatchObject({ inserted: 0, contentUpdated: 1 });
    expect(fixture.rows.get(original.providerItemId)).toMatchObject({
      id: original.id, sourceBindingId: binding, title: "Incoming title",
    });
    expect(fixture.updates).toBe(1);
  });
});
