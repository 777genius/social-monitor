import type { ReaderSummaryModelBudget, ReaderSummaryModelEstimate } from "../../ports";
import { assertReaderSummaryRepairWithinBudget } from "./agent-runtime-reader-summary-repair-budget-policy";
import { isRepairableNarrativeError } from "./reader-summary-narrative-repair-eligibility";

type ReaderSummaryRepairCause =
  | { readonly kind: "gateway_schema" }
  | { readonly kind: "narrative"; readonly error: unknown };

/**
 * One paid repair admission for gateway schema violations or narrative errors.
 * Unknown failures and repeated attempts never authorize an extra transport.
 * Eligible repairs still pass the exact shared-budget guard before dispatch.
 */
export const admitAgentRuntimeReaderSummaryRepair = (params: Readonly<{
  attempt: "primary" | "repair";
  cause: ReaderSummaryRepairCause;
  spent: ReaderSummaryModelEstimate;
  estimate: ReaderSummaryModelEstimate;
  writerBudget: ReaderSummaryModelBudget | undefined;
}>): boolean => {
  if (params.attempt !== "primary") return false;
  if (params.cause.kind === "narrative" &&
      !isRepairableNarrativeError(params.cause.error)) return false;
  assertReaderSummaryRepairWithinBudget(
    params.spent, params.estimate, params.writerBudget,
  );
  return true;
};
