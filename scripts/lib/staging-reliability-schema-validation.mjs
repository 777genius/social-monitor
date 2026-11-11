import { validateEvidenceProvenanceRequirements } from "./evidence-provenance.mjs";

const requiredSignalResultRequirementTexts = new Set([
  "every required signalId for the stagingArtifactId is present exactly once",
  "every signal result has status=passed",
  "every signal result has observedAt and non-empty evidence",
  "artifact startedAt/completedAt and signal observedAt use strict ISO-8601 timestamps",
  "every signal result observedAt is inside artifact startedAt/completedAt window",
  "every signal result evidence is an object matching signal-specific required fields",
  "artifact metadata matches the release evidence row",
  "real artifact environmentId and operator are not example, fixture, synthetic, mock or test identifiers",
  "real artifact nested evidence values do not contain example, fixture, synthetic, mock or test markers",
]);

export function createStagingReliabilitySchemaValidation({
  evidence,
  violations,
  evidencePath,
  stagingArtifactFormat,
  stagingArtifactEvidenceKind,
  requiredEnvArtifacts,
  isRecord,
  existsSync,
}) {
  function validatePassedArtifactContentSchema() {
    const schema = evidence.passedArtifactContentSchema;
    if (!isRecord(schema)) {
      violations.push(
        `${evidencePath}: passedArtifactContentSchema must define the required passed artifact format`,
      );
      return;
    }
    if (schema.schemaVersion !== 1) {
      violations.push(
        `${evidencePath}: passedArtifactContentSchema.schemaVersion must be 1`,
      );
    }
    if (schema.format !== stagingArtifactFormat) {
      violations.push(
        `${evidencePath}: passedArtifactContentSchema.format must be ${stagingArtifactFormat}`,
      );
    }
    if (
      typeof schema.exampleArtifactPath !== "string" ||
      schema.exampleArtifactPath.trim().length === 0
    ) {
      violations.push(
        `${evidencePath}: passedArtifactContentSchema.exampleArtifactPath must reference fixture examples`,
      );
    } else if (!existsSync(schema.exampleArtifactPath)) {
      violations.push(
        `${evidencePath}: passedArtifactContentSchema.exampleArtifactPath does not exist`,
      );
    }
  
    const requiredTopLevelFields = new Set(schema.requiredTopLevelFields ?? []);
    for (const field of [
      "schemaVersion",
      "format",
      "artifactId",
      "environmentId",
      "imageDigest",
      "operator",
      "startedAt",
      "completedAt",
      "provenance",
      "redaction",
      "signalResults",
    ]) {
      if (!requiredTopLevelFields.has(field)) {
        violations.push(
          `${evidencePath}: passedArtifactContentSchema.requiredTopLevelFields must include ${field}`,
        );
      }
    }
  
    const redactionRequirements = new Set(schema.redactionRequirements ?? []);
    for (const requirement of [
      "secretsIncluded=false",
      "rawProviderPayloadsIncluded=false",
      "databaseUrlsIncluded=false",
      "brokerUrlsIncluded=false",
    ]) {
      if (!redactionRequirements.has(requirement)) {
        violations.push(
          `${evidencePath}: passedArtifactContentSchema.redactionRequirements must include ${requirement}`,
        );
      }
    }
  
    if (
      !Array.isArray(schema.signalResultRequirements) ||
      schema.signalResultRequirements.length < 4
    ) {
      violations.push(
        `${evidencePath}: passedArtifactContentSchema.signalResultRequirements must describe signal coverage`,
      );
    } else {
      const signalResultRequirements = new Set(schema.signalResultRequirements);
      for (const requirement of requiredSignalResultRequirementTexts) {
        if (!signalResultRequirements.has(requirement)) {
          violations.push(
            `${evidencePath}: passedArtifactContentSchema.signalResultRequirements must include "${requirement}"`,
          );
        }
      }
    }
    validateProvenanceRequirements(schema.provenanceRequirements);
    validateEnvArtifactValidation(schema.envArtifactValidation);
  }

  function validateProvenanceRequirements(requirements) {
    validateEvidenceProvenanceRequirements({
      requirements,
      expectedEvidenceKind: stagingArtifactEvidenceKind,
      label: "passedArtifactContentSchema.provenanceRequirements",
      sourcePath: evidencePath,
      violations,
    });
  }

  function validateEnvArtifactValidation(validationRules) {
    if (!Array.isArray(validationRules)) {
      violations.push(
        `${evidencePath}: passedArtifactContentSchema.envArtifactValidation must be an array`,
      );
      return;
    }
  
    const seenRules = new Set();
    for (const [index, rule] of validationRules.entries()) {
      const label = `passedArtifactContentSchema.envArtifactValidation[${index}]`;
      if (!isRecord(rule)) {
        violations.push(`${evidencePath}: ${label} must be an object`);
        continue;
      }
      const expected = requiredEnvArtifacts.get(rule.artifactId);
      if (expected === undefined) {
        violations.push(`${evidencePath}: ${label}.artifactId is unsupported`);
        continue;
      }
      seenRules.add(rule.artifactId);
      if (rule.envVar !== expected.envVar) {
        violations.push(
          `${evidencePath}: ${label}.envVar must be ${expected.envVar}`,
        );
      }
      if (rule.format !== stagingArtifactFormat) {
        violations.push(
          `${evidencePath}: ${label}.format must be ${stagingArtifactFormat}`,
        );
      }
      for (const envVar of expected.requiredEnv) {
        if (!rule.requiredEnv?.includes(envVar)) {
          violations.push(
            `${evidencePath}: ${label}.requiredEnv must include ${envVar}`,
          );
        }
      }
    }
  
    for (const artifactId of requiredEnvArtifacts.keys()) {
      if (!seenRules.has(artifactId)) {
        violations.push(
          `${evidencePath}: envArtifactValidation must include ${artifactId}`,
        );
      }
    }
  }

  return { validatePassedArtifactContentSchema };
}
