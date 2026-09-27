// This standalone verifier runs without the TypeScript build. Keep these
// identities aligned with subscription-runtime-installation.ts.
export const approvedCodexRuntimeVersion = "0.1.0-main.42-sm.3";
export const approvedMimoRuntimeVersion = "0.1.0-main.40-sm-mimo.5";
export const approvedLauncherSha256 =
  "30f7bcac89439ea0eecb3260ee79924fcfab25a87e51be237e289c51f2ccddc1";

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
      : attestation.model !== "gpt-5.6-sol") ||
    attestation.reasoningEffort !== expectedEffort ||
    attestation.runtimeEngine !== "subscription-runtime-cli" ||
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
      value.physicalModel === "mimo-v2.6-pro") &&
    value.provider === "codex" &&
    value.runtime === "subscription-runtime-cli" &&
    concreteVersion(value.runtimeVersion) &&
    (value.physicalModel !== "mimo-v2.6-pro" ||
      (value.runtimeVersion === approvedMimoRuntimeVersion &&
        value.reasoningEffort === "high" &&
        value.launcherSha256 === approvedLauncherSha256)) &&
    (value.reasoningEffort === "high" ||
      (allowLegacy && value.reasoningEffort === "xhigh")) &&
    sha256(value.launcherSha256) &&
    sha256(value.summaryContentSha256) &&
    sha256(value.topicMapSha256) &&
    sha256(value.attestationSetSha256) &&
    Number.isInteger(value.completedTaskCount) &&
    value.completedTaskCount >= 2 &&
    validTopicIdentity(value.topicLabeler, value, allowLegacy);
}

function validTopicIdentity(topic, parent, allowLegacy) {
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
