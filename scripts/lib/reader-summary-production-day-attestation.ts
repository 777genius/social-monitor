import {
  canonicalJsonSha256,
  isConcreteRuntimePackageVersion,
  isSha256Hex,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

export type ProductionDayExecutedRuntimeProvenance = {
  readonly execution: "attested";
  readonly summaryModel: "agent-runtime";
  readonly physicalModel: "gpt-5.5";
  readonly provider: "codex";
  readonly runtime: "subscription-runtime-cli";
  readonly runtimeVersion: string;
  readonly reasoningEffort: "xhigh";
  readonly launcherSha256: string;
  readonly summaryContentSha256: string;
  readonly topicMapSha256: string;
  readonly attestationSetSha256: string;
  readonly completedTaskCount: number;
  readonly topicLabeler: {
    readonly mode: "agent-runtime";
    readonly physicalModel: "gpt-5.5";
    readonly provider: "codex";
    readonly runtime: "subscription-runtime-cli";
    readonly runtimeVersion: string;
    readonly reasoningEffort: "xhigh";
    readonly launcherSha256: string;
  };
};

export type ProductionDayRuntimeNotExecuted = {
  readonly execution: "not_executed";
  readonly reason: "no_signal";
};

export type ProductionDayRuntimeProvenance =
  ProductionDayExecutedRuntimeProvenance | ProductionDayRuntimeNotExecuted;

type ValidAttestationRecord = {
  readonly taskRole:
    "summary" | "topic_label" | "topic_relation" | "story_relation";
  readonly attempt: string;
  readonly normalizedOutputSha256: string;
  readonly attestation: {
    readonly schemaVersion: 1;
    readonly requestId: string;
    readonly purpose: string;
    readonly canonicalRequestSha256: string;
    readonly provider: "codex";
    readonly model: "gpt-5.5";
    readonly reasoningEffort: "xhigh";
    readonly runtimeEngine: "subscription-runtime-cli";
    readonly runtimePackageVersion: string;
    readonly launcherSha256: string;
    readonly selectedOutputKind: "structured_output" | "output_text";
    readonly selectedOutputSha256: string;
  };
};

export const runtimeProvenanceFromExecutorAttestations = (
  evidence: Record<string, unknown>,
  violations: string[],
): ProductionDayRuntimeProvenance | null => {
  const result = record(evidence.result);
  const selected = result?.selectedFeedItemCount;
  const status = result?.status;
  const raw = evidence.executionAttestations;
  if (!Array.isArray(raw)) {
    violations.push("evidence.executionAttestations must be an array");
    return null;
  }

  if (selected === 0 && status === "no_signal") {
    if (raw.length !== 0) {
      violations.push(
        "no_signal capture must not contain execution attestations",
      );
      return null;
    }
    return { execution: "not_executed", reason: "no_signal" };
  }
  if (
    typeof selected !== "number" ||
    !Number.isInteger(selected) ||
    selected < 1 ||
    status !== "completed"
  ) {
    violations.push(
      "not_executed is allowed only when selectedFeedItemCount is 0 and status is no_signal",
    );
    return null;
  }

  const records = raw.flatMap((value, index) =>
    validateRecord(value, index, violations),
  );
  if (records.length !== raw.length) {
    return null;
  }
  const requestIds = new Set(
    records.map((value) => value.attestation.requestId),
  );
  if (requestIds.size !== records.length) {
    violations.push("execution attestations contain a duplicate requestId");
  }
  const summaries = records.filter((value) => value.taskRole === "summary");
  const topicLabels = records.filter(
    (value) => value.taskRole === "topic_label",
  );
  if (summaries.length !== 1) {
    violations.push("evidence requires exactly one final summary attestation");
  }
  if (topicLabels.length !== 1) {
    violations.push(
      "evidence requires exactly one winning topic label attestation",
    );
  }
  const winningTopicAttempt = topicLabels[0]?.attempt;
  if (
    winningTopicAttempt !== undefined &&
    records.some(
      (value) =>
        (value.taskRole === "topic_label" ||
          value.taskRole === "topic_relation") &&
        value.attempt !== winningTopicAttempt,
    )
  ) {
    violations.push(
      "topic attestations must belong to the winning retry attempt",
    );
  }
  const taskAttempts = records.map(
    (value) => `${value.taskRole}\u0000${value.attempt}`,
  );
  if (new Set(taskAttempts).size !== taskAttempts.length) {
    violations.push("execution attestations contain duplicate task attempts");
  }
  const identities = new Set(
    records.map((value) =>
      [
        value.attestation.provider,
        value.attestation.model,
        value.attestation.reasoningEffort,
        value.attestation.runtimeEngine,
        value.attestation.runtimePackageVersion,
        value.attestation.launcherSha256,
      ].join("\u0000"),
    ),
  );
  if (identities.size !== 1) {
    violations.push(
      "all observed summary, topic and relation tasks must agree",
    );
  }
  if (violations.length > 0 || records.length === 0) {
    return null;
  }

  const identity = records[0]!.attestation;
  const durableReadback = record(evidence.durableReadback);
  const attestationSetSha256 = canonicalJsonSha256(records);
  if (
    durableReadback === null ||
    !isSha256Hex(durableReadback.summaryContentSha256) ||
    !isSha256Hex(durableReadback.topicMapSha256) ||
    durableReadback.executionAttestationSetSha256 !== attestationSetSha256
  ) {
    violations.push(
      "durable readback hashes must bind summary, topic map and final attestation set",
    );
    return null;
  }
  return {
    execution: "attested",
    summaryModel: "agent-runtime",
    physicalModel: "gpt-5.5",
    provider: "codex",
    runtime: "subscription-runtime-cli",
    runtimeVersion: identity.runtimePackageVersion,
    reasoningEffort: "xhigh",
    launcherSha256: identity.launcherSha256,
    summaryContentSha256: durableReadback.summaryContentSha256,
    topicMapSha256: durableReadback.topicMapSha256,
    attestationSetSha256,
    completedTaskCount: records.length,
    topicLabeler: {
      mode: "agent-runtime",
      physicalModel: "gpt-5.5",
      provider: "codex",
      runtime: "subscription-runtime-cli",
      runtimeVersion: identity.runtimePackageVersion,
      reasoningEffort: "xhigh",
      launcherSha256: identity.launcherSha256,
    },
  };
};

export const validateFrontendRuntimeConsistency = (
  frontend: Record<string, unknown>,
  provenance: ProductionDayRuntimeProvenance,
  violations: string[],
): void => {
  const artifact = record(frontend.readerSummaryArtifact);
  const lineage = record(artifact?.lineage);
  const content = record(artifact?.content);
  const topicMap = record(content?.topicMap);
  if (artifact === null || lineage === null || topicMap === null) {
    violations.push("frontend runtime consistency fields are missing");
    return;
  }
  if (provenance.execution === "not_executed") {
    return;
  }
  if (
    lineage.providerVersion !== provenance.summaryModel ||
    lineage.modelVersion !==
      `${provenance.provider}:${provenance.physicalModel}:${provenance.reasoningEffort}` ||
    topicMap.generatedBy !== provenance.topicLabeler.mode ||
    canonicalJsonSha256(content) !== provenance.summaryContentSha256 ||
    canonicalJsonSha256(topicMap) !== provenance.topicMapSha256
  ) {
    violations.push(
      "frontend lineage and durable content hashes must agree with executor attestations",
    );
  }
};

export const isProductionSubscriptionRuntimeProvenance = (
  value: unknown,
): value is ProductionDayRuntimeProvenance => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.execution === "not_executed") {
    return value.reason === "no_signal";
  }
  return (
    value.execution === "attested" &&
    value.summaryModel === "agent-runtime" &&
    value.physicalModel === "gpt-5.5" &&
    value.provider === "codex" &&
    value.runtime === "subscription-runtime-cli" &&
    isConcreteRuntimePackageVersion(value.runtimeVersion) &&
    value.reasoningEffort === "xhigh" &&
    isSha256Hex(value.launcherSha256) &&
    isSha256Hex(value.summaryContentSha256) &&
    isSha256Hex(value.topicMapSha256) &&
    isSha256Hex(value.attestationSetSha256) &&
    typeof value.completedTaskCount === "number" &&
    Number.isInteger(value.completedTaskCount) &&
    value.completedTaskCount >= 2 &&
    validTopicIdentity(value.topicLabeler, value)
  );
};

