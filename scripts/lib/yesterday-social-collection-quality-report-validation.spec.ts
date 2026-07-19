import { isValidExistingYesterdaySocialCollectionQualityReport } from "./yesterday-social-collection-quality-report-validation";

const collectionDate = "2026-07-18";
const requiredPrimarySources = ["reddit", "x-twitter"];
const forbiddenSerializedFragments = ["access_token", "postgres://"];

describe("existing yesterday social collection quality report validation", () => {
  it("accepts a schema-v1 artifact with a complete durable attribution contract", () => {
    expect(validateArtifact(artifact())).toBe(true);
  });

  it("rejects a schema-v1 artifact missing operational warnings", () => {
    const candidate = artifact() as Record<string, unknown>;
    delete candidate.operationalWarnings;

    expect(validateArtifact(candidate)).toBe(false);
  });

  it("rejects a report containing a mixed-case configured forbidden fragment", () => {
    const candidate = artifact() as Record<string, unknown>;
    candidate.diagnostic = "aCcEsS_tOkEn";

    expect(validateArtifact(candidate, ["AcCeSs_ToKeN"])).toBe(false);
  });

  it("rejects a report missing one required primary source", () => {
    const candidate = artifact() as Record<string, unknown>;
    candidate.primarySourceCoverage = ["reddit"];

    expect(validateArtifact(candidate)).toBe(false);
  });

  it.each([
    ["attribution status", contract({ xAccountAttributionStatus: undefined })],
    ["valid attribution status", contract({ xAccountAttributionStatus: "future" })],
    ["warning-only policy", contract({ xAccountAttributionPolicy: undefined })],
    ["valid warning-only policy", contract({ xAccountAttributionPolicy: "blocking" })],
    ["gate reason", contract({ xAccountAttributionGateReason: undefined })],
    ["nonempty gate reason", contract({ xAccountAttributionGateReason: "   " })],
    ["warning count", contract({ xAccountAttributionWarningCount: undefined })],
    ["integer warning count", contract({ xAccountAttributionWarningCount: 0.5 })],
    ["warnings array", contract({ xAccountAttributionWarnings: undefined })],
    ["valid warnings array", contract({ xAccountAttributionWarnings: {} })],
  ] as const)(
    "rejects a schema-v1 artifact missing a %s",
    (_case, operationalWarnings) => {
      expect(validateArtifact(artifact(operationalWarnings))).toBe(false);
    },
  );

  it("rejects a schema-v1 artifact with an inconsistent attribution warning count", () => {
    expect(
      validateArtifact(
        artifact(
          contract({
            xAccountAttributionWarningCount: 1,
            xAccountAttributionWarnings: [],
          }),
        ),
      ),
    ).toBe(false);
  });
});

function artifact(operationalWarnings: unknown = contract()) {
  return {
    schemaVersion: 1,
    artifactFormat: "yesterday-social-collection-quality-report-v1",
    collectionDate,
    collectionBlockingPassed: true,
    primarySourceCoverage: requiredPrimarySources,
    operationalWarnings,
  };
}

function contract(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    xAccountAttributionStatus: "known",
    xAccountAttributionPolicy: "warning_only",
    xAccountAttributionGateReason: "known_attribution_warning_only",
    xAccountAttributionWarningCount: 0,
    xAccountAttributionWarnings: [],
    ...overrides,
  };
}

function validateArtifact(
  report: unknown,
  configuredForbiddenFragments = forbiddenSerializedFragments,
): boolean {
  return isValidExistingYesterdaySocialCollectionQualityReport({
    report,
    expectedCollectionDate: collectionDate,
    requiredPrimarySources,
    forbiddenSerializedFragments: configuredForbiddenFragments,
  });
}
