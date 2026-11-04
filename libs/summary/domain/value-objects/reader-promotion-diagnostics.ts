import type { ReaderPromotionExclusionReason } from "../policies/reader-promotion-ranking";
import type { ReaderPostPromotionV3Candidate, ReaderPostPromotionV3Selection } from
  "../policies/reader-post-promotion-v3";
import { readReaderPostPresentationFailureDetail,
  type ReaderPostPresentationFailureDetail } from "../services/reader-post-presentation-failure";

const presentationReasons = ["incomplete_source", "input_over_budget", "unsafe_text",
  "insufficient_support", "invalid_presentation", "runtime_failure"] as const;
type PresentationReason = typeof presentationReasons[number];
type SelectionReason = ReaderPromotionExclusionReason | "selected_top" |
  "selected_additional" | "selected_news";
const selectionReasons: readonly SelectionReason[] = ["technical_ineligible",
  "semantic_not_admitted", "appendix_only", "story_representative",
  "news_publisher_duplicate", "presentation_unavailable",
  "presentation_budget_exhausted", "capacity_exhausted", "selected_top",
  "selected_additional", "selected_news"];

/** Operator provenance only. Never source text, prompts or provider responses. */
export type ReaderPromotionDiagnostics = {
  readonly schemaVersion: "reader_promotion_diagnostics.v1";
  readonly candidates: readonly {
    readonly candidateId: string;
    readonly assessmentId: string;
    readonly selectionReason: SelectionReason;
    readonly presentationStatus: "available" | "unavailable" | "pending" | "budget_exhausted";
    readonly presentationAttempted: boolean;
    readonly presentationReason?: PresentationReason;
    readonly presentationValidation?: ReaderPostPresentationFailureDetail;
    readonly representativeCandidateId?: string;
  }[];
};

export const readerPromotionDiagnostics = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
  selection: ReaderPostPromotionV3Selection,
  attempted: ReadonlySet<string>,
): ReaderPromotionDiagnostics => {
  const reasons = new Map<string, SelectionReason>(selection.excluded.map((entry) =>
    [entry.candidateId, entry.reason]));
  for (const placement of ["top", "additional", "news"] as const) {
    for (const candidate of selection[placement]) {
      reasons.set(candidate.candidateId, `selected_${placement}`);
    }
  }
  const published = [...selection.top, ...selection.additional, ...selection.news];
  return { schemaVersion: "reader_promotion_diagnostics.v1", candidates:
    candidates.map((candidate) => {
      const selectionReason = reasons.get(candidate.candidateId);
      if (selectionReason === undefined) throw new Error("Promotion diagnostic needs a final outcome");
      const rawReason = candidate.presentation.status === "unavailable"
        ? candidate.presentation.reason : undefined;
      const reason = presentationReasons.find((value) => value === rawReason);
      const validation = candidate.presentation.status === "unavailable"
        ? readReaderPostPresentationFailureDetail(candidate.presentation.validation) : undefined;
      const representative = selectionReason === "story_representative"
        ? published.find((item) => item.storyId === candidate.storyId ||
          item.sourceItemId === candidate.sourceItemId)?.candidateId : undefined;
      return { candidateId: candidate.candidateId, assessmentId: candidate.assessmentId,
        selectionReason, presentationStatus: candidate.presentation.status,
        presentationAttempted: attempted.has(candidate.candidateId),
        ...(reason === undefined ? {} : { presentationReason: reason }),
        ...(validation === undefined ? {} : { presentationValidation: validation }),
        ...(representative === undefined ? {} : { representativeCandidateId: representative }) };
    }) };
};

/** Malformed optional diagnostics never grant or revoke publication authority. */
export const readReaderPromotionDiagnostics = (value: unknown): ReaderPromotionDiagnostics | undefined => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const root = value as Record<string, unknown>;
  if (Object.keys(root).sort().join(",") !== "candidates,schemaVersion" ||
      root.schemaVersion !== "reader_promotion_diagnostics.v1" ||
      !Array.isArray(root.candidates) || root.candidates.length > 20_000) return undefined;
  const ids = new Set<string>();
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
  const allowed = new Set(["candidateId", "assessmentId", "selectionReason",
    "presentationStatus", "presentationAttempted", "presentationReason",
    "presentationValidation", "representativeCandidateId"]);
  for (const row of root.candidates) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return undefined;
    const item = row as Record<string, unknown>;
    if (Object.keys(item).some((key) => !allowed.has(key)) ||
        typeof item.candidateId !== "string" || !uuid.test(item.candidateId) ||
        ids.has(item.candidateId) || typeof item.assessmentId !== "string" || !uuid.test(item.assessmentId) ||
        !selectionReasons.includes(item.selectionReason as SelectionReason) ||
        !["available", "unavailable", "pending", "budget_exhausted"].includes(String(item.presentationStatus)) ||
        typeof item.presentationAttempted !== "boolean" ||
        (item.presentationReason !== undefined && !presentationReasons.includes(item.presentationReason as PresentationReason)) ||
        (item.presentationValidation !== undefined &&
          (item.presentationStatus !== "unavailable" ||
            readReaderPostPresentationFailureDetail(item.presentationValidation) === undefined)) ||
        (item.representativeCandidateId !== undefined &&
          (typeof item.representativeCandidateId !== "string" || !uuid.test(item.representativeCandidateId)))) return undefined;
    ids.add(item.candidateId);
  }
  return structuredClone(value) as ReaderPromotionDiagnostics;
};
