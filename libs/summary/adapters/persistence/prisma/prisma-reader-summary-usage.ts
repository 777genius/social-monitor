import type { ReaderSummaryUsage } from "../../../domain";
import { requireObject } from "./prisma-reader-summary-payload-parsers";

export const normalizeReaderSummaryUsage = (input: unknown): ReaderSummaryUsage => {
  const value = requireObject<Record<string, unknown>>(
    input,
    "Reader summary usage",
  );
  const inputTokens = nullableTokenCount(value.inputTokens);
  const outputTokens = nullableTokenCount(value.outputTokens);
  if ((inputTokens === null) !== (outputTokens === null)) {
    throw new Error(
      "Reader summary token usage must be complete or unavailable",
    );
  }
  if (
    typeof value.estimatedCostUsd !== "number" ||
    !Number.isFinite(value.estimatedCostUsd) ||
    value.estimatedCostUsd < 0
  ) {
    throw new Error("Reader summary estimated cost must be non-negative");
  }
  return { inputTokens, outputTokens, estimatedCostUsd: value.estimatedCostUsd };
};

const nullableTokenCount = (value: unknown): number | null => {
  if (value === null) return null;
  if (Number.isSafeInteger(value) && (value as number) >= 0) {
    return value as number;
  }
  throw new Error(
    "Reader summary token usage must be a non-negative integer or null",
  );
};
