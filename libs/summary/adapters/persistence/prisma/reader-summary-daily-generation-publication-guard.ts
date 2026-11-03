import { createHash } from "node:crypto";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { stableReaderSummaryPublicationJson as stableJson } from "./reader-summary-publication-json-comparison";
import type { ReaderValueSourceSnapshot } from "@social-monitor/relevance/domain/reader-value/reader-value-source";
import type { ReaderSummaryArtifactProps } from "../../../domain";
import { buildReaderSummaryCoveragePlan } from "../../../domain/services/reader-summary-coverage-plan";
import { dailyEditorialCoveragePlan, validateDailyEditorialProof } from
  "../../../domain/services/reader-summary-daily-editorial-plan";
import { dailyReaderSummaryGenerationEvidence } from "../../evidence/reader-summary-daily-generation-evidence";
import { buildAdaptiveReaderSummaryEvidence } from "../../model/openai-responses-reader-summary-adaptive-evidence";
import { buildDailyEditorialPromptFromEvidence } from "../../model/reader-summary-daily-editorial-model";

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
    const editorialProfile = params.artifact.lineage.promptVersion ===
      "reader_summary.prompt.2026-11-03.daily_editorial_v1";
    const proofPlan = params.artifact.dailyEditorialPlan;
    if (editorialProfile !== (proofPlan !== undefined)) return false;
    const editorial = proofPlan === undefined ? undefined :
      validateDailyEditorialProof(proofPlan, expected.proof);
    if (editorial !== undefined) {
      const planSha = canonicalJsonSha256(editorial.plan);
      const editorEvidence = buildAdaptiveReaderSummaryEvidence(selection, buildReaderSummaryCoveragePlan(selection));
      const requestSha = createHash("sha256").update(
        buildDailyEditorialPromptFromEvidence(expected.proof, editorEvidence)).digest("hex");
      if (planSha !== editorial.editorOutputSha256 ||
          requestSha !== editorial.editorRequestSha256) return false;
    }
    const coverage = editorial === undefined ? buildReaderSummaryCoveragePlan(selection) :
      dailyEditorialCoveragePlan(editorial.plan, selection);
    const evidence = buildAdaptiveReaderSummaryEvidence(selection, coverage);
    return stableJson(actual) === stableJson(expected.proof) && sent !== undefined &&
      stableJson(sent.evidence) === stableJson(evidence.map(item => ({ feedItemId: item.feedItemId,
        sha256: createHash("sha256").update(JSON.stringify(item)).digest("hex") })));
  } catch {
    return false;
  }
}
