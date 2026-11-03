/** Narrative input authority is independent of the sealed promotion board. */
export const READER_SUMMARY_DAILY_INPUT_POLICY =
  "reader_summary.daily_input.native_likes.v1" as const;
export const READER_SUMMARY_DAILY_INPUT_LIMIT = 30;

export type ReaderSummaryDailyInputBinding = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly interestId: string;
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly assessmentId: string;
  readonly sourceSnapshotSha256: string;
  readonly inputSha256: string;
  readonly storyId: string;
  readonly providerKey: string;
  /** X likes, Reddit score or HN points; unknown counts remain null. */
  readonly nativeCount: number | null;
  readonly engagementObservedAt: string | null;
};

export type ReaderSummaryDailyInputExclusion = {
  readonly feedItemId: string;
  readonly reason: "unsafe_source" | "missing_context" | "duplicate_story" |
    "appendix_only" | "outside_input_limit";
};

export type ReaderSummaryDailyGenerationInput = {
  readonly policyVersion: typeof READER_SUMMARY_DAILY_INPUT_POLICY;
  readonly manifestSha256: string;
  readonly periodKey: string;
  readonly cutoffAt: string;
  readonly candidateCount: number;
  readonly selected: readonly ReaderSummaryDailyInputBinding[];
  readonly excluded: readonly ReaderSummaryDailyInputExclusion[];
  readonly sent?: ReaderSummaryDailyInputReceipt;
};

/** Constructed by the selected adapter from its actual immutable prompt bytes. */
export type ReaderSummaryDailyInputReceipt = {
  readonly payloadSha256: string;
  readonly evidence: readonly { readonly feedItemId: string; readonly sha256: string }[];
};

export const readReaderSummaryDailyGenerationInput = (
  value: unknown,
): ReaderSummaryDailyGenerationInput | undefined => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v.policyVersion !== READER_SUMMARY_DAILY_INPUT_POLICY ||
      typeof v.manifestSha256 !== "string" || !sha(v.manifestSha256) ||
      typeof v.periodKey !== "string" || v.periodKey.length === 0 ||
      typeof v.cutoffAt !== "string" || !Number.isFinite(Date.parse(v.cutoffAt)) ||
      Object.keys(v).length !== (Object.hasOwn(v, "sent") ? 8 : 7) ||
      !Number.isSafeInteger(v.candidateCount) || Number(v.candidateCount) < 0 || Number(v.candidateCount) > 20_000 ||
      !Array.isArray(v.selected) || v.selected.length > READER_SUMMARY_DAILY_INPUT_LIMIT ||
      !Array.isArray(v.excluded) || v.selected.length + v.excluded.length !== v.candidateCount) return undefined;
  const ids = new Set<string>();
  for (const entry of [...v.selected, ...v.excluded]) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry) ||
        typeof entry.feedItemId !== "string" || entry.feedItemId.length === 0 || ids.has(entry.feedItemId)) return undefined;
    ids.add(entry.feedItemId);
  }
  for (const entry of v.selected) {
    if (Object.keys(entry).length !== 12 || ![entry.sourceItemId, entry.interestId, entry.assessmentId, entry.storyId, entry.providerKey].every(
      field => typeof field === "string" && field.length > 0) ||
      typeof entry.sourceSnapshotSha256 !== "string" || !sha(entry.sourceSnapshotSha256) ||
      typeof entry.inputSha256 !== "string" || !sha(entry.inputSha256) ||
      ![entry.publishedAt, entry.observedAt].every(field => typeof field === "string" && Number.isFinite(Date.parse(field))) ||
      !(entry.nativeCount === null || Number.isSafeInteger(entry.nativeCount)) ||
      !(entry.engagementObservedAt === null || typeof entry.engagementObservedAt === "string" &&
        Number.isFinite(Date.parse(entry.engagementObservedAt)))) return undefined;
  }
  if (new Set(v.selected.map(entry => entry.storyId)).size !== v.selected.length ||
      new Set(v.selected.map(entry => entry.sourceItemId)).size !== v.selected.length ||
      v.excluded.some(entry => Object.keys(entry).length !== 2 || !["unsafe_source", "missing_context", "duplicate_story",
        "appendix_only", "outside_input_limit"].includes(entry.reason))) return undefined;
  if (Object.hasOwn(v, "sent")) {
    const selected = v.selected;
    const sent = v.sent as ReaderSummaryDailyInputReceipt | undefined;
    if (sent === undefined || sent === null || typeof sent !== "object" || Object.keys(sent).length !== 2 ||
        typeof sent.payloadSha256 !== "string" || !sha(sent.payloadSha256) || !Array.isArray(sent.evidence) ||
        sent.evidence.length !== v.selected.length || sent.evidence.some((entry, index) =>
          entry === null || typeof entry !== "object" || Object.keys(entry).length !== 2 ||
          entry.feedItemId !== selected[index].feedItemId || typeof entry.sha256 !== "string" || !sha(entry.sha256))) return undefined;
  }
  return structuredClone(value) as ReaderSummaryDailyGenerationInput;
};

const sha = (value: string): boolean => /^[a-f0-9]{64}$/u.test(value);
