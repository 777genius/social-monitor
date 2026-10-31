import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  approvedCodexRuntimeVersion,
  approvedLauncherSha256,
  approvedMimoRuntimeVersion,
  isPublicationRuntimeProvenance,
  validatePublicationAttestationRecord,
} from "./reader-summary-publication-runtime-policy.mjs";

const repositoryFile = (path) => readFileSync(new URL(`../../${path}`, import.meta.url));
const gatewayIdentitySource = repositoryFile(
  "libs/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity.ts").toString("utf8");
const gatewaySdkVersion = gatewayIdentitySource.match(/packageVersion: "([^"]+)"/u)?.[1];
const gatewaySdkSha256 = gatewayIdentitySource.match(/archiveSha256:\s*"([0-9a-f]{64})"/u)?.[1];

const gatewayRecord = () => ({
  taskRole: "summary",
  attempt: "primary",
  normalizedOutputSha256: "d".repeat(64),
  attestation: {
    schemaVersion: 1,
    requestId: "synthetic-summary",
    purpose: "social_monitor.reader_summary.generate.v2",
    canonicalRequestSha256: "a".repeat(64),
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    runtimeEngine: "gateway-llm",
    runtimePackageVersion: gatewaySdkVersion,
    launcherSha256: gatewaySdkSha256,
    gateway: {
      profileId: "openai-codex-oauth-responses-v1",
      taskId: "smSynthetic",
      attempt: 1,
      executionRef: "execution-1",
      requestRef: "smSynthetic-a1-r",
      accountRef: "00000000-0000-4000-8000-00000000000a",
      observedModel: "gpt-5.6-sol-2026",
      requestSha256: "e".repeat(64),
    },
    selectedOutputKind: "structured_output",
    selectedOutputSha256: "c".repeat(64),
  },
});

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
  const missingPurpose = mimoRecord();
  missingPurpose.attempt = "unadmitted";
  delete missingPurpose.attestation.purpose;
  assert.throws(() => validatePublicationAttestationRecord(missingPurpose, true),
    /malformed or mismatched/u);
  const unknownRole = mimoRecord();
  unknownRole.taskRole = "unknown";
  delete unknownRole.attestation.purpose;
  assert.throws(() => validatePublicationAttestationRecord(unknownRole, true),
    /malformed or mismatched/u);
  const coercedRole = mimoRecord();
  coercedRole.taskRole = ["topic_relation"];
  coercedRole.attempt = "0";
  coercedRole.attestation.purpose =
    "social_monitor.reader_summary.topic_map.verify_relations.v2";
  assert.throws(() => validatePublicationAttestationRecord(coercedRole, false),
    /malformed or mismatched/u);
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
  assert.equal(isPublicationRuntimeProvenance({ ...mimoProvenance(),
    topicLabeler: { ...mimoProvenance().topicLabeler, reasoningEffort: "xhigh" },
  }, true), false);
});

test("publication policy launcher digest matches the runtime admission pin", () => {
  const installation = readFileSync(new URL(
    "../../apps/agent-runtime/src/subscription-runtime-installation.ts",
    import.meta.url,
  ), "utf8");
  const pinned = installation.match(
    /approvedSubscriptionRuntimeLauncherSha256 =\s*"([0-9a-f]{64})"/u,
  );
  assert.ok(pinned, "runtime admission launcher pin must exist");
  assert.equal(approvedLauncherSha256, pinned[1]);
});

test("gateway attestation requires its attempt and the requested model", () => {
  assert.doesNotThrow(() => validatePublicationAttestationRecord(gatewayRecord(), false));
  const rejected = [
    (value) => { delete value.attestation.gateway; },
    (value) => { value.attestation.gateway.observedModel = "gpt-5.7-mini"; },
    (value) => { value.attestation.gateway.prompt = "leak"; },
    (value) => { value.attestation.gateway.attempt = 0; },
    (value) => { value.attestation.gateway.requestRef = "ref:with:colons"; },
    (value) => { value.attestation.runtimeEngine = "subscription-runtime-cli"; },
    (value) => { value.attestation.runtimeEngine = "direct-http"; },
    (value) => {
      Object.assign(value.attestation, { model: "mimo-v2.6-pro",
        runtimePackageVersion: approvedMimoRuntimeVersion, launcherSha256: approvedLauncherSha256 });
    },
  ];
  for (const mutate of rejected) {
    const record = gatewayRecord();
    mutate(record);
    assert.throws(() => validatePublicationAttestationRecord(record, false),
      /malformed or mismatched/u);
  }
});

