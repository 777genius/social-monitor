import type {
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelPolicy,
  SummaryModelRoute,
} from "../../ports";
import { assertOpenAiSummaryWithinBudget } from "./openai-responses-summary-budget";

const provider = 'openai-responses';

/** Pure provider/schema route identity and pre-dispatch admission; no HTTP or credentials. */
export const admitOpenAiSummaryRoute = (params: {
  readonly model: string;
  readonly promptVersion: string;
  readonly policy: SummaryModelPolicy;
  readonly budget: SummaryModelBudget;
  readonly estimate: (route: SummaryModelRoute) => SummaryModelEstimate;
}): SummaryModelRoute => {
  const route: SummaryModelRoute = {
    provider,
    model: params.model,
    promptVersion: params.promptVersion,
    schemaVersion: 'summary.artifact.v1',
  };
  assertOpenAiSummaryWithinBudget(params.estimate(route), params.policy, params.budget);
  return route;
};