export const runtimeProvenanceEqual = (
  value: unknown,
  expected: ProductionDayRuntimeProvenance,
): boolean =>
  isProductionSubscriptionRuntimeProvenance(value) &&
  canonicalJsonSha256(value) === canonicalJsonSha256(expected);

const validateRecord = (
  value: unknown,
  index: number,
  violations: string[],
): readonly ValidAttestationRecord[] => {
  const item = record(value);
  const attestation = record(item?.attestation);
  const label = `evidence.executionAttestations[${index}]`;
  if (item === null || attestation === null) {
    violations.push(`${label} must be a typed attestation record`);
    return [];
  }
  const taskRole = item.taskRole;
  const attempt = item.attempt;
  const normalizedOutputSha256 = item.normalizedOutputSha256;
  if (
    !isTaskRole(taskRole) ||
    !nonEmpty(attempt) ||
    !isSha256Hex(normalizedOutputSha256)
  ) {
    violations.push(`${label} route is malformed`);
    return [];
  }
  if (
    attestation.schemaVersion !== 1 ||
    !nonEmpty(attestation.requestId) ||
    !nonEmpty(attestation.purpose) ||
    !isSha256Hex(attestation.canonicalRequestSha256) ||
    attestation.provider !== "codex" ||
    attestation.model !== "gpt-5.5" ||
    attestation.reasoningEffort !== "xhigh" ||
    attestation.runtimeEngine !== "subscription-runtime-cli" ||
    !isConcreteRuntimePackageVersion(attestation.runtimePackageVersion) ||
    !isSha256Hex(attestation.launcherSha256) ||
    !isOutputKind(attestation.selectedOutputKind) ||
    !isSha256Hex(attestation.selectedOutputSha256) ||
    !purposeMatches(taskRole, attempt, attestation.purpose)
  ) {
    violations.push(`${label} is malformed or mismatched`);
    return [];
  }
  return [
    {
      taskRole,
      attempt,
      normalizedOutputSha256,
      attestation: attestation as ValidAttestationRecord["attestation"],
    },
  ];
};

