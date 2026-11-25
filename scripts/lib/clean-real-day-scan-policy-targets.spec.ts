import { requireScanPolicyTargets } from "./clean-real-day-scan-policy-targets";

describe("requireScanPolicyTargets", () => {
  it("keeps an enabled target with its real scan policy ID", () => {
    expect(
      requireScanPolicyTargets([
        {
          sourceBindingId: "source-binding-1",
          scanPolicyId: "scan-policy-1",
          providerKey: "x-twitter",
        },
      ]),
    ).toEqual([
      {
        sourceBindingId: "source-binding-1",
        scanPolicyId: "scan-policy-1",
        providerKey: "x-twitter",
      },
    ]);
  });

  it("fails closed without exposing the raw source binding ID", () => {
    const rawSourceBindingId = "sensitive-source-binding-id";

    expect(() =>
      requireScanPolicyTargets([
        {
          sourceBindingId: rawSourceBindingId,
          scanPolicyId: null,
          providerKey: "x-twitter",
        },
      ]),
    ).toThrow(
      "Enabled production collection target has no scan policy: provider=x-twitter sourceBindingFingerprint=fc9806de",
    );

    try {
      requireScanPolicyTargets([
        {
          sourceBindingId: rawSourceBindingId,
          scanPolicyId: null,
          providerKey: "x-twitter",
        },
      ]);
    } catch (error) {
      expect(String(error)).not.toContain(rawSourceBindingId);
    }
  });
});
