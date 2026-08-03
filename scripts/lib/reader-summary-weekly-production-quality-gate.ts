import type {
  ReaderSummaryWeeklyEditorialQualityMetrics,
  ReaderSummaryWeeklyEditorialQualityResult,
} from "../../libs/summary/domain/policies/reader-summary-weekly-editorial-quality-policy";

export type DeterministicWeeklyQualityGate = Readonly<{
  schemaVersion: "reader_summary.weekly_production_quality_gate.v1";
  evaluator: "deterministic";
  decision: "allow";
  checks: Readonly<{
    editorialPolicyPassed: true;
    weeklySynthesisIsCoherent: true;
    synthesisCitesAtLeastThreeDays: true;
    synthesisCitesMultipleProviders: true;
    synthesisDayDominanceIsControlled: true;
    synthesisProviderDominanceIsControlled: true;
  }>;
  metrics: ReaderSummaryWeeklyEditorialQualityMetrics;
}>;

export type WeeklyProductionCanary = Readonly<{
  schemaVersion: "reader_summary.weekly_production_canary.v1";
  mode: "fail_closed";
  status: "passed";
  artifactWriteAuthorized: true;
  qualityGateSha256: string;
}>;

export const deterministicWeeklyQualityGate = (
  editorialQuality: ReaderSummaryWeeklyEditorialQualityResult,
): DeterministicWeeklyQualityGate => {
  const checks = {
    editorialPolicyPassed:
      editorialQuality.blockingPassed &&
      editorialQuality.publicationDecision === "allow",
    weeklySynthesisIsCoherent:
      editorialQuality.qualityGates.weeklySynthesisIsCoherent,
    synthesisCitesAtLeastThreeDays:
      editorialQuality.qualityGates.synthesisCitationsSpanAtLeastThreeDays,
    synthesisCitesMultipleProviders:
      editorialQuality.qualityGates.synthesisCitationsSpanMultipleProviders,
    synthesisDayDominanceIsControlled:
      editorialQuality.qualityGates.synthesisDayDominanceIsControlled,
    synthesisProviderDominanceIsControlled:
      editorialQuality.qualityGates.synthesisProviderDominanceIsControlled,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedChecks.length > 0) {
    throw new Error(
      `Reader summary weekly production quality canary blocked artifact write: ${failedChecks.join(
        ", ",
      )}`,
    );
  }
  return Object.freeze({
    schemaVersion: "reader_summary.weekly_production_quality_gate.v1",
    evaluator: "deterministic",
    decision: "allow",
    checks: Object.freeze({
      editorialPolicyPassed: true,
      weeklySynthesisIsCoherent: true,
      synthesisCitesAtLeastThreeDays: true,
      synthesisCitesMultipleProviders: true,
      synthesisDayDominanceIsControlled: true,
      synthesisProviderDominanceIsControlled: true,
    }),
    metrics: Object.freeze({ ...editorialQuality.metrics }),
  });
};

export const weeklyProductionCanary = (
  qualityGateSha256: string,
): WeeklyProductionCanary => Object.freeze({
  schemaVersion: "reader_summary.weekly_production_canary.v1",
  mode: "fail_closed",
  status: "passed",
  artifactWriteAuthorized: true,
  qualityGateSha256,
});
