import {
  assertReaderSummaryWeeklyExactObject,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
} from "./reader-summary-weekly-canonical-json";

type ReviewExecutionBase = Readonly<{
  schemaVersion: 1;
  requestId: string;
  canonicalRequestSha256: string;
  provider: "codex";
  runtimePackageVersion: string;
  launcherSha256: string;
  selectedOutputKind: "structured_output";
  selectedOutputSha256: string;
}>;
export type ReaderSummaryWeeklyReviewExecutionAttestation = ReviewExecutionBase & (
  | Readonly<{
      purpose: "social_monitor.reader_summary.weekly.review" | "social_monitor.reader_summary.weekly.review.v2";
      model: "gpt-5.6-sol";
      reasoningEffort: "high" | "xhigh";
      runtimeEngine: "subscription-runtime-cli";
      gateway?: undefined;
    }>
  | Readonly<{
      purpose: "social_monitor.reader_summary.weekly.review.v2";
      model: "gpt-6.1-terra" | "gpt-6.1-sol" | "gpt-5.6-sol";
      reasoningEffort: "medium" | "low" | "high";
      runtimeEngine: "gateway-llm";
      gateway: Readonly<{
        profileId: string; taskId: string; attempt: number; executionRef: string;
        requestRef: string; accountRef: string; observedModel: string | null; requestSha256: string;
      }>;
    }>
);
const baseKeys = ["schemaVersion", "requestId", "purpose", "canonicalRequestSha256", "provider", "model", "reasoningEffort", "runtimeEngine", "runtimePackageVersion", "launcherSha256", "selectedOutputKind", "selectedOutputSha256"] as const;
const gatewayKeys = ["profileId", "taskId", "attempt", "executionRef", "requestRef", "accountRef", "observedModel", "requestSha256"] as const;
const reference = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

/** Keeps historical CLI canonical bytes unchanged; gateway evidence is a distinct closed shape. */
export const canonicalReaderSummaryWeeklyReviewExecutionAttestation = (
  input: ReaderSummaryWeeklyReviewExecutionAttestation,
  modelResponseSha256: string,
): ReaderSummaryWeeklyReviewExecutionAttestation => {
  const gateway = input.runtimeEngine === "gateway-llm";
  assertReaderSummaryWeeklyExactObject<string>(input, gateway ? [...baseKeys, "gateway"] : baseKeys,
    "weekly review execution attestation", { allowAuthoritativeHashes: true });
  const validIdentity = gateway
    ? input.purpose === "social_monitor.reader_summary.weekly.review.v2" &&
      ((input.model === "gpt-6.1-terra" && input.reasoningEffort === "medium") ||
       (input.model === "gpt-6.1-sol" && input.reasoningEffort === "low") ||
       (input.model === "gpt-5.6-sol" && input.reasoningEffort === "high"))
    : input.runtimeEngine === "subscription-runtime-cli" && input.model === "gpt-5.6-sol" &&
      ((input.purpose === "social_monitor.reader_summary.weekly.review.v2" && input.reasoningEffort === "high") ||
       (input.purpose === "social_monitor.reader_summary.weekly.review" && input.reasoningEffort === "xhigh"));
  if (input.schemaVersion !== 1 || !validIdentity || input.provider !== "codex" ||
      input.selectedOutputKind !== "structured_output" ||
      exactReaderSummaryWeeklySha256(input.selectedOutputSha256, "weekly review selected output hash") !== modelResponseSha256 ||
      typeof input.runtimePackageVersion !== "string" || input.runtimePackageVersion.trim().length === 0 ||
      input.runtimePackageVersion.length > 256) {
    throw new Error("Reader summary weekly review execution attestation is invalid");
  }
  const common = {
    schemaVersion: 1 as const,
    requestId: exactReaderSummaryWeeklyIdentity(input.requestId, "weekly review request id"),
    canonicalRequestSha256: exactReaderSummaryWeeklySha256(input.canonicalRequestSha256, "weekly review canonical request hash"),
    provider: input.provider,
    runtimePackageVersion: input.runtimePackageVersion,
    launcherSha256: exactReaderSummaryWeeklySha256(input.launcherSha256, "weekly review launcher hash"),
    selectedOutputKind: input.selectedOutputKind,
    selectedOutputSha256: modelResponseSha256,
  };
  if (input.runtimeEngine === "gateway-llm") {
    const value = input.gateway;
    assertReaderSummaryWeeklyExactObject(value, gatewayKeys, "weekly review gateway transport", { allowAuthoritativeHashes: true });
    if (value.profileId !== "openai-codex-oauth-responses-v1" ||
        ![value.profileId, value.taskId, value.executionRef, value.requestRef, value.accountRef]
          .every((item) => typeof item === "string" && reference.test(item)) ||
        !Number.isSafeInteger(value.attempt) || value.attempt < 1 ||
        !(value.observedModel === null || (typeof value.observedModel === "string" &&
          (value.observedModel === input.model || (value.observedModel.startsWith(input.model) &&
            /^-\d{4}(?:-\d{2}-\d{2})?$/u.test(value.observedModel.slice(input.model.length)))))) ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(input.runtimePackageVersion)) {
      throw new Error("Reader summary weekly review gateway transport is invalid");
    }
    return deepFreezeReaderSummaryWeekly({ ...common, purpose: input.purpose, model: input.model,
      reasoningEffort: input.reasoningEffort, runtimeEngine: input.runtimeEngine,
      gateway: { ...value, requestSha256: exactReaderSummaryWeeklySha256(value.requestSha256, "weekly review gateway request hash") },
    });
  }
  return deepFreezeReaderSummaryWeekly({ ...common, purpose: input.purpose, model: input.model,
    reasoningEffort: input.reasoningEffort, runtimeEngine: input.runtimeEngine });
};
