import { canReaderSummaryGenerationSupersede } from "./reader-summary-publication-generation-policy";

describe("canReaderSummaryGenerationSupersede", () => {
  const older = new Date("2026-07-09T10:00:00.000Z");
  const newer = new Date("2026-07-09T10:05:00.000Z");

  it("blocks an older generation with equal model authority", () => {
    expect(
      canReaderSummaryGenerationSupersede({
        incomingModelVersion: "codex:gpt-5.5:xhigh",
        visibleModelVersion: "codex:gpt-5.5:xhigh",
        incomingRequestedAt: older,
        visibleRequestedAt: newer,
      }),
    ).toBe(false);
  });

  it("allows a newer generation with equal model authority", () => {
    expect(
      canReaderSummaryGenerationSupersede({
        incomingModelVersion: "codex:gpt-5.5:xhigh",
        visibleModelVersion: "codex:gpt-5.5:xhigh",
        incomingRequestedAt: newer,
        visibleRequestedAt: older,
      }),
    ).toBe(true);
  });

  it("keeps model authority stronger than generation order", () => {
    expect(
      canReaderSummaryGenerationSupersede({
        incomingModelVersion: "codex:gpt-5.5:xhigh",
        visibleModelVersion: "deterministic-reader-summary-v1",
        incomingRequestedAt: older,
        visibleRequestedAt: newer,
      }),
    ).toBe(true);
    expect(
      canReaderSummaryGenerationSupersede({
        incomingModelVersion: "deterministic-reader-summary-v1",
        visibleModelVersion: "codex:gpt-5.5:xhigh",
        incomingRequestedAt: newer,
        visibleRequestedAt: older,
      }),
    ).toBe(false);
  });
});
