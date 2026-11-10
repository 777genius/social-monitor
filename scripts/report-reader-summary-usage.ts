import { readFileSync } from "node:fs";

type Item = {
  version: number; targetDate: string | null; stage: string | null; model: string | null;
  effort: string | null; identitySource: string; inputTokens: number | null; outputTokens: number | null;
  cachedInputTokens: number | null; usageSource: string;
};
type Totals = {
  targetDate: string | null; stage: string | null; model: string | null; effort: string | null; identitySource: string;
  calls: number; unknownUsage: number; inputTokens: number; outputTokens: number;
  cachedInputTokens: number; unknownCacheCalls: number; estimatedApiUsd: number;
  unpricedCalls: number;
};

// Standard, short-context API rates per million tokens, checked 2026-11-10.
// Subscription billing, cache writes, special service tiers and long context may differ.
const rates: Record<string, readonly [number, number, number]> = {
  "gpt-6.1-terra": [1, 0.05, 5], "gpt-5.6-sol": [4, 0.4, 20],
};

export const summarizeReaderSummaryUsage = (lines: readonly string[]): Totals[] => {
  const groups = new Map<string, Totals>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const item = JSON.parse(line) as Item;
    if (item.version !== 1 || !["runtime_reported", "unavailable"].includes(item.usageSource)) {
      throw new Error("Invalid usage log record");
    }
    const key = JSON.stringify([item.targetDate, item.stage, item.model, item.effort, item.identitySource]);
    const total = groups.get(key) ?? { targetDate: item.targetDate, stage: item.stage, model: item.model,
      effort: item.effort, identitySource: item.identitySource, calls: 0, unknownUsage: 0, inputTokens: 0, outputTokens: 0,
      cachedInputTokens: 0, unknownCacheCalls: 0, estimatedApiUsd: 0, unpricedCalls: 0 };
    total.calls++;
    if (item.usageSource === "unavailable") { total.unknownUsage++; groups.set(key, total); continue; }
    if (!isCount(item.inputTokens) || !isCount(item.outputTokens) ||
      (item.cachedInputTokens !== null && (!isCount(item.cachedInputTokens) || item.cachedInputTokens > item.inputTokens))) {
      throw new Error("Invalid usage token counts");
    }
    total.inputTokens += item.inputTokens;
    total.outputTokens += item.outputTokens;
    const cached = item.cachedInputTokens ?? 0;
    total.cachedInputTokens += cached;
    if (item.cachedInputTokens === null) total.unknownCacheCalls++;
    const rate = item.model ? rates[item.model] : undefined;
    if (!rate || item.identitySource !== "runtime_reported" || item.inputTokens > 272_000) total.unpricedCalls++;
    else total.estimatedApiUsd += ((item.inputTokens - cached) * rate[0] + cached * rate[1] + item.outputTokens * rate[2]) / 1_000_000;
    groups.set(key, total);
  }
  return [...groups.values()];
};

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("Pass one or more reader summary usage JSONL files");
  const lines = files.flatMap((file) => readFileSync(file, "utf8").split("\n"));
  console.log(JSON.stringify({ priceDate: "2026-11-10", priceBasis: "estimated standard API, short context; unknown cache treated as uncached; excludes cache writes and subscription charges",
    groups: summarizeReaderSummaryUsage(lines) }, null, 2));
}
