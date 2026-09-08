import type { InterestRepositoryPort } from "@social-monitor/monitoring/ports";
import type {
  ConfiguredInterestReaderPort, ConfiguredInterestRead, ConfiguredInterestScope,
} from "../../ports";

export class MonitoringConfiguredInterestReader implements ConfiguredInterestReaderPort {
  constructor(private readonly interests: Pick<InterestRepositoryPort, "findById">) {}

  async readCurrent(scope: ConfiguredInterestScope): Promise<ConfiguredInterestRead> {
    try {
      const interest = await this.interests.findById(scope);
      if (interest === null) return { kind: "missing" };
      const value = interest.toSnapshot();
      if (value.tenantId !== scope.tenantId || value.workspaceId !== scope.workspaceId ||
          value.id !== scope.interestId || value.query.trim().length === 0) {
        return { kind: "unavailable" };
      }
      return { kind: "available", interest: Object.freeze({ ...scope, query: value.query }) };
    } catch {
      return { kind: "unavailable" };
    }
  }
}
