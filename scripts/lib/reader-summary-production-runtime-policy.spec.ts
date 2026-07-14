import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY,
  readerSummaryProductionMinimumCaptureTimeoutMs,
  readerSummaryProductionMinimumOrchestrationTimeoutMs,
} from "./reader-summary-production-runtime-policy";

describe("reader summary production runtime policy", () => {
  it("budgets capture and outer orchestration for every sequential LLM stage", () => {
    expect(
      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelMaximumAttempts,
    ).toBe(2);
    expect(
      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicMapMaximumAttempts,
    ).toBe(2);
    expect(
      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicLabelerTimeoutMs,
    ).toBeGreaterThanOrEqual(900_000);
    expect(
      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.captureTimeoutMs,
    ).toBeGreaterThanOrEqual(readerSummaryProductionMinimumCaptureTimeoutMs());
    expect(
      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.orchestrationTimeoutMs,
    ).toBeGreaterThanOrEqual(
      readerSummaryProductionMinimumOrchestrationTimeoutMs(),
    );
  });

  it("keeps the npm process timeout aligned with the runtime policy", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { readonly scripts?: Readonly<Record<string, string>> };
    const captureTimeout = readScriptTimeout(
      packageJson.scripts?.["capture:durable-reader-summary"],
    );
    const orchestrationTimeout = readScriptTimeout(
      packageJson.scripts?.["run:reader-summary-production-day"],
    );
    const collectionTimeout = readScriptTimeout(
      packageJson.scripts?.["run:reader-summary-clean-real-day-collection"],
    );

    expect(captureTimeout).toBe(
      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.captureTimeoutMs,
    );
    expect(orchestrationTimeout).toBe(
      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.orchestrationTimeoutMs,
    );
    expect(collectionTimeout).toBeGreaterThanOrEqual(
      READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.collectionReadinessDelayMs +
        READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.collectionExecutionGraceMs,
    );
  });
});

const readScriptTimeout = (command: string | undefined): number =>
  Number(command?.match(/--timeout-ms\s+(\d+)/u)?.[1]);
