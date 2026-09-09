import { isConciseDisplayText } from "../../../domain/services/reader-post-display-headline";
import { isUnavailableDisplayHeadline } from "../../../domain/services/reader-post-display-identity";

/** Shape validation here; aggregate load also verifies against the exact card,
 * captured source, scope, citations and existing promotion attestation. */
export const assertDisplayHeadlineSealPayload = (value: unknown): void => {
  const seal = record(value);
  if (isUnavailableDisplayHeadline(seal.headline)) {
    keys(seal, ["headline"]);
    return;
  }
  keys(seal, ["headline", "capturedSourceDigest"]);
  if (typeof seal.capturedSourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(seal.capturedSourceDigest)) invalid();
  const headline = record(seal.headline);
  keys(headline, ["status", "kind", "text", "binding", "support", "qualifications", "confidence", "wholeInput"]);
  if (headline.status !== "accepted" || !["claim", "subject_label"].includes(String(headline.kind)) ||
      !isConciseDisplayText(headline.text) || typeof headline.confidence !== "number" ||
      !Number.isFinite(headline.confidence) || headline.confidence < 0.8 || headline.confidence > 1) invalid();
  const binding = record(headline.binding);
  keys(binding, ["candidateId", "providerKey", "tenantId", "workspaceId", "interestId", "sourceBindingId",
    "sourceItemId", "trustedIntent", "availability", "reviewedInputDigest"]);
  if (Object.values(binding).some((item) => typeof item !== "string" || !item.trim()) ||
      !["title_only", "body_present"].includes(String(binding.availability)) ||
      !/^[a-f0-9]{64}$/.test(String(binding.reviewedInputDigest))) invalid();
  const whole = record(headline.wholeInput);
  keys(whole, ["titleLength", "bodyLength", "qualificationJudgment"]);
  if (![whole.titleLength, whole.bodyLength].every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0) ||
      !["none", "preserved", "subject_only"].includes(String(whole.qualificationJudgment))) invalid();
  references(headline.support);
  if (!Array.isArray(headline.qualifications) || headline.qualifications.length > 8) invalid();
  for (const raw of headline.qualifications as unknown[]) {
    const qualification = record(raw);
    keys(qualification, ["phrase", "evidence"]);
    if (!isConciseDisplayText(qualification.phrase)) invalid();
    references(qualification.evidence);
  }
};
const references = (value: unknown): void => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) invalid();
  for (const raw of value as unknown[]) {
    const ref = record(raw);
    keys(ref, ["field", "start", "end", "quote"]);
    if (!["title", "bodyPreview"].includes(String(ref.field)) || typeof ref.quote !== "string" || !ref.quote ||
        typeof ref.start !== "number" || typeof ref.end !== "number" || !Number.isSafeInteger(ref.start) ||
        !Number.isSafeInteger(ref.end) || ref.start < 0 || ref.end <= ref.start) invalid();
  }
};
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, expected: readonly string[]): void => {
  if (Reflect.ownKeys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) invalid();
};
const invalid = (): never => { throw new Error("Invalid promotion display headline schema"); };
