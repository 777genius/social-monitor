import type { ReaderSummaryDailyGenerationInput } from "../value-objects/reader-summary-daily-generation-input";
import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import type { ReaderSummaryCoveragePlan, ReaderSummaryCoveragePlanItem } from "./reader-summary-coverage-plan";
import { READER_SUMMARY_DAILY_INPUT_POLICY } from "../value-objects/reader-summary-daily-generation-input";

export const DAILY_EDITORIAL_PLAN_VERSION = "reader_summary.daily_editorial.v1" as const;

export type DailyEditorialTopic = {
  readonly title: string;
  readonly why: string;
  readonly depth: "detailed" | "brief";
  readonly feedItemIds: readonly string[];
};

export type DailyEditorialProof = {
  readonly plan: DailyEditorialPlan;
  readonly frozenManifestSha256: string;
  readonly editorRequestSha256: string;
  readonly editorOutputSha256: string;
};

export type DailyEditorialPlan = {
  readonly version: typeof DAILY_EDITORIAL_PLAN_VERSION;
  readonly topics: readonly DailyEditorialTopic[];
};

/** Source IDs are authority, not model-authored story IDs. */
export function validateDailyEditorialPlan(
  value: unknown,
  frozen: ReaderSummaryDailyGenerationInput,
): DailyEditorialPlan {
  if (!record(value) || value.version !== DAILY_EDITORIAL_PLAN_VERSION ||
      Object.keys(value).length !== 2 || !Array.isArray(value.topics) ||
      value.topics.length < 1 || value.topics.length > 10 ||
      frozen.selected.length < 1) {
    throw new Error("Invalid daily editorial plan");
  }
  const selected = new Set(frozen.selected.map(item => item.feedItemId));
  const used = new Set<string>();
  const anchors = new Set<string>();
  const byId = new Map(frozen.selected.map(item => [item.feedItemId, item.storyId] as const));
  const topics = value.topics.map((candidate, index): DailyEditorialTopic => {
    if (!record(candidate) || Object.keys(candidate).length !== 4 ||
        !text(candidate.title, 180) || !text(candidate.why, 400) ||
        (candidate.depth !== "detailed" && candidate.depth !== "brief") ||
        (index === 0 && candidate.depth !== "detailed") ||
        !Array.isArray(candidate.feedItemIds) ||
        candidate.feedItemIds.length < 1 ||
        candidate.feedItemIds.length > frozen.selected.length) {
      throw new Error("Invalid daily editorial topic");
    }
    const ids: string[] = [];
    for (const item of candidate.feedItemIds) {
      if (typeof item !== "string" || !selected.has(item) || used.has(item)) {
        throw new Error("Daily editorial topic references unknown or duplicate source");
      }
      used.add(item);
      ids.push(item);
    }
    const anchor = byId.get(ids[0]!);
    if (anchor === undefined || anchors.has(anchor)) {
      throw new Error("Duplicate daily editorial topic anchor");
    }
    anchors.add(anchor);
    return {
      title: candidate.title.trim(),
      why: candidate.why.trim(),
      depth: candidate.depth,
      feedItemIds: ids,
    };
  });
  return { version: DAILY_EDITORIAL_PLAN_VERSION, topics };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= limit;

/** The writer covers only planned topics; untouched frozen posts remain context. */
export function dailyEditorialCoveragePlan(
  plan: DailyEditorialPlan, evidence: SummaryEvidenceSelection,
): ReaderSummaryCoveragePlan {
  const frozen = evidence.dailyGenerationInput;
  if (frozen === undefined) throw new Error("Daily editorial input is missing");
  const validated = validateDailyEditorialPlan(plan, frozen);
  const bindings = new Map(frozen.selected.map(item => [item.feedItemId, item] as const));
  // The sealed promotion board may have a different evidence set; the daily
  // writer sources come from the frozen ordinary top-30 narrative binding.
  const sources = new Map((evidence.dailyGenerationEvidence ?? evidence.selectedEvidence)
    .map(item => [item.feedItemId, item] as const));
  const items = validated.topics.map((topic): ReaderSummaryCoveragePlanItem => {
    const first = bindings.get(topic.feedItemIds[0]!);
    if (first === undefined) throw new Error("Daily editorial anchor is absent");
    const members = topic.feedItemIds.map(id => sources.get(id));
    if (members.some(member => member === undefined)) {
      throw new Error("Daily editorial source is absent from writer evidence");
    }
    const admitted = members.filter((member): member is NonNullable<typeof member> => member !== undefined);
    return {
      role: "secondary", clusterId: first.storyId, score: 1,
      feedItemIds: topic.feedItemIds,
      providerKeys: [...new Set(admitted.map(item => item.providerKey))],
      interestIds: [...new Set(admitted.map(item => item.interestId))],
      whyImportant: [topic.why],
    };
  });
  return {
    policyVersion: READER_SUMMARY_DAILY_INPUT_POLICY,
    mode: "single_story",
    lead: { ...items[0]!, role: "lead" },
    secondary: items.slice(1),
  };
}

/** Persisted private proof must be bound to one frozen selection and exact normalized plan. */
export function validateDailyEditorialProof(
  value: unknown, frozen: ReaderSummaryDailyGenerationInput,
): DailyEditorialProof {
  if (!record(value) || Object.keys(value).length !== 4 ||
      value.frozenManifestSha256 !== frozen.manifestSha256 ||
      !hex(value.editorRequestSha256) || !hex(value.editorOutputSha256)) {
    throw new Error("Invalid daily editorial proof");
  }
  return {
    plan: validateDailyEditorialPlan(value.plan, frozen),
    frozenManifestSha256: frozen.manifestSha256,
    editorRequestSha256: value.editorRequestSha256,
    editorOutputSha256: value.editorOutputSha256,
  };
}
const hex = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
