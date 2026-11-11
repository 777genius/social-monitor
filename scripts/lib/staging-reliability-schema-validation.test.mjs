import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { isRecord } from "./staging-reliability-evidence-shape.mjs";
import { createStagingReliabilitySchemaValidation } from "./staging-reliability-schema-validation.mjs";

const originalEvidence = JSON.parse(readFileSync(
  new URL("../../ops/drills/staging-reliability-evidence.json", import.meta.url), "utf8",
));
const stagingArtifactFormat = "staging-reliability-artifact-v1";
const requiredEnvArtifacts = new Map([
  ["rabbitmq-staging-drill-output", {envVar: "RABBITMQ_STAGING_DRILL_ARTIFACT_PATH", requiredEnv: ["STAGING_ENVIRONMENT_ID", "BACKEND_IMAGE_DIGEST"]}],
  ["postgres-restore-drill-output", {envVar: "POSTGRES_RESTORE_DRILL_ARTIFACT_PATH", requiredEnv: ["STAGING_ENVIRONMENT_ID", "BACKEND_IMAGE_DIGEST"]}],
  ["durable-backend-e2e-output", {envVar: "DURABLE_BACKEND_E2E_ARTIFACT_PATH", requiredEnv: ["STAGING_ENVIRONMENT_ID", "BACKEND_IMAGE_DIGEST", "API_BASE_URL"]}],
]);

function validateSchema(change = () => {}) {
  const evidence = structuredClone(originalEvidence);
  change(evidence);
  const violations = [];
  const { validatePassedArtifactContentSchema } = createStagingReliabilitySchemaValidation({
    evidence,
    violations,
    evidencePath: "ops/drills/staging-reliability-evidence.json",
    stagingArtifactFormat,
    stagingArtifactEvidenceKind: "staging_drill",
    requiredEnvArtifacts,
    isRecord,
    existsSync,
  });
  validatePassedArtifactContentSchema();
  return violations;
}

test("tracked staging schema passes the extracted contract", () => {
  assert.deepEqual(validateSchema(), []);
});

test("missing or malformed schema remains fail-closed", () => {
  for (const schema of [undefined, null, []]) {
    const violations = validateSchema((evidence) => { evidence.passedArtifactContentSchema = schema; });
    assert.ok(violations.some((message) => message.includes("must define the required passed artifact format")));
  }
});

test("format and fixture paths must remain valid", () => {
  assert.ok(validateSchema((evidence) => { evidence.passedArtifactContentSchema.format = "wrong"; })
    .some((message) => message.includes("format must be")));
  assert.ok(validateSchema((evidence) => { evidence.passedArtifactContentSchema.exampleArtifactPath = "missing-example.json"; })
    .some((message) => message.includes("exampleArtifactPath does not exist")));
});

test("all required redaction and signal statements are enforced", () => {
  assert.ok(validateSchema((evidence) => { evidence.passedArtifactContentSchema.redactionRequirements.pop(); })
    .some((message) => message.includes("redactionRequirements must include")));
  assert.ok(validateSchema((evidence) => { evidence.passedArtifactContentSchema.signalResultRequirements.pop(); })
    .some((message) => message.includes("signalResultRequirements must include")));
});

test("every expected artifact must have a recognized environment rule", () => {
  assert.ok(validateSchema((evidence) => { evidence.passedArtifactContentSchema.envArtifactValidation.pop(); })
    .some((message) => message.includes("envArtifactValidation must include")));
  assert.ok(validateSchema((evidence) => { evidence.passedArtifactContentSchema.envArtifactValidation.push({ artifactId: "unknown", envVar: "X" }); })
    .some((message) => message.includes("artifactId is unsupported")));
});

test("required environment variables cannot be silently omitted", () => {
  assert.ok(validateSchema((evidence) => {
    evidence.passedArtifactContentSchema.envArtifactValidation[2].requiredEnv = ["STAGING_ENVIRONMENT_ID"];
  }).some((message) => message.includes("requiredEnv must include BACKEND_IMAGE_DIGEST")));
  assert.ok(validateSchema((evidence) => {
    evidence.passedArtifactContentSchema.envArtifactValidation[2].requiredEnv = ["STAGING_ENVIRONMENT_ID", "BACKEND_IMAGE_DIGEST"];
  }).some((message) => message.includes("requiredEnv must include API_BASE_URL")));
});
