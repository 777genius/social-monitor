import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import type {
  ReaderCapturedSource, ReaderDisplayHeadline, SummaryHeadlineReference,
} from "../value-objects/summary-reader-headline";
import { isReaderFacingTopReadTitle } from "../policies/reader-display-title-policy";
import { canonicalPromotionPayload, promotionPayloadDigest } from "./reader-post-promotion-attestation";

export const capturedReaderSource = (lead: SummaryEvidenceItem): ReaderCapturedSource => ({
  title: lead.title,
  ...(lead.sourceText === undefined ? {} : { body: lead.sourceText }),
  captureAvailability: lead.sourceText === undefined ? "unavailable" : "available",
  reviewAvailability: lead.readerHeadline?.status === "accepted"
    ? lead.readerHeadline.binding?.availability ?? "unavailable" : "unavailable",
});

export const readerCapturedSourceDigest = (source: ReaderCapturedSource): string =>
  promotionPayloadDigest(canonicalPromotionPayload(source));

export const isDisplayRoundTripText = (text: string): boolean =>
  !text.includes("\u0000") && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);

export const isConciseDisplayText = (text: unknown): text is string =>
  typeof text === "string" && text.length > 0 && text.length <= 119 &&
  text === text.trim() && isDisplayRoundTripText(text) &&
  !hasHeadlineControlCharacter(text) && !/[\u2028\u2029\u202a-\u202e\u2066-\u2069<>]|https?:\/\/|\.\.\.|…/u.test(text) &&
  isReaderFacingTopReadTitle(text);

/** Rechecks provenance, never generates text or infers semantic approval. */
export const readerPostDisplayHeadline = (
  lead: SummaryEvidenceItem,
  scope?: Readonly<{ tenantId: string; workspaceId: string }>,
): ReaderDisplayHeadline => {
  const headline = lead.readerHeadline;
  const unavailable = (reasonCode: "not_assessed" | "invalid_assessment" | "incomplete_source"):
    ReaderDisplayHeadline => ({ status: "unavailable", reasonCode });
  if (headline === undefined) return unavailable("not_assessed");
  if (headline.status === "unavailable") return { status: "unavailable",
    reasonCode: ["not_assessed", "invalid_assessment", "incomplete_source", "unsafe_text",
      "unresolved_qualifications", "insufficient_support"].includes(headline.reasonCode)
      ? headline.reasonCode : "invalid_assessment" };
  const source = capturedReaderSource(lead);
  if (lead.sourceText === undefined) return unavailable("incomplete_source");
  if (!validDisplayHeadlineSource(headline, source)) return unavailable("invalid_assessment");
  const binding = headline.binding;
  if (binding.candidateId !== lead.feedItemId || binding.providerKey !== lead.providerKey ||
      binding.sourceItemId !== lead.sourceItemId || binding.sourceBindingId !== lead.sourceBindingId ||
      binding.interestId !== lead.interestId || (scope !== undefined &&
        (scope.tenantId !== binding.tenantId || scope.workspaceId !== binding.workspaceId))) {
    return unavailable("invalid_assessment");
  }
  return headline;
};

