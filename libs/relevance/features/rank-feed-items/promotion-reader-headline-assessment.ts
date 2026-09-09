import {
  isConcisePromotionHeadline, isRoundTrippingHeadlineText, unavailablePromotionHeadline,
  type PromotionEvidenceReference, type PromotionHeadlineQualification,
  type PromotionReaderHeadline,
} from "../../domain/promotion-reader-headline";
import { SourceContentSafetyPolicy } from "../../domain/source-content-safety";
import type { SourceContentQualityReviewRequest, SourceContentQualityReviewResult } from "../../ports";
import { validPromotionReferences } from "./promotion-evidence-reference";

// Provenance and structure checks do not prove natural-language entailment.
// wholeInput is the model's bounded semantic judgment, never a formal proof.
export const assessPromotionReaderHeadline = (
  request: SourceContentQualityReviewRequest,
  review: SourceContentQualityReviewResult | undefined,
): PromotionReaderHeadline => {
  const unavailable = unavailablePromotionHeadline;
  const assessment = review?.assessment;
  const input = assessment?.headlineInput;
  const context = request.promotion;
  if (assessment?.readerHeadline === undefined) return unavailable("not_assessed");
  if (!context || assessment.binding !== context || review?.candidateId !== request.candidateId ||
      input?.request !== request || input.title !== request.title ||
      input.body !== (request.bodyPreview ?? "") || !/^[a-f0-9]{64}$/.test(input.reviewedInputDigest)) {
    return unavailable("invalid_assessment");
  }
  if (context.availability === "truncated" || request.title.length > 2_000 || input.body.length > 12_000 ||
      !["body_present", "title_only"].includes(context.availability) ||
      (context.availability === "title_only") !== !input.body.trim()) return unavailable("incomplete_source");
  if (!isRoundTrippingHeadlineText(input.title) || !isRoundTrippingHeadlineText(input.body)) {
    return unavailable("unsafe_text");
  }
  const raw = assessment.readerHeadline;
  if (hasKeys(raw, ["status", "reasonCode"]) && raw.status === "unavailable" &&
      typeof raw.reasonCode === "string" &&
      ["incomplete_source", "unresolved_qualifications", "insufficient_support"].includes(raw.reasonCode)) {
    return unavailable(raw.reasonCode as "incomplete_source" | "unresolved_qualifications" | "insufficient_support");
  }
  if (!hasKeys(raw, ["status", "kind", "text", "support", "qualifications", "confidence", "wholeInput"]) ||
      raw.status !== "available" || (raw.kind !== "claim" && raw.kind !== "subject_label") ||
      !isConcisePromotionHeadline(raw.text) || typeof raw.confidence !== "number" ||
      !Number.isFinite(raw.confidence) || raw.confidence < 0.8 || raw.confidence > 1 ||
      !strictReferences(request, raw.support) || !Array.isArray(raw.qualifications) ||
      raw.qualifications.length > 8) return unavailable("invalid_assessment");
  const whole = raw.wholeInput;
  if (!hasKeys(whole, ["titleLength", "bodyLength", "qualificationJudgment"]) ||
      whole.titleLength !== input.title.length || whole.bodyLength !== input.body.length) {
    return unavailable("incomplete_source");
  }
  const text = raw.text;
  const safety = new SourceContentSafetyPolicy().evaluate({ title: text, providerKey: request.providerKey });
  if (safety.status !== "allowed" || safety.sanitizedTitle !== text) return unavailable("unsafe_text");
  const qualifications: PromotionHeadlineQualification[] = [];
  for (const entry of raw.qualifications) {
    if (!hasKeys(entry, ["phrase", "evidence"]) || !isConcisePromotionHeadline(entry.phrase) ||
        !text.includes(entry.phrase) || !strictReferences(request, entry.evidence) ||
        qualifications.some((q) => q.phrase === entry.phrase)) return unavailable("invalid_assessment");
    qualifications.push(Object.freeze({ phrase: entry.phrase, evidence: copyReferences(entry.evidence) }));
  }
  // Count every serialized occurrence, including repeated coordinates across roles.
  // No evidence or qualification is shortened to fit.
  const allRefs = [...raw.support, ...qualifications.flatMap((q) => q.evidence)];
  if (allRefs.length > 8 || allRefs.some((ref) => ref.quote.length > 256) ||
      allRefs.reduce((sum, ref) => sum + ref.quote.length, 0) > 512 ||
      allRefs.reduce((sum, ref) => sum + JSON.stringify(ref.quote).length, 0) > 1_024) return unavailable("unresolved_qualifications");
  if (raw.kind === "claim") {
    if ((qualifications.length === 0 && whole.qualificationJudgment !== "none") ||
        (qualifications.length > 0 && whole.qualificationJudgment !== "preserved")) {
      return unavailable("unresolved_qualifications");
    }
  } else if (whole.qualificationJudgment !== "subject_only" || qualifications.length !== 0 ||
      renderSubjectLabel(request, raw.support) !== text) return unavailable("insufficient_support");
  return Object.freeze({ status: "accepted", kind: raw.kind, text,
    binding: Object.freeze({ ...context, candidateId: request.candidateId, providerKey: request.providerKey,
      availability: context.availability, reviewedInputDigest: input.reviewedInputDigest }),
    confidence: raw.confidence, support: copyReferences(raw.support),
    qualifications: Object.freeze(qualifications),
    wholeInput: Object.freeze({ titleLength: input.title.length, bodyLength: input.body.length,
      qualificationJudgment: whole.qualificationJudgment as "none" | "preserved" | "subject_only" }),
  });
};

const hasKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
  Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const refKey = (ref: PromotionEvidenceReference): string => `${ref.field}:${ref.start}:${ref.end}`;

const strictReferences = (request: SourceContentQualityReviewRequest, value: unknown):
  value is readonly PromotionEvidenceReference[] => {
  if (!Array.isArray(value) || !value.every((ref) => hasKeys(ref, ["field", "start", "end", "quote"]))) return false;
  const refs = value as unknown as readonly PromotionEvidenceReference[];
  return validPromotionReferences(request, refs) && new Set(refs.map(refKey)).size === refs.length;
};

const copyReferences = (refs: readonly PromotionEvidenceReference[]) =>
  Object.freeze(refs.map((ref) => Object.freeze({ ...ref })));

// Narrow noun grammar: one exact proper-name token, optional exact version,
// and one exact allowlisted topic noun. Model must establish their relationship
// in this candidate; this syntax alone cannot disambiguate entities.
const renderSubjectLabel = (request: SourceContentQualityReviewRequest, refs: readonly PromotionEvidenceReference[]): string | undefined => {
  if (refs.length < 2 || refs.length > 3 || !refs.every((ref) => wholeSubjectToken(request, ref))) return undefined;
  const entity = refs[0]!.quote;
  const topic = refs[refs.length - 1]!.quote;
  if (!/^[\p{Lu}][\p{L}\p{M}\p{N}-]{1,39}$/u.test(entity) ||
      !["benchmark", "compiler", "model", "editor", "API", "release", "safety", "latency"].includes(topic)) return undefined;
  if (refs.length === 3 && !/^v\d{1,3}(?:\.\d{1,3}){0,2}$/.test(refs[1]!.quote)) return undefined;
  return `${refs.map((ref) => ref.quote).join(" ")} discussion`;
};

// Unicode code points on both sides, including astral letters and combining
// marks. Conservatively treat name/version joiners as token continuations.
const wholeSubjectToken = (request: SourceContentQualityReviewRequest, ref: PromotionEvidenceReference): boolean => {
  const source = request[ref.field] ?? "";
  const before = [...source.slice(0, ref.start)].at(-1) ?? "";
  const after = [...source.slice(ref.end)][0] ?? "";
  const continuation = /[\p{L}\p{M}\p{N}\p{Pc}\p{Pd}\p{Cf}.+\u2212'’]/u;
  return !continuation.test(before) && !continuation.test(after);
};
