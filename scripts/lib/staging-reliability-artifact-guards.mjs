import { URL } from "node:url";
import { validateRealEvidenceIdentityStrings } from "./evidence-provenance.mjs";
import { isRecord } from "./staging-reliability-evidence-shape.mjs";

// Pure in-memory staging privacy and artifact validation guards; caller owns diagnostics.
export function createStagingReliabilityArtifactGuards(violations) {
  const requiredRealArtifactIdentityFields = ["environmentId", "operator"];
  const forbiddenRealArtifactMarkerPattern =
    /(?:^|[-_:.\s])(example|fixture|synthetic|mock|test)(?:$|[-_:.\s])/i;

  const forbiddenArtifactFragments = [
    "bearer ",
    "basic ",
    "authorization",
    "x-api-key",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "id_token",
    "client_secret",
    "password",
    "secret_key",
    "private_key",
    "postgres://",
    "postgresql://",
    "amqp://",
    "amqps://",
    "smk_",
    "whsec_",
  ];
  const forbiddenArtifactValuePatterns = [
    {
      label: "query credential",
      regex:
        /\b(?:access_token|refresh_token|id_token|api_key|apikey|client_secret|signature|sig)=([^&\s"']+)/gi,
    },
    {
      label: "header credential",
      regex:
        /\b(?:authorization|x-api-key|x-amz-security-token):\s*([^,\s"'}]+)/gi,
    },
    {
      label: "jwt credential",
      regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    },
  ];


  function validateRealArtifactIdentity(content, label) {
    validateRealEvidenceIdentityStrings({
      source: content,
      fields: requiredRealArtifactIdentityFields,
      label,
      violations,
      realEvidenceLabel: "real staging artifacts",
    });
  }

  function validateNoRealArtifactFixtureMarkers(value, label, path = []) {
    if (typeof value === "string") {
      const marker = forbiddenRealArtifactMarkerPattern.exec(value);
      if (marker !== null) {
        const fieldPath = path.length === 0 ? "<root>" : path.join(".");
        violations.push(
          `${label}: ${fieldPath} must not contain fixture marker "${marker[1]}"`,
        );
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        validateNoRealArtifactFixtureMarkers(item, label, [
          ...path,
          `[${index}]`,
        ]);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    for (const [key, item] of Object.entries(value)) {
      validateNoRealArtifactFixtureMarkers(item, label, [...path, key]);
    }
  }


  function validateRedaction(content, artifactPath) {
    if (!isRecord(content.redaction)) {
      violations.push(`${artifactPath}: redaction must be an object`);
      return;
    }

    for (const field of [
      "secretsIncluded",
      "rawProviderPayloadsIncluded",
      "databaseUrlsIncluded",
      "brokerUrlsIncluded",
    ]) {
      if (content.redaction[field] !== false) {
        violations.push(`${artifactPath}: redaction.${field} must be false`);
      }
    }

    validateNoSensitiveArtifactContent(JSON.stringify(content), artifactPath);
  }

  function validateNoSensitiveArtifactContent(content, artifactPath) {
    const serialized = content.toLowerCase();
    for (const fragment of forbiddenArtifactFragments) {
      if (serialized.includes(fragment)) {
        violations.push(
          `${artifactPath}: passed staging artifact must not contain sensitive fragment "${fragment}"`,
        );
      }
    }
    validateNoSensitivePatterns(
      content,
      `${artifactPath}: passed staging artifact`,
    );
  }

  function validateNoSensitivePatterns(content, label) {
    for (const pattern of forbiddenArtifactValuePatterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(content)) {
        violations.push(`${label} must not contain sensitive ${pattern.label}`);
      }
      pattern.regex.lastIndex = 0;
    }
  }


  function isHttpUrlWithoutCredentials(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return false;
    }

    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        url.username === "" &&
        url.password === ""
      );
    } catch {
      return false;
    }
  }

  return {
    validateRealArtifactIdentity,
    validateNoRealArtifactFixtureMarkers,
    validateRedaction,
    validateNoSensitiveArtifactContent,
    isHttpUrlWithoutCredentials,
  };
}
