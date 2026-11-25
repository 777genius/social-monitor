import type { SourceFetchTelemetry } from "../../ports";

export type ExecuteScanResult = {
  readonly scanJobId: string;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
  readonly warnings: readonly string[];
  readonly telemetry?: SourceFetchTelemetry;
};