export const validDisplayHeadlineSource = (
  value: unknown, source: ReaderCapturedSource,
): value is Extract<ReaderDisplayHeadline, { status: "accepted" }> => {
  if (!exact(value, ["status", "kind", "text", "binding", "support", "qualifications", "confidence", "wholeInput"]) ||
      value.status !== "accepted" || !["claim", "subject_label"].includes(String(value.kind)) ||
      !isConciseDisplayText(value.text) || typeof value.confidence !== "number" ||
      !Number.isFinite(value.confidence) || value.confidence < 0.8 || value.confidence > 1 ||
      !exact(source, ["title", "body", "captureAvailability", "reviewAvailability"]) ||
      source.captureAvailability !== "available" || typeof source.title !== "string" ||
      typeof source.body !== "string" || !isDisplayRoundTripText(source.title) ||
      !isDisplayRoundTripText(source.body) || source.title.length > 2_000 || source.body.length > 12_000) return false;
  const binding = value.binding;
  if (!exact(binding, ["candidateId", "providerKey", "tenantId", "workspaceId", "interestId",
    "sourceBindingId", "sourceItemId", "trustedIntent", "availability", "reviewedInputDigest"]) ||
      Object.values(binding).some((v) => typeof v !== "string" || v.trim() === "") ||
      !["title_only", "body_present"].includes(String(binding.availability)) ||
      binding.availability !== source.reviewAvailability ||
      (binding.availability === "title_only") !== !source.body.trim()) return false;
  const context = {
    tenantId: binding.tenantId, workspaceId: binding.workspaceId, interestId: binding.interestId,
    sourceBindingId: binding.sourceBindingId, sourceItemId: binding.sourceItemId,
    trustedIntent: binding.trustedIntent, availability: binding.availability,
  };
  const digest = promotionPayloadDigest(JSON.stringify({ candidateId: binding.candidateId,
    providerKey: binding.providerKey, context, title: source.title, body: source.body }));
  if (digest !== binding.reviewedInputDigest) return false;
  const whole = value.wholeInput;
  if (!exact(whole, ["titleLength", "bodyLength", "qualificationJudgment"]) ||
      whole.titleLength !== source.title.length || whole.bodyLength !== source.body.length ||
      !references(value.support, source) || !Array.isArray(value.qualifications) ||
      value.qualifications.length > 8) return false;
  const phrases = new Set<string>();
  const refs = [...value.support];
  for (const q of value.qualifications) {
    if (!exact(q, ["phrase", "evidence"]) || !isConciseDisplayText(q.phrase) ||
        !value.text.includes(q.phrase) || phrases.has(q.phrase) || !references(q.evidence, source)) return false;
    phrases.add(q.phrase);
    refs.push(...q.evidence);
  }
  if (refs.length > 8 || refs.some((ref) => ref.quote.length > 256) ||
      refs.reduce((sum, ref) => sum + ref.quote.length, 0) > 512 ||
      refs.reduce((sum, ref) => sum + JSON.stringify(ref.quote).length, 0) > 1_024) return false;
  if (value.kind === "claim") return whole.qualificationJudgment ===
    (value.qualifications.length === 0 ? "none" : "preserved");
  const support = value.support;
  return whole.qualificationJudgment === "subject_only" && phrases.size === 0 &&
    support.length >= 2 && support.length <= 3 && support.every((ref) => wholeSubjectToken(source, ref)) &&
    /^[\p{Lu}][\p{L}\p{M}\p{N}-]{1,39}$/u.test(support[0]!.quote) &&
    ["benchmark", "compiler", "model", "editor", "API", "release", "safety", "latency"].includes(support.at(-1)!.quote) &&
    (support.length !== 3 || /^v\d{1,3}(?:\.\d{1,3}){0,2}$/.test(support[1]!.quote)) &&
    value.text === `${support.map((ref) => ref.quote).join(" ")} discussion`;
};

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const referenceKey = (ref: SummaryHeadlineReference): string => `${ref.field}:${ref.start}:${ref.end}`;
const references = (value: unknown, source: ReaderCapturedSource): value is readonly SummaryHeadlineReference[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return false;
  return value.every((ref) => {
    if (!exact(ref, ["field", "start", "end", "quote"]) ||
        (ref.field !== "title" && ref.field !== "bodyPreview") ||
        typeof ref.start !== "number" || typeof ref.end !== "number" ||
        !Number.isSafeInteger(ref.start) || !Number.isSafeInteger(ref.end) || ref.start < 0 ||
        ref.end <= ref.start || typeof ref.quote !== "string" || ref.quote.trim().length === 0 ||
        !isDisplayRoundTripText(ref.quote)) return false;
    const text = ref.field === "title" ? source.title : source.body!;
    return ref.end <= text.length && text.slice(ref.start, ref.end) === ref.quote;
  }) && new Set((value as SummaryHeadlineReference[]).map(referenceKey)).size === value.length;
};

// Match the upstream Unicode name/version boundary, including astral code points.
const wholeSubjectToken = (source: ReaderCapturedSource, ref: SummaryHeadlineReference): boolean => {
  const text = ref.field === "title" ? source.title : source.body!;
  const before = [...text.slice(0, ref.start)].at(-1) ?? "";
  const after = [...text.slice(ref.end)][0] ?? "";
  const continuation = /[\p{L}\p{M}\p{N}\p{Pc}\p{Pd}\p{Cf}.+\u2212'’]/u;
  return !continuation.test(before) && !continuation.test(after);
};

const hasHeadlineControlCharacter = (text: string): boolean =>
  [...text].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
