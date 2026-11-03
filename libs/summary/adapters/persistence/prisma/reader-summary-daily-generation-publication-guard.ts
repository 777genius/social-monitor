import { createHash } from "node:crypto";
import { stableReaderSummaryPublicationJson as stableJson } from "./reader-summary-publication-json-comparison";
import type { ReaderValueSourceSnapshot } from "@social-monitor/relevance/domain/reader-value/reader-value-source";
import type { ReaderSummaryArtifactProps } from "../../../domain";
import { buildReaderSummaryCoveragePlan } from "../../../domain/services/reader-summary-coverage-plan";
import { dailyReaderSummaryGenerationEvidence } from "../../evidence/reader-summary-daily-generation-evidence";
import { buildAdaptiveReaderSummaryEvidence } from "../../model/openai-responses-reader-summary-adaptive-evidence";

/** Called inside the publication transaction, after frozen assessment/config locks. */
export function dailyGenerationPublicationMatches(params:
  Omit<Parameters<typeof dailyReaderSummaryGenerationEvidence>[0], "snapshots"> & {
    readonly snapshots: ReadonlyMap<string, unknown>;
    readonly artifact: ReaderSummaryArtifactProps;
  }): boolean {
  try {
    const expected = dailyReaderSummaryGenerationEvidence({ ...params,
      snapshots: params.snapshots as ReadonlyMap<string, ReaderValueSourceSnapshot> });
    const proof = params.artifact.dailyGenerationInput;
    if (proof === undefined) return false;
    const { sent, ...actual } = proof;
    const selection = { rankingPolicyVersion: "daily-input",
      sourceWindow: params.artifact.sourceWindow, clusters: expected.clusters,
      selectedEvidence: expected.selectedEvidence, dailyGenerationInput: expected.proof };
    const evidence = buildAdaptiveReaderSummaryEvidence(selection, buildReaderSummaryCoveragePlan(selection));
    return stableJson(actual) === stableJson(expected.proof) && sent !== undefined &&
      stableJson(sent.evidence) === stableJson(evidence.map(item => ({ feedItemId: item.feedItemId,
        sha256: createHash("sha256").update(JSON.stringify(item)).digest("hex") })));
  } catch {
    return false;
  }
}
