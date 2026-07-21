export const legacyLiveQualityGateNames = [
  "allRequiredStepsPassed",
  "cleanDayE2eExecutedAndPassed",
  "collectionQualityDateMatchesRequestedDate",
  "collectionQualityReported",
  "degradedFailuresAreExplicitlyAllowed",
  "durableSummaryCaptured",
  "durableSummaryPersistedAndUuidBound",
  "durableSummaryWindowMatchesRequestedDate",
  "evidenceArtifactContentHashBound",
  "exactRequiredStepsExecutedOnceAndPassed",
  "freshEvidenceAndFrontendArtifactsHashBound",
  "historicalReuseEvaluationPassed",
  "liveCollectionExecutedAndPassed",
  "noRawSecretFragments",
  "productionDefinitionOfDoneSatisfied",
  "productionFailureAbsent",
  "provenanceMatchesExecutionMode",
  "reportDateMatchesRequestedDate",
  "reportUtcWindowMatchesRequestedDate",
  "strictLiveProductionControls",
  "subscriptionRuntimeProvenanceVerified",
  "topicLabelerProvenanceVerified",
  "xAccountPoolReported",
];

const currentQualityGateNames = [
  "exactRequiredStepsExecutedOnceAndPassed",
  "durableSummaryPersistedAndUuidBound",
  "evidenceArtifactContentHashBound",
  "freshEvidenceAndFrontendArtifactsHashBound",
  "productionDefinitionOfDoneSatisfied",
  "strictLiveProductionControls",
  "subscriptionRuntimeProvenanceVerified",
  "topicLabelerProvenanceVerified",
  "provenanceMatchesExecutionMode",
  "reportUtcWindowMatchesRequestedDate",
  "collectionInputProvenanceSatisfied",
  "regenerationDatasetGuardVerified",
];

export function publicationQualityContract({
  qualityGates,
  provenance,
  model,
  expectedDate,
}) {
  if (!isObject(qualityGates)) return null;
  const gateNames = Object.keys(qualityGates);
  const allGatesPassed = gateNames.every((name) => qualityGates[name] === true);
  if (
    allGatesPassed &&
    isObject(provenance) &&
    isObject(model) &&
    expectedDate === "2026-07-20" &&
    provenance.mode === "live-production" &&
    model.liveCollection === true &&
    model.reusedCollection === undefined &&
    model.freshSummaryCapture === undefined &&
    sameStringSet(gateNames, legacyLiveQualityGateNames)
  ) {
    return "legacy-live";
  }
  if (
    gateNames.length > 0 &&
    allGatesPassed &&
    currentQualityGateNames.every((name) => qualityGates[name] === true)
  ) {
    return "current";
  }
  return null;
}

function sameStringSet(left, right) {
  const byCanonicalKeyOrder = (first, second) => first.localeCompare(second);
  const sortedLeft = [...left].sort(byCanonicalKeyOrder);
  const sortedRight = [...right].sort(byCanonicalKeyOrder);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
