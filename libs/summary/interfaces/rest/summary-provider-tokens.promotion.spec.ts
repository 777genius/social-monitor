import { resolveReaderSummaryPromotionMode } from "./summary-provider-tokens";

describe("resolveReaderSummaryPromotionMode", () => {
  it.each([undefined, "", "false", "TRUE", "1"])(
    "fails closed for %p",
    (value) => {
      expect(
        resolveReaderSummaryPromotionMode({
          READER_SUMMARY_PROMOTION_V1_ENABLED: value,
        }),
      ).toBe("disabled");
    },
  );

  it("enables only the exact explicit switch", () => {
    expect(
      resolveReaderSummaryPromotionMode({
        READER_SUMMARY_PROMOTION_V1_ENABLED: "true",
      }),
    ).toBe("enabled");
  });
});
