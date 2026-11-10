import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { ReaderSummaryUsageContext, ReaderSummaryUsageScope } from
  "../../application/contracts/reader-summary-usage-scope";

type ActiveUsageContext = ReaderSummaryUsageContext & { readonly runId: string };
const storage = new AsyncLocalStorage<ActiveUsageContext>();

export const readerSummaryUsageScope: ReaderSummaryUsageScope = {
  run: (context, action) => storage.run({ ...context, runId: randomUUID() }, action),
};

export const currentReaderSummaryUsage = (): ActiveUsageContext | undefined => storage.getStore();
