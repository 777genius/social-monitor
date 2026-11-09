import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStagingReliabilityReleaseWiringPolicy } from "./staging-reliability-release-wiring-policy.mjs";

const gateScript = "check:staging-reliability-evidence";
const gateId = "staging-reliability-evidence";
const gateCommand = "npm run " + gateScript;
const evidencePath = "ops/drills/staging-reliability-evidence.json";
const examplePath = "ops/drills/example-staging-artifact.json";
const domains = [
  "rabbitmq-reliability", "postgres-reliability", "observability-and-drills", "mvp-loop",
];
const groups = [
  "rabbitmq-staging-reliability-drill", "postgres-restore-migration-drill", "durable-backend-e2e-loop",
];

function makeContext() {
  return {
    violations: [],
    gateScript, gateId, gateCommand, evidencePath,
    releaseContractPath: "ops/release/mvp-release-evidence-contract.json",
    backendOpsPath: "ops/release/backend-ops-readiness-contract.json",
    externalReadinessPath: "ops/release/external-beta-readiness-contract.json",
    baselinePath: "ops/release/release-baseline-contract.json",
    requiredBackendOpsDomains: domains,
    requiredExternalGroups: groups,
    releaseContract: { requiredGates: [{ gateId, command: gateCommand }] },
    backendOps: { requiredDomains: domains.map((domainId) => ({
      domainId, gates: [gateScript], releaseGateIds: [gateId], artifacts: [evidencePath],
    })) },
    externalReadiness: { requiredEvidenceGroups: groups.map((groupId) => ({
      groupId, verificationCommands: [gateCommand], requiredArtifacts: [evidencePath],
    })) },
    baseline: { requiredGreenScripts: [gateScript],
      trackedArtifacts: [{ path: evidencePath }, { path: examplePath }] },
    evidence: { passedArtifactContentSchema: { exampleArtifactPath: examplePath } },
  };
}

function validate(ctx) {
  const guard = createStagingReliabilityReleaseWiringPolicy(ctx);
  guard.requireReleaseWiring();
  guard.requireBackendOpsWiring();
  guard.requireExternalReadinessWiring();
  guard.requireBaselineWiring();
  return ctx.violations;
}

test("valid contracts preserve inputs and produce no diagnostics", () => {
  const ctx = makeContext();
  const before = JSON.stringify({ ...ctx, violations: undefined });
  assert.deepEqual(validate(ctx), []);
  assert.equal(JSON.stringify({ ...ctx, violations: undefined }), before);
});

test("release gate id and command are checked independently", () => {
  const ctx = makeContext();
  ctx.releaseContract.requiredGates = [{ gateId: "unrelated", command: "npm run unrelated" }];
  assert.deepEqual(validate(ctx), [
    ctx.releaseContractPath + ": missing " + gateId + " release gate",
    ctx.releaseContractPath + ": release gates must include " + gateScript,
  ]);
});

test("missing backend domain stays fail-closed without masking other domains", () => {
  const ctx = makeContext();
  ctx.backendOps.requiredDomains = ctx.backendOps.requiredDomains.filter((d) => d.domainId !== domains[0]);
  assert.deepEqual(validate(ctx), [
    ctx.backendOpsPath + ': missing backend ops domain "' + domains[0] + '"',
  ]);
});

test("backend domain gate, release id and artifact are independently mandatory", () => {
  const ctx = makeContext();
  const row = ctx.backendOps.requiredDomains[1];
  row.gates = []; row.releaseGateIds = []; row.artifacts = [];
  assert.deepEqual(validate(ctx), [
    ctx.backendOpsPath + ': domain "' + domains[1] + '" must include ' + gateScript,
    ctx.backendOpsPath + ': domain "' + domains[1] + '" must include ' + gateId + " release gate",
    ctx.backendOpsPath + ': domain "' + domains[1] + '" must include ' + evidencePath,
  ]);
});

test("missing external readiness group is rejected", () => {
  const ctx = makeContext();
  ctx.externalReadiness.requiredEvidenceGroups = ctx.externalReadiness.requiredEvidenceGroups.slice(1);
  assert.deepEqual(validate(ctx), [
    ctx.externalReadinessPath + ': missing external readiness group "' + groups[0] + '"',
  ]);
});

test("external group command and artifact must both be present", () => {
  const ctx = makeContext();
  const row = ctx.externalReadiness.requiredEvidenceGroups[2];
  row.verificationCommands = []; row.requiredArtifacts = [];
  assert.deepEqual(validate(ctx), [
    ctx.externalReadinessPath + ': group "' + groups[2] + '" must include ' + gateScript,
    ctx.externalReadinessPath + ': group "' + groups[2] + '" must include ' + evidencePath,
  ]);
});

test("baseline enforces required green command and both tracked artifacts", () => {
  const ctx = makeContext();
  ctx.baseline.requiredGreenScripts = []; ctx.baseline.trackedArtifacts = [];
  assert.deepEqual(validate(ctx), [
    ctx.baselinePath + ": requiredGreenScripts must include " + gateScript,
    ctx.baselinePath + ": trackedArtifacts must include " + evidencePath,
    ctx.baselinePath + ": trackedArtifacts must include " + examplePath,
  ]);
});

test("baseline does not invent an example artifact when optional path is absent", () => {
  const ctx = makeContext();
  ctx.evidence.passedArtifactContentSchema.exampleArtifactPath = null;
  ctx.baseline.trackedArtifacts = [{ path: evidencePath }];
  assert.deepEqual(validate(ctx), []);
});

function assertActiveReleaseWiring(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(code, /createStagingReliabilityReleaseWiringPolicy\(\{/);
  for (const name of [
    "requireReleaseWiring", "requireBackendOpsWiring",
    "requireExternalReadinessWiring", "requireBaselineWiring",
  ]) {
    const call = new RegExp("^\\s*" + name + "\\(\\);\\s*$", "m");
    assert.match(code, call, name + " invocation must remain active");
    assert.ok(!code.includes("function " + name + "()"), name + " must be owned by the policy");
  }
}

test("original staging checker retains all four live policy calls and a real delegate", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../check-staging-reliability-evidence.mjs", import.meta.url)), "utf8",
  );
  assertActiveReleaseWiring(source);
  for (const name of [
    "requireReleaseWiring", "requireBackendOpsWiring",
    "requireExternalReadinessWiring", "requireBaselineWiring",
  ]) {
    assert.throws(() => assertActiveReleaseWiring(source.replace(name + "();", "// " + name + "();")),
      name + " disabled by a line comment must fail the gate");
    assert.throws(() => assertActiveReleaseWiring(source.replace(name + "();", "/* " + name + "(); */")),
      name + " disabled by a block comment must fail the gate");
    assert.throws(() => assertActiveReleaseWiring(source.replace(name + "();", "")),
      name + " removed must fail the gate");
  }
});
