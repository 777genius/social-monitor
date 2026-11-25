import type { ProductionDayProviderReadiness } from "./reader-summary-production-day-provider-readiness";

export type ProductionDayTerminalOutcome = ReturnType<
  typeof buildProductionDayTerminalOutcome
>;

export const buildProductionDayTerminalOutcome = (params: {
  readonly generatedAt: Date;
  readonly providerReadiness: ProductionDayProviderReadiness;
}) => {
  const { providerReadiness } = params;
  if (
    providerReadiness.status !== "partial" &&
    providerReadiness.status !== "unavailable"
  ) {
    throw new Error(
      "Daily terminal outcome requires verified partial or unavailable evidence",
    );
  }
  if (
    !Number.isFinite(params.generatedAt.getTime()) ||
    providerReadiness.providers.length === 0
  ) {
    throw new Error("Daily terminal outcome evidence is invalid");
  }

  return {
    schemaVersion: 1 as const,
    artifactFormat: "reader-summary-production-day-outcome-v1" as const,
    generatedBy: "npm run run:reader-summary-production-day" as const,
    generatedAt: params.generatedAt.toISOString(),
    requestedDate: providerReadiness.collectionDate,
    outcome: providerReadiness.status,
    terminal: true as const,
    reason:
      providerReadiness.status === "unavailable"
        ? ("verified_provider_unavailability" as const)
        : ("bounded_provider_shortfall" as const),
    boundaries: {
      summaryModelCalled: false as const,
      topicModelCalled: false as const,
      summaryPublished: false as const,
      recollectionPerformedByOutcome: false as const,
    },
    providerReadiness: {
      diagnosticsOwner: providerReadiness.diagnosticsOwner,
      providers: providerReadiness.providers,
    },
  };
};
