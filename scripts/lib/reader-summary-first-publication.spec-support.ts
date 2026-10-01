import type { PrismaTransactionalSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { captureFirstPublicationInventory, firstPublicationBytesSha256 } from "./reader-summary-first-publication-inventory";
import { FirstPublicationOperation } from "./reader-summary-first-publication";

export const firstpubScope = { tenantId: "33333333-3333-4333-8333-333333333333", workspaceId: "44444444-4444-4444-8444-444444444444" };
export const firstpubStart = new Date("2026-09-29T00:00:00.000Z");
export const firstpubEnd = new Date("2026-09-30T00:00:00.000Z");
export const firstpubAsOf = new Date("2026-10-01T10:00:00.000Z");

type Row = { id: string; providerKey: string; observedAt: number; sourceObservedAt: number;
  validJoin: boolean; deleted: boolean; version: number };

/** Synthetic transaction model only. It does not prove PostgreSQL locking,
 * RLS, SQL syntax, privileges or durability. It serializes transaction bodies
 * and commits slot inserts, while dataset queries compute from mutable rows. */
export class FirstPublicationMemoryDatabase {
  rows: Row[] = Array.from({ length: 422 }, (_, i) => ({ id: `inventory-${i}`,
    providerKey: "hacker-news", observedAt: (i < 398 ? firstpubStart.getTime() + 1000 : firstpubEnd.getTime() + 1000),
    sourceObservedAt: (i < 398 ? firstpubStart.getTime() + 1000 : firstpubEnd.getTime() + 1000),
    validJoin: true, deleted: false, version: 1 }));
  scopeDeleted = false;
  claims = { jobs: 0, artifacts: 0, publications: 0, slots: 0, dailyModelJobs: 0 };
  existingClaims: { category: keyof FirstPublicationMemoryDatabase["claims"]; status: "failed" | "unknown" }[] = [];
  reads: { sql: string; values: readonly unknown[] }[] = [];
  locks = 0;
  transactions = 0;
  private tail = Promise.resolve();
  readonly client = {
    $queryRaw: async <T>(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<T> =>
      this.query(query, values) as T,
    $transaction: async <T>(operation: (tx: PrismaReaderSummaryClient) => Promise<T>, options?: { isolationLevel?: string }): Promise<T> => {
      if (options?.isolationLevel !== "Serializable") throw new Error("Synthetic DB requires Serializable");
      const previous = this.tail;
      let release!: () => void;
      this.tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      this.transactions++;
      const priorSlots = this.claims.slots;
      try { return await operation({ ...this.client, $executeRaw: async () => { this.locks++; return 0; } } as never); }
      catch (error) { this.claims.slots = priorSlots; throw error; }
      finally { release(); }
    },
  } as PrismaTransactionalSummaryClient;
  private query(query: TemplateStringsArray, values: readonly unknown[]): unknown {
    const sql = query.join("?");
    this.reads.push({ sql, values });
    if (sql.includes('as claims')) return [{ claims: Object.values(this.claims).reduce((a, b) => a + b, 0) + this.existingClaims.length }];
    if (sql.includes('insert into reader_summary_publication_slots')) {
      if (this.claims.slots !== 0) throw new Error("Synthetic unique slot violation");
      this.claims.slots++; return [];
    }
    if (sql.includes('with inventory as')) {
      const asof = Math.max(...values.filter((v): v is Date => v instanceof Date).map((d) => d.getTime()));
      const valid = this.rows.filter((r) => r.validJoin && !r.deleted &&
        r.observedAt >= firstpubStart.getTime() && r.sourceObservedAt >= firstpubStart.getTime() &&
        r.observedAt <= asof && r.sourceObservedAt <= asof);
      return [{ visibleCount: this.rows.length, validCount: valid.length, scopeValid: !this.scopeDeleted,
        sha256: firstPublicationBytesSha256(Buffer.from(JSON.stringify({ rows: this.rows, scopeDeleted: this.scopeDeleted }))) }];
    }
    if (sql.includes('from feed_items fi')) return this.rows.filter((r) => r.validJoin).map((r) => ({
      providerKey: r.providerKey, rowJson: JSON.stringify(r) }));
    if (sql.includes('from source_bindings sb')) return [];
    throw new Error("Unexpected synthetic query");
  }
}

export async function firstpubFixture() {
  const db = new FirstPublicationMemoryDatabase();
  let now = firstpubAsOf.getTime() + 1000;
  const clock = { now: () => new Date(now) };
  const inventory = await captureFirstPublicationInventory({ client: db.client, ...firstpubScope,
    startedAt: firstpubStart, endedAt: firstpubEnd, generatedAt: firstpubAsOf });
  const input = { client: db.client, clock, ...firstpubScope, startedAt: firstpubStart, endedAt: firstpubEnd,
    manifestSha256: firstPublicationBytesSha256(Buffer.from(JSON.stringify(inventory))) };
  return { db, inventory, input, clock, advance: (ms: number) => { now += ms; },
    operation: () => new FirstPublicationOperation(input, inventory) };
}
