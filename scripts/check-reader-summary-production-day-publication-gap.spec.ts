import { publicationGapDates } from "./check-reader-summary-production-day-publication-gap";

describe("production-day publication cursor gap", () => {
  it("returns every intervening UTC date and excludes both endpoints", () => {
    expect(publicationGapDates("2026-08-14", "2026-08-18")).toEqual([
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
  });

  it("accepts an ordinary consecutive transition without a database gap", () => {
    expect(publicationGapDates("2026-08-27", "2026-08-28")).toEqual([]);
  });

  it("fails closed for malformed or non-forward transitions", () => {
    expect(() => publicationGapDates("not-a-date", "2026-08-28")).toThrow(
      "publication cursor date is invalid",
    );
    expect(() => publicationGapDates("2026-08-28", "2026-08-28")).toThrow(
      "must follow the current cursor",
    );
    expect(() => publicationGapDates("2026-08-29", "2026-08-28")).toThrow(
      "must follow the current cursor",
    );
  });
});
