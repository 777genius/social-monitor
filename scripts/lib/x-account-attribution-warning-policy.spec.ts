import { finalizeXAccountAttributionWarningOnly } from "./x-account-attribution-warning-policy";

describe("X account attribution warning-only production verdict", () => {
  it("keeps a known zero-output warning operational and nonblocking", () => {
    const result = finalizeXAccountAttributionWarningOnly({
      qualityGates: { globalXCollectionSucceeded: true },
      attribution: {
        attributionStatus: "known",
        attributionPolicy: "warning_only",
        attributionGateReason:
          "known_attribution_zero_output_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 1,
        attributionWarnings: [
          {
            code: "eligible_account_requests_without_attributable_output",
            accountFingerprint: "account-fingerprint",
          },
        ],
      },
    });

    expect(result.collectionBlockingPassed).toBe(true);
    expect(result.operationalWarnings).toEqual({
      xAccountAttributionStatus: "known",
      xAccountAttributionPolicy: "warning_only",
      xAccountAttributionGateReason:
        "known_attribution_zero_output_warning_only",
      xAccountAttributionWarningCount: 1,
      xAccountAttributionWarnings: [
        {
          code: "eligible_account_requests_without_attributable_output",
          accountFingerprint: "account-fingerprint",
        },
      ],
    });
  });

  it("keeps unknown attribution nonblocking after global success", () => {
    const result = finalizeXAccountAttributionWarningOnly({
      qualityGates: { globalXCollectionSucceeded: true },
      attribution: {
        attributionStatus: "unknown",
        attributionPolicy: "warning_only",
        attributionGateReason:
          "unknown_attribution_global_collection_succeeded_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 0,
        attributionWarnings: [],
      },
    });

    expect(result.collectionBlockingPassed).toBe(true);
    expect(result.operationalWarnings).toMatchObject({
      xAccountAttributionStatus: "unknown",
      xAccountAttributionWarningCount: 0,
      xAccountAttributionWarnings: [],
    });
  });

  it("still honors unrelated blocking collection gates", () => {
    const result = finalizeXAccountAttributionWarningOnly({
      qualityGates: { globalXCollectionSucceeded: false },
      attribution: {
        attributionStatus: "unknown",
        attributionPolicy: "warning_only",
        attributionGateReason:
          "unknown_attribution_without_global_success_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 0,
        attributionWarnings: [],
      },
    });

    expect(result.collectionBlockingPassed).toBe(false);
  });
});
