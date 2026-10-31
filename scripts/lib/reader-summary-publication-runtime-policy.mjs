// This standalone verifier runs without the TypeScript build. Keep these
// identities aligned with subscription-runtime-installation.ts.
export const approvedCodexRuntimeVersion = "0.1.0-main.42-sm.3";
export const approvedMimoRuntimeVersion = "0.1.0-main.40-sm-mimo.12";
export const approvedLauncherSha256 =
  "c2a9d76458f776b851c7f15d31f13c96d44d2271d47a7eeae60cd3438b34b0d6";
// Keep aligned with isAgentRuntimeEngine/isAttestedRuntimeIdentity in
// libs/contracts/grpc/agent_runtime/v1/execution-attestation.ts.
export const cliRuntimeEngine = "subscription-runtime-cli";
export const gatewayRuntimeEngine = "gateway-llm";
export const isAttestedRuntimeEngine = (value) =>
  value === cliRuntimeEngine || value === gatewayRuntimeEngine;
const gatewayReference = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const gatewayTransportKeys =
  "accountRef,attempt,executionRef,observedModel,profileId,requestRef,requestSha256,taskId";

// Keep aligned with isGatewayReaderSummaryExecution in
// libs/summary/adapters/model/active-reader-summary-generation-profile.ts.
// Gateway-only models never reuse the CLI model names and carry the route
// effort: "default" when no reasoning control was sent. A gateway-only Codex
// model keeps one of its allowed Codex efforts from
// libs/summary/adapters/model/codex-reader-summary-route.ts.
const gatewayModelId = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const gatewayEfforts = new Set(
  ["default", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const codexGatewayOnlyRoutes = Object.freeze([
  { model: "gpt-6.1-sol", reasoningEffort: "low" },
]);
export const isGatewayModel = (value) => typeof value === "string" &&
  gatewayModelId.test(value) && value !== "gpt-5.6-sol" &&
  value !== "mimo-v2.6-pro";
const codexGatewayEffortMatches = (model, reasoningEffort) =>
  !codexGatewayOnlyRoutes.some((route) => route.model === model) ||
  codexGatewayOnlyRoutes.some((route) =>
    route.model === model && route.reasoningEffort === reasoningEffort);
export const isGatewayExecution = (runtimeEngine, model, reasoningEffort) =>
  runtimeEngine === gatewayRuntimeEngine && isGatewayModel(model) &&
  gatewayEfforts.has(reasoningEffort) &&
  codexGatewayEffortMatches(model, reasoningEffort);

export const observedModelMatches = (requested, observed) =>
  observed === null ||
  (typeof requested === "string" && typeof observed === "string" &&
    requested.length > 0 &&
    (observed === requested || (observed.startsWith(requested) &&
      /^-\d{4}(?:-\d{2}-\d{2})?$/u.test(observed.slice(requested.length)))));

/** CLI attestations carry no gateway block; gateway-llm must carry its attempt. */
export function validRuntimeTransport(attestation) {
  if (attestation.runtimeEngine === cliRuntimeEngine) {
    return attestation.gateway === undefined;
  }
  const gateway = attestation.gateway;
  return attestation.runtimeEngine === gatewayRuntimeEngine && object(gateway) &&
    Object.keys(gateway).sort().join(",") === gatewayTransportKeys &&
    ["profileId", "taskId", "executionRef", "requestRef", "accountRef"]
      .every((key) => typeof gateway[key] === "string" &&
        gatewayReference.test(gateway[key])) &&
    Number.isSafeInteger(gateway.attempt) && gateway.attempt >= 1 &&
    sha256(gateway.requestSha256) &&
    observedModelMatches(attestation.model, gateway.observedModel);
}

const legacyPurposes = Object.freeze({
  topic_label: "social_monitor.reader_summary.topic_map.label",
  topic_relation: "social_monitor.reader_summary.topic_map.verify_relations",
  story_relation: "social_monitor.reader_summary.verify_story_relations",
  related_topic_relation:
    "social_monitor.reader_summary.verify_related_topic_relations",
});
const activePurposes = Object.freeze({
  topic_label: "social_monitor.reader_summary.topic_map.label.v2",
  topic_relation: "social_monitor.reader_summary.topic_map.verify_relations.v2",
  story_relation: "social_monitor.reader_summary.verify_story_relations.v2",
  related_topic_relation:
    "social_monitor.reader_summary.verify_related_topic_relations.v2",
});

export function validatePublicationAttestationRecord(record, allowLegacy) {
  if (!object(record) || !object(record.attestation)) {
    throw new Error("execution attestation record must be an object");
  }
  const attestation = record.attestation;
  const legacySummaryPurpose = record.attempt === "primary"
    ? "social_monitor.reader_summary.generate"
    : record.attempt === "repair"
      ? "social_monitor.reader_summary.repair"
      : undefined;
  const activeSummaryPurpose = record.attempt === "primary"
    ? "social_monitor.reader_summary.generate.v2"
    : record.attempt === "repair"
      ? "social_monitor.reader_summary.repair.v2"
      : undefined;
  const legacyPurpose = record.taskRole === "summary"
    ? legacySummaryPurpose
    : legacyPurposes[record.taskRole];
  const activePurpose = record.taskRole === "summary"
    ? activeSummaryPurpose
    : activePurposes[record.taskRole];
  const expectedEffort = activePurpose !== undefined &&
    attestation.purpose === activePurpose
    ? "high"
    : allowLegacy && legacyPurpose !== undefined &&
      attestation.purpose === legacyPurpose
      ? "xhigh"
      : undefined;
  if (
    typeof record.taskRole !== "string" ||
    (record.taskRole !== "summary" &&
      !Object.hasOwn(activePurposes, record.taskRole)) ||
    (record.taskRole === "summary" && activeSummaryPurpose === undefined) ||
    typeof record.attempt !== "string" || record.attempt.length === 0 ||
    !sha256(record.normalizedOutputSha256) ||
    expectedEffort === undefined ||
    attestation.schemaVersion !== 1 ||
    typeof attestation.purpose !== "string" ||
    attestation.purpose.trim().length === 0 ||
    typeof attestation.requestId !== "string" ||
    attestation.requestId.length === 0 ||
    !sha256(attestation.canonicalRequestSha256) ||
    attestation.provider !== "codex" ||
    (attestation.model === "mimo-v2.6-pro"
      ? expectedEffort !== "high" ||
        attestation.runtimePackageVersion !== approvedMimoRuntimeVersion ||
        attestation.launcherSha256 !== approvedLauncherSha256
      : isGatewayModel(attestation.model)
        ? expectedEffort !== "high" || !isGatewayExecution(
          attestation.runtimeEngine, attestation.model, attestation.reasoningEffort)
        : attestation.model !== "gpt-5.6-sol") ||
    (!isGatewayModel(attestation.model) &&
      attestation.reasoningEffort !== expectedEffort) ||
    !isAttestedRuntimeEngine(attestation.runtimeEngine) ||
    (attestation.model === "mimo-v2.6-pro" &&
      attestation.runtimeEngine !== cliRuntimeEngine) ||
    !validRuntimeTransport(attestation) ||
    !concreteVersion(attestation.runtimePackageVersion) ||
    !sha256(attestation.launcherSha256) ||
    attestation.selectedOutputKind !== "structured_output" ||
    !sha256(attestation.selectedOutputSha256)
  ) {
    throw new Error("executor execution attestation is malformed or mismatched");
  }
}

export function isPublicationRuntimeProvenance(value, allowLegacy = false) {
  if (object(value) && value.execution === "not_executed") {
    return value.reason === "no_signal";
  }
  return object(value) && object(value.topicLabeler) &&
    value.execution === "attested" &&
    value.summaryModel === "agent-runtime" &&
    (value.physicalModel === "gpt-5.6-sol" ||
      value.physicalModel === "mimo-v2.6-pro" || gatewayProvenance(value)) &&
    value.provider === "codex" &&
    isAttestedRuntimeEngine(value.runtime) &&
    (value.physicalModel !== "mimo-v2.6-pro" || value.runtime === cliRuntimeEngine) &&
    concreteVersion(value.runtimeVersion) &&
    (value.physicalModel !== "mimo-v2.6-pro" ||
      (value.runtimeVersion === approvedMimoRuntimeVersion &&
        value.reasoningEffort === "high" &&
        value.launcherSha256 === approvedLauncherSha256)) &&
    (value.reasoningEffort === "high" || gatewayProvenance(value) ||
      (allowLegacy && value.reasoningEffort === "xhigh")) &&
    sha256(value.launcherSha256) &&
    sha256(value.summaryContentSha256) &&
    sha256(value.topicMapSha256) &&
    sha256(value.attestationSetSha256) &&
    Number.isInteger(value.completedTaskCount) &&
    value.completedTaskCount >= 2 &&
    validTopicIdentity(value.topicLabeler, value, allowLegacy);
}

const gatewayProvenance = (value) => isGatewayExecution(
  value.runtime, value.physicalModel, value.reasoningEffort);

function validTopicIdentity(topic, parent, allowLegacy) {
  if (gatewayProvenance(parent)) {
    return topic.mode === "agent-runtime" &&
      ["physicalModel", "provider", "runtime", "runtimeVersion",
        "reasoningEffort", "launcherSha256"]
        .every((key) => topic[key] === parent[key]);
  }
  return topic.mode === "agent-runtime" &&
    (topic.physicalModel === "gpt-5.6-sol" ||
      topic.physicalModel === "mimo-v2.6-pro") &&
    topic.provider === parent.provider &&
    topic.runtime === parent.runtime &&
    concreteVersion(topic.runtimeVersion) &&
    (parent.physicalModel === "mimo-v2.6-pro"
      ? (topic.physicalModel === "mimo-v2.6-pro"
        ? topic.runtimeVersion === approvedMimoRuntimeVersion
        : topic.runtimeVersion === approvedCodexRuntimeVersion)
      : topic.physicalModel === "gpt-5.6-sol" &&
        topic.runtimeVersion === parent.runtimeVersion) &&
    (topic.reasoningEffort === "high" ||
      (parent.physicalModel !== "mimo-v2.6-pro" && allowLegacy &&
        topic.reasoningEffort === "xhigh")) &&
    (parent.physicalModel === "mimo-v2.6-pro" ||
      topic.reasoningEffort === parent.reasoningEffort) &&
    topic.launcherSha256 === parent.launcherSha256;
}

const object = (value) => value !== null &&
  typeof value === "object" && !Array.isArray(value);
const sha256 = (value) => typeof value === "string" &&
  /^[0-9a-f]{64}$/u.test(value);
const concreteVersion = (value) => typeof value === "string" &&
  value !== "unknown" &&
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value);
