import { dailyEditorialCoveragePlan } from "../../domain";
import type {
  ProviderReaderSummaryAttempt, ReaderSummaryDailyEditorialAttempt,
  ReaderSummaryModelBudget, ReaderSummaryModelInput,
  ReaderSummaryModelPolicy, ReaderSummaryModelPort,
} from "../../ports";

export type DailyEditorialGenerationResult = {
  readonly attempt: ProviderReaderSummaryAttempt;
  readonly editor?: ReaderSummaryDailyEditorialAttempt;
};

/** Only the daily top-30 profile needs two model calls; older routes are unchanged. */
export async function generateReaderSummaryWithDailyEditor(params: {
  readonly model: ReaderSummaryModelPort;
  readonly input: ReaderSummaryModelInput;
  readonly policy: ReaderSummaryModelPolicy;
  readonly budget: ReaderSummaryModelBudget;
}): Promise<DailyEditorialGenerationResult> {
  const { model, input, policy, budget } = params;
  const route = model.route(input, policy, budget);
  const editor = input.evidence.dailyGenerationInput === undefined ? undefined :
    await model.planDaily?.(input, route);
  if (input.evidence.dailyGenerationInput !== undefined && editor === undefined) {
    throw new Error("Daily editorial planning adapter is unavailable");
  }
  const writerInput: ReaderSummaryModelInput = editor === undefined ? input : {
    ...input,
    coveragePlan: dailyEditorialCoveragePlan(editor.plan, input.evidence),
    dailyEditorialPlan: editor.plan,
    policy: { ...input.policy, maxStories: editor.plan.topics.length },
  };
  const remaining = editor === undefined ? budget : {
    remainingTokens: budget.remainingTokens -
      editor.usage.inputTokens - editor.usage.outputTokens,
    remainingCostUsd: budget.remainingCostUsd - editor.usage.estimatedCostUsd,
  };
  if (remaining.remainingTokens < 0 || remaining.remainingCostUsd < 0) {
    throw new Error("Daily editorial planning consumed the model budget");
  }
  const writerRoute = editor === undefined ? route :
    model.route(writerInput, policy, remaining);
  const attempt = await model.generate(writerInput, writerRoute);
  if (editor !== undefined &&
      ((attempt.draft.usage.inputTokens ?? 0) +
        (attempt.draft.usage.outputTokens ?? 0) > remaining.remainingTokens ||
        attempt.draft.usage.estimatedCostUsd > remaining.remainingCostUsd)) {
    throw new Error("Daily editorial writer exceeded the shared model budget");
  }
  if (editor === undefined) return { attempt };
  return { editor, attempt: { ...attempt, draft: {
    ...attempt.draft,
    usage: {
      inputTokens: attempt.draft.usage.inputTokens === null ? null :
        attempt.draft.usage.inputTokens + editor.usage.inputTokens,
      outputTokens: attempt.draft.usage.outputTokens === null ? null :
        attempt.draft.usage.outputTokens + editor.usage.outputTokens,
      estimatedCostUsd: attempt.draft.usage.estimatedCostUsd + editor.usage.estimatedCostUsd,
    },
  } } };
}
