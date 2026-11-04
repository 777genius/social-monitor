import { types as nodeUtilTypes } from "node:util";

// Only trusted persisted V3 artifact/report verification selects these profiles.
// Literal path components prevent dotted-key and nested lookalike exemptions.
export const readerSummaryV3CandidateAuditArrayPaths = (
  value: unknown,
  profile: "weekly" | "artifact" | "report",
): readonly (readonly string[])[] => {
  if (profile === "weekly") return [];
  const prefix = profile === "report" ? ["artifactPayload"] : [];
  const artifact = profile === "report"
    ? plainDataField(value, "artifactPayload") : value;
  if (plainDataField(artifact, "schemaVersion") !== "reader_summary.artifact.v1") {
    throw new Error("V3 publication artifact shape is invalid");
  }
  const paths: string[][] = [];
  if (plainDataField(plainDataField(artifact, "promotionDiagnostics"),
    "schemaVersion") === "reader_promotion_diagnostics.v1") {
    paths.push([...prefix, "promotionDiagnostics", "candidates"]);
  }
  if (plainDataField(plainDataField(artifact, "dailyGenerationInput"),
    "policyVersion") === "reader_summary.daily_input.native_likes.v1") {
    paths.push([...prefix, "dailyGenerationInput", "excluded"]);
  }
  return paths;
};

const plainDataField = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(value, key)?.value;
};

