export type XAccountAttributionWarning = {
  readonly code: string;
  readonly accountFingerprint: string;
};

type XAccountAttributionReport = {
  readonly attributionStatus: "known" | "partial" | "unknown";
  readonly attributionPolicy: "warning_only";
  readonly attributionGateReason: string;
  readonly eligibleAccountZeroAttributableOutputWarningCount: number;
  readonly attributionWarnings: readonly XAccountAttributionWarning[];
};

export function finalizeXAccountAttributionWarningOnly(params: {
  readonly qualityGates: Readonly<Record<string, boolean>> & {
    readonly globalXCollectionSucceeded: true;
  };
  readonly attribution: XAccountAttributionReport;
}) {
  return {
    collectionBlockingPassed:
      params.qualityGates.globalXCollectionSucceeded === true &&
      Object.values(params.qualityGates).every((value) => value === true),
    operationalWarnings: {
      xAccountAttributionStatus: params.attribution.attributionStatus,
      xAccountAttributionPolicy: params.attribution.attributionPolicy,
      xAccountAttributionGateReason:
        params.attribution.attributionGateReason,
      xAccountAttributionWarningCount:
        params.attribution
          .eligibleAccountZeroAttributableOutputWarningCount,
      xAccountAttributionWarnings: params.attribution.attributionWarnings,
    },
  } as const;
}
