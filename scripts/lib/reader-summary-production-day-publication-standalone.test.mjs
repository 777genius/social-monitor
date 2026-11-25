import assert from "node:assert/strict";
import test from "node:test";

import {
  legacyLiveQualityGateNames,
  publicationQualityContract,
} from "./reader-summary-publication-quality-contract.mjs";
import { validateDailyModelExecution } from
  "./reader-summary-production-day-model-telemetry-verifier.mjs";
import { dailySourceAuthority } from
  "./reader-summary-production-day-publication-fixture.mjs";

test("rejects historical-incomplete audit telemetry paired with artifact 0/0", () => {
  const readerSummaryId = "11111111-1111-4111-8111-111111111111";
  const readerSummaryJobId = "22222222-2222-4222-8222-222222222222";
  const authority = dailySourceAuthority(true);
  const modelExecution = {
    ...authority.modelExecution,
    modelJobIdentity: authority.modelJobIdentity,
    receiptSha256: authority.receiptSha256,
    readerSummaryJobId,
    readerSummaryArtifactId: readerSummaryId,
  };
  assert.throws(() => validateDailyModelExecution(
    modelExecution,
    { provenance: { dailySourceAuthority: authority } },
    { readerSummaryArtifact: { usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    } } },
    {
      readerSummaryJobId,
      readerSummaryId,
      runtimeProvenance: {
        provider: "codex",
        physicalModel: "gpt-5.6-sol",
        reasoningEffort: "high",
      },
    },
    "current",
    "historical-regeneration",
  ), /not artifact-bound/u);
});

test("rejects the legacy live contract outside its in-flight date", () => {
  assert.equal(
    publicationQualityContract({
      qualityGates: Object.fromEntries(
        legacyLiveQualityGateNames.map((name) => [name, true]),
      ),
      provenance: { mode: "live-production" },
      model: { liveCollection: true },
      expectedDate: "2026-07-21",
    }),
    null,
  );
});
