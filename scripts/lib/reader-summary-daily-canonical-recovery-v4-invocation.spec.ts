import {
  parseDailyCanonicalRecoveryV4Invocation,
} from "./reader-summary-daily-canonical-recovery-v4-invocation";

describe("daily canonical recovery v4 invocation", () => {
  it("accepts only ordinary or exact invalid-product retry-set modes", () => {
    expect(parseDailyCanonicalRecoveryV4Invocation([])).toEqual({ kind: "ordinary" });
    expect(parseDailyCanonicalRecoveryV4Invocation([
      "invalid-product-retry-set-v1",
      "a".repeat(64),
    ])).toEqual({ kind: "invalid_product_retry_set", terminalSetSha256: "a".repeat(64) });
  });

  it.each([
    [["invalid-product-retry-set-v1"]],
    [["invalid-product-retry-set-v2", "a".repeat(64)]],
    [["invalid-product-retry-set-v1", "A".repeat(64)]],
    [["invalid-product-retry-set-v1", "a".repeat(64), "extra"]],
  ] as const)("rejects malformed or widened mode %j", (argv) => {
    expect(() => parseDailyCanonicalRecoveryV4Invocation(argv)).toThrow(/invocation/u);
  });
});
