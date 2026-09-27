import assert from "node:assert/strict";
import test from "node:test";

import {
  approvedCodexRuntimeVersion,
  approvedLauncherSha256,
  approvedMimoRuntimeVersion,
  isPublicationRuntimeProvenance,
  validatePublicationAttestationRecord,
} from "./reader-summary-publication-runtime-policy.mjs";

const mimoRecord = () => ({
  taskRole: "summary",
  attempt: "primary",
  normalizedOutputSha256: "d".repeat(64),
  attestation: {
    schemaVersion: 1,
    requestId: "synthetic-summary",
    purpose: "social_monitor.reader_summary.generate.v2",
    canonicalRequestSha256: "a".repeat(64),
    provider: "codex",
    model: "mimo-v2.6-pro",
    reasoningEffort: "high",
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: approvedMimoRuntimeVersion,
    launcherSha256: approvedLauncherSha256,
    selectedOutputKind: "structured_output",
    selectedOutputSha256: "c".repeat(64),
  },
});

test("MiMo attestation admits only the active purpose and pinned runtime", () => {
  assert.doesNotThrow(() => validatePublicationAttestationRecord(mimoRecord(), false));
  for (const patch of [
    { runtimePackageVersion: "0.1.0-main.40-sm-mimo.4" },
    { reasoningEffort: "xhigh" },
    { purpose: "social_monitor.reader_summary.generate" },
    { launcherSha256: "f".repeat(64) },
  ]) {
    const record = mimoRecord();
    Object.assign(record.attestation, patch);
    assert.throws(() => validatePublicationAttestationRecord(record, false),
      /malformed or mismatched/u);
  }
});

const mimoProvenance = () => ({
  execution: "attested",
  summaryModel: "agent-runtime",
  physicalModel: "mimo-v2.6-pro",
  provider: "codex",
  runtime: "subscription-runtime-cli",
  runtimeVersion: approvedMimoRuntimeVersion,
  reasoningEffort: "high",
  launcherSha256: approvedLauncherSha256,
  summaryContentSha256: "a".repeat(64),
  topicMapSha256: "b".repeat(64),
  attestationSetSha256: "c".repeat(64),
  completedTaskCount: 2,
  topicLabeler: {
    mode: "agent-runtime",
    physicalModel: "gpt-5.6-sol",
    provider: "codex",
    runtime: "subscription-runtime-cli",
    runtimeVersion: approvedCodexRuntimeVersion,
    reasoningEffort: "high",
    launcherSha256: approvedLauncherSha256,
  },
});

test("MiMo publication provenance accepts the pinned mixed topic identity only", () => {
  assert.equal(isPublicationRuntimeProvenance(mimoProvenance()), true);
  for (const patch of [
    { runtimeVersion: "0.1.0-main.40-sm-mimo.4" },
    { launcherSha256: "f".repeat(64) },
    { topicLabeler: { ...mimoProvenance().topicLabeler,
      runtimeVersion: "0.1.0-main.42-sm.2" } },
  ]) {
    assert.equal(isPublicationRuntimeProvenance({ ...mimoProvenance(), ...patch }), false);
  }
});
