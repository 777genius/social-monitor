export type QualityGateMap = Readonly<Record<string, boolean>>;

export const allQualityGatesPassed = (qualityGates: QualityGateMap): boolean =>
  Object.values(qualityGates).every(Boolean);
