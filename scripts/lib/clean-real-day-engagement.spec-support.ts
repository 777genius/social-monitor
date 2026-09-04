import { currentDatabaseAccess } from "@social-monitor/platform-persistence";
import type { PrismaIngestionWorkerConnection } from
  "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";

type Row = Record<string, unknown>;
type Args = { where?: Row; data?: Row; create?: Row; update?: Row };

// Deterministic persistence double, not an imitation of the acquisition wiring.
// The real source/feed/engagement/scan repositories execute against these tables.
export class AcquisitionDatabaseFixture {
  readonly tables = Object.fromEntries([
    "sourceItem", "feedItem", "feedSignalBaselineSample", "sourceCandidateMemory",
    "sourceItemEngagementSnapshot", "sourceItemEngagementObservation",
    "sourceItemEngagementDailyRollup", "scanAttempt", "cursorCheckpoint",
    "scanLeaseEntry", "scanJob", "scanFailureQueueEntry", "conversationUnit",
    "conversationSignalBaselineSample",
  ].map((name) => [name, new FixtureTable()]));
  readonly accesses: ReturnType<typeof currentDatabaseAccess>[] = [];
  failSnapshots = false;

  readonly connection = {
    ...this.tables,
    $transaction: async <T>(operation: (connection: unknown) => Promise<T>) => {
      this.accesses.push(currentDatabaseAccess());
      const before = Object.fromEntries(Object.entries(this.tables).map(
        ([name, table]) => [name, structuredClone(table.rows)],
      ));
      this.tables.sourceItemEngagementSnapshot!.failWrites = this.failSnapshots;
      try {
        return await operation(this.connection);
      } catch (error) {
        for (const [name, rows] of Object.entries(before)) this.tables[name]!.rows = rows;
        throw error;
      }
    },
  } as unknown as PrismaIngestionWorkerConnection;

  rows(name: string): Row[] { return this.tables[name]!.rows; }
}

class FixtureTable {
  rows: Row[] = [];
  failWrites = false;

  async findMany(args: Args = {}) {
    return this.rows.filter((row) => matches(row, args.where));
  }
  async findFirst(args: Args) { return (await this.findMany(args))[0] ?? null; }
  async findUnique(args: Args) { return this.findFirst(args); }
  async count(args: Args) { return (await this.findMany(args)).length; }
  async create(args: Args) {
    this.requireWrites();
    const row = { createdAt: new Date(), updatedAt: new Date(), seenCount: 1, ...args.data };
    this.rows.push(row);
    return row;
  }
  async createMany(args: { data: readonly Row[] }) {
    for (const data of args.data) await this.create({ data });
    return { count: args.data.length };
  }
  async update(args: Args) {
    this.requireWrites();
    const row = await this.findFirst(args);
    if (row === null) throw new Error("Fixture update target is missing");
    for (const [key, value] of Object.entries(args.data ?? {})) {
      row[key] = isRecord(value) && typeof value.increment === "number"
        ? Number(row[key] ?? 0) + value.increment : value;
    }
    return row;
  }
  async upsert(args: Args) {
    return await this.findFirst(args) === null
      ? this.create({ data: args.create })
      : this.update({ where: args.where, data: args.update });
  }
  async deleteMany(args: Args) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matches(row, args.where));
    return { count: before - this.rows.length };
  }
  private requireWrites() {
    if (this.failWrites) throw new Error("Fixture engagement persistence unavailable");
  }
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (!isRecord(expected)) return row[key] === expected;
    if ("in" in expected) return (expected.in as unknown[]).includes(row[key]);
    if ("lt" in expected) return Number(row[key]) < Number(expected.lt);
    if ("lte" in expected) return Number(row[key]) <= Number(expected.lte);
    return matches(row, expected); // Prisma compound unique selector.
  });
}
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !(value instanceof Date);
}
