export function productionDayStrictControls(params: {
  readonly writesProductionData: boolean;
  readonly allowDegraded: boolean;
  readonly allowHistorical: boolean;
  readonly boundedHistoricalRecovery?: boolean;
}): boolean {
  return params.writesProductionData &&
    !params.allowDegraded &&
    (!params.allowHistorical || params.boundedHistoricalRecovery === true);
}

export function validProductionDayHistoricalControlModel(
  value: Record<string, unknown>,
  mode: unknown,
): boolean {
  const bounded = value.boundedHistoricalRecovery;
  const unbounded = bounded === false || bounded === undefined;
  return mode === "live-production"
    ? (value.allowHistorical === false && unbounded) ||
      (value.allowHistorical === true && bounded === true)
    : mode === "historical-regeneration" &&
      value.allowHistorical === false && unbounded;
}
