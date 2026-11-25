import { AsyncLocalStorage } from "node:async_hooks";
import type { IdGenerator } from "@social-monitor/shared-kernel";
import type { ReaderSummaryUsageContext, ReaderSummaryUsageScope } from
  "../../application/contracts/reader-summary-usage-scope";

type ActiveUsageContext = ReaderSummaryUsageContext & { readonly runId: string };
const storage = new AsyncLocalStorage<ActiveUsageContext>();

export const createReaderSummaryUsageScope = (ids: IdGenerator): ReaderSummaryUsageScope => ({
  run: (context, action) => storage.run({ ...context, runId: ids.generate() }, action),
});

export const currentReaderSummaryUsage = (): ActiveUsageContext | undefined => storage.getStore();