const purposeMatches = (
  role: ValidAttestationRecord["taskRole"],
  attempt: string,
  purpose: unknown,
): boolean => {
  if (role === "summary") {
    return (
      (attempt === "primary" &&
        purpose === "social_monitor.reader_summary.generate") ||
      (attempt === "repair" &&
        purpose === "social_monitor.reader_summary.repair")
    );
  }
  return purpose === purposeByRole[role];
};

const purposeByRole = {
  topic_label: "social_monitor.reader_summary.topic_map.label",
  topic_relation: "social_monitor.reader_summary.topic_map.verify_relations",
  story_relation: "social_monitor.reader_summary.verify_story_relations",
} as const;

const validTopicIdentity = (
  value: unknown,
  parent: Record<string, unknown>,
): boolean =>
  isRecord(value) &&
  value.mode === "agent-runtime" &&
  value.physicalModel === parent.physicalModel &&
  value.provider === parent.provider &&
  value.runtime === parent.runtime &&
  value.runtimeVersion === parent.runtimeVersion &&
  value.reasoningEffort === parent.reasoningEffort &&
  value.launcherSha256 === parent.launcherSha256;

const isTaskRole = (
  value: unknown,
): value is ValidAttestationRecord["taskRole"] =>
  value === "summary" ||
  value === "topic_label" ||
  value === "topic_relation" ||
  value === "story_relation";

const isOutputKind = (value: unknown): boolean =>
  value === "structured_output" || value === "output_text";

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const record = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
