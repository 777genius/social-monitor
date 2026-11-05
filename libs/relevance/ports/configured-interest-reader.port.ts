import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export const CONFIGURED_INTEREST_READER = Symbol("CONFIGURED_INTEREST_READER");

export type ConfiguredInterestScope = Readonly<{
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  interestId: string;
}>;
export type ConfiguredInterest = ConfiguredInterestScope & Readonly<{ query: string }>;
export type ConfiguredInterestRead =
  | Readonly<{ kind: "available"; interest: ConfiguredInterest }>
  | Readonly<{ kind: "missing" | "unavailable" }>;

// Current configuration, not ingestion-time reconstruction. New generations
// resolve once per scoped interest; immutable publication recovery uses evidence.
export interface ConfiguredInterestReaderPort {
  readCurrent(scope: ConfiguredInterestScope): Promise<ConfiguredInterestRead>;
}
