import { InMemoryInterestRepository } from "@social-monitor/monitoring/adapters/persistence/in-memory-interest.repository";
import { Interest } from "@social-monitor/monitoring/domain";
import { MonitoringConfiguredInterestReader } from "@social-monitor/relevance/adapters/monitoring/monitoring-configured-interest.reader";
import type { ConfiguredInterestReaderPort, ConfiguredInterestScope } from "@social-monitor/relevance/ports";
import { checkConfiguredInterestReader } from "./check-configured-interest-reader";

export async function liveCheckConfiguredInterests(input: {
  readonly persistence: { readonly mode: "in-memory" } | { readonly mode: "prisma"; readonly databaseUrl: string };
  readonly scope: ConfiguredInterestScope;
  readonly query: string | undefined;
  readonly createdAt: Date;
}): Promise<ConfiguredInterestReaderPort> {
  if (input.persistence.mode === "prisma") {
    return checkConfiguredInterestReader(input.persistence.databaseUrl);
  }
  if (!input.query?.trim()) {
    throw new Error("In-memory live check requires explicit LIVE_MULTI_PROVIDER_INTEREST_QUERY configuration");
  }
  const interests = new InMemoryInterestRepository();
  await interests.save(Interest.create({
    id: input.scope.interestId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    name: "Live check configured interest",
    query: input.query,
    createdAt: input.createdAt,
  }));
  return new MonitoringConfiguredInterestReader(interests);
}
