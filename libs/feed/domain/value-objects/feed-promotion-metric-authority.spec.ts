import { feedPromotionMetricAuthority } from
  "./feed-promotion-metric-authority";

describe("feed promotion metric authority", () => {
  const observation = (
    observedAt: string,
    metricsHash: string,
    hasRegression: boolean,
  ) => ({ observedAt: new Date(observedAt), metricsHash, hasRegression });

  it("marks the latest durable regression unresolved", () => {
    expect(feedPromotionMetricAuthority({
      snapshotObservedAt: new Date("2026-08-29T17:00:00.000Z"),
      snapshotChangedAt: new Date("2026-08-29T17:00:00.000Z"),
      snapshotMetricsHash: "lower",
      currentHasRegressionFromLatest: false,
      latestObservation: observation(
        "2026-08-29T17:00:00.000Z",
        "lower",
        true,
      ),
    })).toMatchObject({ regressionState: "unresolved_regression" });
  });

  it("marks a repeated lower snapshot as a confirmed correction", () => {
    expect(feedPromotionMetricAuthority({
      snapshotObservedAt: new Date("2026-08-29T17:30:00.000Z"),
      snapshotChangedAt: new Date("2026-08-29T17:00:00.000Z"),
      snapshotMetricsHash: "lower",
      currentHasRegressionFromLatest: false,
      latestObservation: observation(
        "2026-08-29T17:00:00.000Z",
        "lower",
        true,
      ),
    })).toEqual({
      observedAt: new Date("2026-08-29T17:30:00.000Z"),
      regressionState: "confirmed_correction",
    });
  });

  it("marks a later cadence observation as correction confirmation", () => {
    expect(feedPromotionMetricAuthority({
      snapshotObservedAt: new Date("2026-08-29T18:00:00.000Z"),
      snapshotChangedAt: new Date("2026-08-29T17:00:00.000Z"),
      snapshotMetricsHash: "lower",
      currentHasRegressionFromLatest: false,
      latestObservation: observation(
        "2026-08-29T18:00:00.000Z",
        "lower",
        false,
      ),
      previousObservation: observation(
        "2026-08-29T17:00:00.000Z",
        "lower",
        true,
      ),
    })).toMatchObject({ regressionState: "confirmed_correction" });
  });

  it("fails closed without a durable observation binding", () => {
    expect(feedPromotionMetricAuthority({
      snapshotObservedAt: new Date("2026-08-29T17:00:00.000Z"),
      snapshotChangedAt: new Date("2026-08-29T17:00:00.000Z"),
      snapshotMetricsHash: "current",
      currentHasRegressionFromLatest: false,
    })).toBeUndefined();
  });
});
