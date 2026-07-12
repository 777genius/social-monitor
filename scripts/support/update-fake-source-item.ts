import type { PrismaIngestionClient } from "../../libs/ingestion/adapters/persistence/prisma/prisma-ingestion-client";
import type { PrismaSourceItemRecord } from "../../libs/ingestion/adapters/persistence/prisma/prisma-ingestion-records";

type UpdateSourceItem = NonNullable<
  PrismaIngestionClient["sourceItem"]["update"]
>;

export const updateFakeSourceItem = (
  items: Map<string, PrismaSourceItemRecord>,
  args: Parameters<UpdateSourceItem>[0],
): PrismaSourceItemRecord => {
  const existing = items.get(args.where.id);
  if (existing === undefined) {
    throw new Error(`Missing source item ${args.where.id}`);
  }
  const record: PrismaSourceItemRecord = {
    ...existing,
    ...args.data,
    authorHandle: args.data.authorHandle ?? existing.authorHandle,
    metadata: args.data.metadata ?? existing.metadata,
  };
  items.set(record.id, record);
  return record;
};
