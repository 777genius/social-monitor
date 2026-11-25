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

  it("requires strict generation order before stronger model authority", () => {
    expect(
      canReaderSummaryGenerationSupersede({
        incomingModelVersion: "codex:gpt-5.5:xhigh",
        visibleModelVersion: "deterministic-reader-summary-v1",
        incomingRequestedAt: older,
        visibleRequestedAt: newer,
      }),
    ).toBe(false);
    expect(
      canReaderSummaryGenerationSupersede({
        incomingModelVersion: "deterministic-reader-summary-v1",
        visibleModelVersion: "codex:gpt-5.5:xhigh",
        incomingRequestedAt: newer,
        visibleRequestedAt: older,
      }),
    ).toBe(false);
  });

  it.each([
    {
      label: "missing incoming",
      incomingRequestedAt: undefined,
      visibleRequestedAt: older,
    },
    {
      label: "missing visible",
      incomingRequestedAt: newer,
      visibleRequestedAt: undefined,
    },
    {
      label: "equal",
      incomingRequestedAt: older,
      visibleRequestedAt: older,
    },
    {
      label: "invalid incoming",
      incomingRequestedAt: new Date(Number.NaN),
      visibleRequestedAt: older,
    },
    {
      label: "invalid visible",
      incomingRequestedAt: newer,
      visibleRequestedAt: new Date(Number.NaN),
    },
  ])("fails closed for $label requestedAt", (timestamps) => {
    expect(
      canReaderSummaryGenerationSupersede({
        incomingModelVersion: "codex:gpt-5.5:xhigh",
        visibleModelVersion: "deterministic-reader-summary-v1",
        incomingRequestedAt: timestamps.incomingRequestedAt,
        visibleRequestedAt: timestamps.visibleRequestedAt,
      }),
    ).toBe(false);
  });
});
