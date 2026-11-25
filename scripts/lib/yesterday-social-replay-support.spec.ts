import { yesterdaySocialQualityPoolConfig } from "./yesterday-social-replay-support";

describe("yesterday social quality pool config", () => {
  it("enables system visibility for production read-only quality gates", () => {
    expect(
      yesterdaySocialQualityPoolConfig(
        "postgresql://summary-reader.invalid/social_monitor",
        2,
      ),
    ).toEqual({
      connectionString: "postgresql://summary-reader.invalid/social_monitor",
      min: 0,
      max: 2,
      connectionTimeoutMillis: 2_000,
      options: "-c social_monitor.system_access=true",
    });
  });
});
