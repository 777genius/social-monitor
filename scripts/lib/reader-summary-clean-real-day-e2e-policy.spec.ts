import { describe, expect, it } from "vitest";

import { targetWindowHasEveryPrimaryProvider } from "./reader-summary-clean-real-day-e2e-policy";

describe("clean real-day E2E provider policy", () => {
  it("accepts a complete target day even when a catch-up fresh window is partial", () => {
    expect(
      targetWindowHasEveryPrimaryProvider({ reddit: 341, "x-twitter": 79 }),
    ).toBe(true);
  });

  it("fails closed when a primary provider is absent from the target day", () => {
    expect(targetWindowHasEveryPrimaryProvider({ "x-twitter": 72 })).toBe(
      false,
    );
  });
});
