import { buildProductionDayTerminalOutcome } from "./reader-summary-production-day-outcome";
import type { ProductionDayProviderReadiness } from "./reader-summary-production-day-provider-readiness";

describe("reader summary production-day terminal outcome", () => {
  it.each(["partial", "unavailable"] as const)(
    "records a terminal %s outcome without model, publication, or recollection",
    (status) => {
      const artifact = buildProductionDayTerminalOutcome({
        generatedAt: new Date("2026-07-28T01:00:00.000Z"),
        providerReadiness: readiness(status),
      });

      expect(artifact).toMatchObject({
        requestedDate: "2026-07-27",
        outcome: status,
        terminal: true,
        boundaries: {
          summaryModelCalled: false,
          topicModelCalled: false,
          summaryPublished: false,
          recollectionPerformedByOutcome: false,
        },
        providerReadiness: {
          diagnosticsOwner: "postgres_feed_items_published_window",
        },
      });
    },
  );

  it("rejects complete or blocked evidence", () => {
    for (const status of ["complete", "blocked"] as const) {
      expect(() =>
        buildProductionDayTerminalOutcome({
          generatedAt: new Date("2026-07-28T01:00:00.000Z"),
          providerReadiness: readiness(status),
        }),
      ).toThrow("requires verified partial or unavailable evidence");
    }
  });
});

const readiness = (
  status: ProductionDayProviderReadiness["status"],
): ProductionDayProviderReadiness => ({
  status,
  summaryPolicy: status === "complete" ? "allowed" : "blocked",
  collectionDate: "2026-07-27",
  diagnosticsOwner: "postgres_feed_items_published_window",
  providers: [
    {
      providerKey: "reddit",
      state: status === "unavailable" ? "unavailable" : "partial",
      evidence:
        status === "unavailable"
          ? "explicit_unavailable"
          : "live_collection",
      databaseFeedItemCount: status === "unavailable" ? 0 : 99,
      collectionFeedItemCount: status === "unavailable" ? 0 : 99,
      minimumFeedItemCount: 50,
      reasonCodes:
        status === "unavailable"
          ? ["provider_unavailable"]
          : ["target_shortfall"],
    },
  ],
  readiness: {
    ready: status === "complete",
    policy: status === "complete" ? "complete" : "blocked",
    collectionDate: "2026-07-27",
    requiredProviderKeys: [],
    providerStates: [],
    readyProviderKeys: [],
    blockingProviderKeys: [],
    missingProviderKeys: [],
    duplicateProviderKeys: [],
    emptyProviderKeys: [],
    partialProviderKeys: [],
    unavailableProviderKeys: [],
    retrySchedule: null,
    barrierMessage: null,
  },
  barrierMessage: status === "blocked" ? "blocked" : null,
});
