import { join } from "node:path";

export const historicalPromotionQualityOutput = (input: {
  readonly enabled: boolean;
  readonly reportDirectory: string;
}) => {
  const path = (fileName: string): string | undefined => input.enabled
    ? join(input.reportDirectory, "quality-artifacts", fileName)
    : undefined;
  const args = (fileName: string): readonly string[] => {
    const output = path(fileName);
    return output === undefined ? [] : ["--output-path", output];
  };
  const cleanDayArgs = input.enabled ? [
    ...args("reader-summary-clean-real-day-e2e-report.v1.json"),
    "--collection-quality-path",
    path("yesterday-social-collection-quality-report.v1.json")!,
    "--quality-dashboard-path",
    path("reader-summary-quality-dashboard.v1.json")!,
    "--artifact-quality-path",
    path("yesterday-reader-summary-artifact-quality.v1.json")!,
  ] : [];
  return { args, path, cleanDayArgs } as const;
};
