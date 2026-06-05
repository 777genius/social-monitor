export type ExecuteScanResult = {
  readonly scanJobId: string;
  readonly fetched: number;
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly projected: number;
};
