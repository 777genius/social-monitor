import type { ProviderCollectionObservation } from "./provider-collection-observability";
import { selectPreferredProviderScanResult } from "./provider-scan-result-selection";

type Candidate = {
  readonly providerKey: "x-twitter";
  readonly status: "succeeded" | "failed";
  readonly observability: ProviderCollectionObservation;
  readonly label: string;
};

describe("provider scan result selection", () => {
  it("retains a useful attempt when a later attempt is rate limited", () => {
    const useful = candidate({ label: "useful", accepted: 17 });
    const rateLimited = candidate({
      label: "rate-limited",
      accepted: 0,
      status: "failed",
      rateLimited: true,
    });

    expect(selectPreferredProviderScanResult(useful, rateLimited)).toBe(useful);
  });

  it("prefers an attempt that meets the blocking coverage policy", () => {
    const partial = candidate({ label: "partial", accepted: 19 });
    const complete = candidate({ label: "complete", accepted: 20 });

    expect(selectPreferredProviderScanResult(partial, complete)).toBe(complete);
  });

  it("uses the latest attempt when quality evidence is equal", () => {
    const first = candidate({ label: "first", accepted: 17 });
    const latest = candidate({ label: "latest", accepted: 17 });

    expect(selectPreferredProviderScanResult(first, latest)).toBe(latest);
  });
});

function candidate(params: {
  readonly label: string;
  readonly accepted: number;
  readonly status?: "succeeded" | "failed";
  readonly rateLimited?: boolean;
}): Candidate {
  const rateLimitEventCount = params.rateLimited === true ? 1 : 0;
  const reasons = [
    ...(params.accepted < 25 ? (["target_shortfall"] as const) : []),
    ...(params.rateLimited === true ? (["rate_limited"] as const) : []),
  ];

  return {
    providerKey: "x-twitter",
    status: params.status ?? "succeeded",
    label: params.label,
    observability: {
      targetItemCount: 25,
      collectedItemCount: params.accepted,
      acceptedItemCount: params.accepted,
      insertedItemCount: 0,
      outsideWindowItemCount: 0,
      paginationDuplicateItemCount: 0,
      storageDuplicateItemCount: 0,
      totalDuplicateItemCount: 0,
      pageCount: params.accepted > 0 ? 1 : 0,
      paginationStopReason:
        params.status === "failed" ? "failed" : "target_items",
      rateLimitEventCount,
      ...(params.rateLimited === true
        ? ({ failureKind: "rate_limited" } as const)
        : {}),
      coverageState:
        params.accepted >= 20 && rateLimitEventCount === 0
          ? "complete"
          : params.accepted > 0
            ? "partial"
            : "unavailable",
      slo: {
        met: reasons.length === 0,
        targetItemCount: 25,
        evaluatedItemCount: params.accepted,
        coverageRatio: params.accepted / 25,
        freshnessLagSeconds: 0,
        maxFreshnessLagSeconds: 21_600,
        reasons,
        retryDisposition:
          params.rateLimited === true ? "deferred" : "immediate",
      },
      freshness: {
        newestAcceptedPublishedAt: "2026-07-13T23:59:00.000Z",
        lagToWindowEndSeconds: 60,
      },
    },
  };
}
