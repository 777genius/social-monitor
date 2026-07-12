import type { ReaderSummaryCoveragePlan } from "../../domain";

export const coveragePlanLeadFixture = (
  clusterId: string,
  feedItemId: string,
  score: number,
): NonNullable<ReaderSummaryCoveragePlan["lead"]> => ({
  role: "lead",
  clusterId,
  score,
  feedItemIds: [feedItemId],
  providerKeys: ["reddit"],
  interestIds: ["interest-ai"],
  whyImportant: ["Fresh item"],
});