test("gateway publication provenance binds one engine and never MiMo", () => {
  const provenance = {
    ...mimoProvenance(),
    physicalModel: "gpt-5.6-sol",
    runtime: "gateway-llm",
    runtimeVersion: gatewaySdkVersion,
    launcherSha256: gatewaySdkSha256,
    topicLabeler: { ...mimoProvenance().topicLabeler, runtime: "gateway-llm",
      runtimeVersion: gatewaySdkVersion, launcherSha256: gatewaySdkSha256 },
  };
  assert.equal(isPublicationRuntimeProvenance(provenance), true);
  assert.equal(isPublicationRuntimeProvenance({ ...provenance,
    topicLabeler: { ...provenance.topicLabeler, runtime: "subscription-runtime-cli" } }), false);
  assert.equal(isPublicationRuntimeProvenance({ ...mimoProvenance(), runtime: "gateway-llm",
    topicLabeler: { ...mimoProvenance().topicLabeler, runtime: "gateway-llm" } }), false);
});

test("gateway SDK pin matches the vendored archive and the shared identity rules", () => {
  const archivePath = gatewayIdentitySource.match(/"(vendor\/account-gateway\/[^"]+\.tgz)"/u)?.[1];
  assert.ok(archivePath && gatewaySdkVersion && gatewaySdkSha256);
  assert.equal(createHash("sha256").update(repositoryFile(archivePath)).digest("hex"),
    gatewaySdkSha256);
  const lock = JSON.parse(repositoryFile("package-lock.json").toString("utf8"));
  assert.equal(lock.packages["node_modules/@agent-teams/account-gateway"].resolved,
    `file:${archivePath}`);
  const contract = repositoryFile(
    "libs/contracts/grpc/agent_runtime/v1/execution-attestation.ts").toString("utf8");
  const policy = repositoryFile(
    "scripts/lib/reader-summary-publication-runtime-policy.mjs").toString("utf8");
  for (const shared of [
    "^-\\d{4}(?:-\\d{2}-\\d{2})?$",
    "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    "accountRef,attempt,executionRef,observedModel,profileId,requestRef,requestSha256,taskId",
  ]) {
    assert.ok(contract.includes(shared) && policy.includes(shared), shared);
  }
});

const kimiRecord = () => {
  const record = gatewayRecord();
  Object.assign(record.attestation, { model: "k3-256k", reasoningEffort: "default" });
  Object.assign(record.attestation.gateway, {
    profileId: "kimi-code-global-responses-apikey-v1", observedModel: "k3-256k" });
  return record;
};

test("gateway-only models publish only through the gateway with the route effort", () => {
  assert.doesNotThrow(() => validatePublicationAttestationRecord(kimiRecord(), false));
  const openRouter = kimiRecord();
  Object.assign(openRouter.attestation, { model: "openai/gpt-oss-120b", reasoningEffort: "medium" });
  openRouter.attestation.gateway.observedModel = null;
  assert.doesNotThrow(() => validatePublicationAttestationRecord(openRouter, false));
  for (const mutate of [
    (value) => {
      Object.assign(value.attestation, { runtimeEngine: "subscription-runtime-cli",
        runtimePackageVersion: approvedCodexRuntimeVersion, launcherSha256: approvedLauncherSha256 });
      delete value.attestation.gateway;
    },
    (value) => { value.attestation.reasoningEffort = "none"; },
    (value) => { value.attestation.purpose = "social_monitor.reader_summary.generate"; },
    (value) => { value.attestation.gateway.observedModel = "kimi-k2"; },
  ]) {
    const record = kimiRecord();
    mutate(record);
    assert.throws(() => validatePublicationAttestationRecord(record, true),
      /malformed or mismatched/u);
  }

  const provenance = {
    ...mimoProvenance(),
    physicalModel: "k3-256k",
    reasoningEffort: "default",
    runtime: "gateway-llm",
    runtimeVersion: gatewaySdkVersion,
    launcherSha256: gatewaySdkSha256,
    topicLabeler: { mode: "agent-runtime", physicalModel: "k3-256k", provider: "codex",
      runtime: "gateway-llm", runtimeVersion: gatewaySdkVersion, reasoningEffort: "default",
      launcherSha256: gatewaySdkSha256 },
  };
  assert.equal(isPublicationRuntimeProvenance(provenance), true);
  assert.equal(isPublicationRuntimeProvenance({ ...provenance,
    topicLabeler: { ...provenance.topicLabeler, physicalModel: "gpt-5.6-sol",
      reasoningEffort: "high" } }), false);
  assert.equal(isPublicationRuntimeProvenance({ ...provenance,
    runtime: "subscription-runtime-cli", topicLabeler: { ...provenance.topicLabeler,
      runtime: "subscription-runtime-cli" } }), false);
});

test("gateway-only Codex models publish only through the gateway at an allowed effort", () => {
  const codexRecord = () => {
    const record = gatewayRecord();
    Object.assign(record.attestation, { model: "gpt-6.1-sol", reasoningEffort: "low" });
    record.attestation.gateway.observedModel = "gpt-6.1-sol";
    return record;
  };
  assert.doesNotThrow(() => validatePublicationAttestationRecord(codexRecord(), false));
  for (const mutate of [
    (value) => { value.attestation.reasoningEffort = "high"; },
    (value) => { value.attestation.reasoningEffort = "default"; },
    (value) => {
      Object.assign(value.attestation, { runtimeEngine: "subscription-runtime-cli",
        runtimePackageVersion: approvedCodexRuntimeVersion, launcherSha256: approvedLauncherSha256 });
      delete value.attestation.gateway;
    },
  ]) {
    const record = codexRecord();
    mutate(record);
    assert.throws(() => validatePublicationAttestationRecord(record, true),
      /malformed or mismatched/u);
  }
  const provenance = {
    ...mimoProvenance(),
    physicalModel: "gpt-6.1-sol",
    reasoningEffort: "low",
    runtime: "gateway-llm",
    runtimeVersion: gatewaySdkVersion,
    launcherSha256: gatewaySdkSha256,
    topicLabeler: { mode: "agent-runtime", physicalModel: "gpt-6.1-sol", provider: "codex",
      runtime: "gateway-llm", runtimeVersion: gatewaySdkVersion, reasoningEffort: "low",
      launcherSha256: gatewaySdkSha256 },
  };
  assert.equal(isPublicationRuntimeProvenance(provenance), true);
  assert.equal(isPublicationRuntimeProvenance({ ...provenance, reasoningEffort: "high",
    topicLabeler: { ...provenance.topicLabeler, reasoningEffort: "high" } }), false);
});

test("gateway model rules match the TypeScript generation profile", () => {
  const profile = repositoryFile(
    "libs/summary/adapters/model/active-reader-summary-generation-profile.ts").toString("utf8");
  const codexRoute = repositoryFile(
    "libs/summary/adapters/model/codex-reader-summary-route.ts").toString("utf8");
  const policy = repositoryFile(
    "scripts/lib/reader-summary-publication-runtime-policy.mjs").toString("utf8");
  for (const [source, shared] of [
    [profile, "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$"],
    [profile, '"minimal", "low", "medium", "high", "xhigh", "max", "ultra"'],
    // The gateway-only Codex pair; gpt-5.6-sol/high is the CLI identity.
    [codexRoute, '{ model: "gpt-6.1-sol", reasoningEffort: "low" }'],
  ]) {
    assert.ok(source.includes(shared) && policy.includes(shared), shared);
  }
});
