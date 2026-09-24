import type {
  ReaderCapturedSource,
  ReaderDisplayHeadline,
  ReaderDisplayHeadlineSeal,
  SummaryHeadlineReference,
} from "../value-objects/summary-reader-headline";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "./reader-post-promotion-attestation";
import { validDisplayHeadlineContract } from "./reader-post-display-headline";

export const READER_POST_PRESENTATION_V3 = "reader_post_presentation.v3" as const;
export const READER_POST_PRESENTATION_V3_MAX_TITLE_UTF16 = 2_000;
export const READER_POST_PRESENTATION_V3_MAX_BODY_UTF16 = 64_000;
export const READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES = 1024 * 1024;

export type ReaderPostPresentationV3Input = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly candidateId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly trustedIntent: string;
  readonly sourceSnapshotSha256: string;
  readonly title: string;
  readonly body: string;
  readonly captureComplete: boolean;
};

export type ReaderPostPresentationV3Result =
  | { readonly status: "available"; readonly seal: ReaderDisplayHeadlineSeal;
      readonly presentationInputDigest: string }
  | { readonly status: "unavailable"; readonly reason:
      "incomplete_source" | "input_over_budget" | "unsafe_text" |
      "insufficient_support" | "invalid_presentation" }
  | { readonly status: "dependency_failure"; readonly reason: string };

export interface PromotionPresentationBuilder {
  build(
    inputs: readonly ReaderPostPresentationV3Input[],
  ): Promise<readonly ReaderPostPresentationV3Result[]>;
}

export const readerPostPresentationV3InputDigest = (
  input: ReaderPostPresentationV3Input,
): string => promotionPayloadDigest(canonicalPromotionPayload({
  schemaVersion: READER_POST_PRESENTATION_V3,
  tenantId: input.tenantId,
  workspaceId: input.workspaceId,
  interestId: input.interestId,
  candidateId: input.candidateId,
  sourceItemId: input.sourceItemId,
  sourceBindingId: input.sourceBindingId,
  providerKey: input.providerKey,
  trustedIntent: input.trustedIntent,
  sourceSnapshotSha256: input.sourceSnapshotSha256,
  title: input.title,
  body: input.body,
  captureComplete: input.captureComplete,
}));

/**
 * The interest text is assessment-only.  Publication can bind it
 * deterministically without copying it into an artifact or client payload.
 */
export const readerPostPresentationV3InterestDigest = (input: Pick<
  ReaderPostPresentationV3Input,
  "tenantId" | "workspaceId" | "interestId" | "trustedIntent"
>): string => promotionPayloadDigest(canonicalPromotionPayload({
  schemaVersion: READER_POST_PRESENTATION_V3,
  tenantId: input.tenantId,
  workspaceId: input.workspaceId,
  interestId: input.interestId,
  trustedIntent: input.trustedIntent,
}));

/**
 * Immutable public identity for the exact source snapshot and presentation
 * selected for publication.  It deliberately binds the displayed seal, not
 * merely the private presentation input digest.
 */
export const readerPostPresentationV3Identity = (params: {
  readonly sourceSnapshotSha256: string;
  readonly presentationInputDigest: string;
  readonly displayHeadline: ReaderDisplayHeadlineSeal;
}): string => promotionPayloadDigest(canonicalPromotionPayload({
  schemaVersion: READER_POST_PRESENTATION_V3,
  sourceSnapshotSha256: params.sourceSnapshotSha256,
  presentationInputDigest: params.presentationInputDigest,
  displayHeadline: params.displayHeadline,
}));

/** Converts private assessment output into the signed, public V3 shape. */
export const publicReaderPostPresentationV3Seal = (
  seal: ReaderDisplayHeadlineSeal,
): ReaderDisplayHeadlineSeal => {
  if (seal.headline.status !== "accepted") {
    throw new Error("V3 publication requires an accepted presentation");
  }
  const { trustedIntent, ...publicBinding } = seal.headline.binding;
  if (!trustedIntent) throw new Error("V3 presentation has no private interest binding");
  return {
    ...seal,
    headline: {
      ...seal.headline,
      // The public type is intentionally narrower at runtime than the legacy
      // display headline.  Keep that compatibility boundary here, not in the
      // assessment model where plaintext is required for validation.
      binding: {
        ...publicBinding,
        interestDigest: readerPostPresentationV3InterestDigest({
          tenantId: seal.headline.binding.tenantId,
          workspaceId: seal.headline.binding.workspaceId,
          interestId: seal.headline.binding.interestId,
          trustedIntent,
        }),
      },
    } as unknown as ReaderDisplayHeadline,
  };
};

/** V3 validates exact UTF-16 quote offsets over the full sanitized capture. */
export const sealReaderPostPresentationV3 = (params: {
  readonly input: ReaderPostPresentationV3Input;
  readonly headline: ReaderDisplayHeadline;
}): ReaderPostPresentationV3Result => {
  const { input, headline } = params;
  if (!input.captureComplete) return { status: "unavailable", reason: "incomplete_source" };
  if (input.title.length > READER_POST_PRESENTATION_V3_MAX_TITLE_UTF16 ||
      input.body.length > READER_POST_PRESENTATION_V3_MAX_BODY_UTF16) {
    return { status: "unavailable", reason: "input_over_budget" };
  }
  if (headline.status !== "accepted" || !validHeadline(input, headline)) {
    return { status: "unavailable", reason: "invalid_presentation" };
  }
  const source: ReaderCapturedSource = {
    title: input.title,
    body: input.body,
    captureAvailability: "available",
    reviewAvailability: input.body.trim().length === 0 ? "title_only" : "body_present",
  };
  return {
    status: "available",
    presentationInputDigest: readerPostPresentationV3InputDigest(input),
    seal: {
      headline,
      capturedSourceDigest: promotionPayloadDigest(canonicalPromotionPayload(source)),
    },
  };
};

export const readerPostPresentationV3MatchesCard = (params: {
  readonly title: string;
  readonly providerKey: string;
  readonly candidateId?: string;
  readonly capturedSource?: ReaderCapturedSource;
  readonly headline?: ReaderDisplayHeadline;
  readonly seal: ReaderDisplayHeadlineSeal;
  readonly tenantId: string;
  readonly workspaceId: string;
  /** Supplied only by the locked-assessment publication guard. */
  readonly trustedIntent?: string;
}): boolean => {
  const source = params.capturedSource;
  const headline = params.seal.headline;
  if (source?.body === undefined || headline.status !== "accepted" ||
      params.headline?.status !== "accepted" ||
      canonicalPromotionPayload(headline) !== canonicalPromotionPayload(params.headline) ||
      headline.text !== params.title || headline.binding.providerKey !== params.providerKey ||
      headline.binding.candidateId !== params.candidateId ||
      headline.binding.tenantId !== params.tenantId ||
      headline.binding.workspaceId !== params.workspaceId ||
      source.title.length > READER_POST_PRESENTATION_V3_MAX_TITLE_UTF16 ||
      source.body.length > READER_POST_PRESENTATION_V3_MAX_BODY_UTF16 ||
      params.seal.capturedSourceDigest !== promotionPayloadDigest(canonicalPromotionPayload(source))) {
    return false;
  }
  const binding = headline.binding as Record<string, unknown>;
  const publicBinding = Object.hasOwn(binding, "interestDigest");
  if (publicBinding) {
    const expected = ["candidateId", "providerKey", "tenantId", "workspaceId", "interestId",
      "sourceBindingId", "sourceItemId", "interestDigest", "availability", "reviewedInputDigest"];
    if (Reflect.ownKeys(binding).length !== expected.length ||
        expected.some((key) => !Object.hasOwn(binding, key)) ||
        Object.values(binding).some((value) => typeof value !== "string" || !value.trim()) ||
        !/^[a-f0-9]{64}$/.test(String(binding.interestDigest))) return false;
    if (params.trustedIntent === undefined) return true;
    if (binding.interestDigest !== readerPostPresentationV3InterestDigest({
      tenantId: params.tenantId, workspaceId: params.workspaceId,
      interestId: String(binding.interestId), trustedIntent: params.trustedIntent,
    })) return false;
    const { interestDigest: _interestDigest, ...privateBinding } = binding;
    void _interestDigest;
    return validHeadline({
      tenantId: params.tenantId, workspaceId: params.workspaceId,
      interestId: String(privateBinding.interestId), candidateId: String(privateBinding.candidateId),
      sourceItemId: String(privateBinding.sourceItemId), sourceBindingId: String(privateBinding.sourceBindingId),
      providerKey: String(privateBinding.providerKey), trustedIntent: params.trustedIntent,
      sourceSnapshotSha256: "0".repeat(64), title: source.title, body: source.body,
      captureComplete: true,
    }, { ...headline, binding: { ...privateBinding, trustedIntent: params.trustedIntent } } as
      Extract<ReaderDisplayHeadline, { readonly status: "accepted" }>);
  }
  return validHeadline({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: headline.binding.interestId,
    candidateId: headline.binding.candidateId,
    sourceItemId: headline.binding.sourceItemId,
    sourceBindingId: headline.binding.sourceBindingId,
    providerKey: headline.binding.providerKey,
    trustedIntent: headline.binding.trustedIntent,
    sourceSnapshotSha256: "0".repeat(64),
    title: source.title,
    body: source.body,
    captureComplete: true,
  }, headline);
};

const validHeadline = (
  input: ReaderPostPresentationV3Input,
  headline: Extract<ReaderDisplayHeadline, { readonly status: "accepted" }>,
): boolean => {
  const binding = headline.binding;
  if (binding.candidateId !== input.candidateId ||
      binding.tenantId !== input.tenantId || binding.workspaceId !== input.workspaceId ||
      binding.interestId !== input.interestId || binding.sourceItemId !== input.sourceItemId ||
      binding.providerKey !== input.providerKey ||
      binding.sourceBindingId !== input.sourceBindingId ||
      binding.trustedIntent !== input.trustedIntent ||
      binding.availability !== (input.body.trim().length === 0 ? "title_only" : "body_present") ||
      headline.wholeInput.titleLength !== input.title.length ||
      headline.wholeInput.bodyLength !== input.body.length ||
      headline.text.trim() !== headline.text || headline.text.length === 0 ||
      headline.text.length > 119 || headline.confidence < 0.8 || headline.confidence > 1) {
    return false;
  }
  const digest = promotionPayloadDigest(JSON.stringify({
    candidateId: binding.candidateId,
    providerKey: binding.providerKey,
    context: {
      tenantId: binding.tenantId,
      workspaceId: binding.workspaceId,
      interestId: binding.interestId,
      sourceBindingId: binding.sourceBindingId,
      sourceItemId: binding.sourceItemId,
      trustedIntent: binding.trustedIntent,
      availability: binding.availability,
    },
    title: input.title,
    body: input.body,
  }));
  if (digest !== binding.reviewedInputDigest ||
      !validReferences(headline.support, input)) return false;
  return validDisplayHeadlineContract(headline, {
    title: input.title,
    body: input.body,
    captureAvailability: "available",
    reviewAvailability: input.body.trim().length === 0 ? "title_only" : "body_present",
  }, READER_POST_PRESENTATION_V3_MAX_BODY_UTF16);
};

const validReferences = (
  refs: readonly SummaryHeadlineReference[],
  input: Pick<ReaderPostPresentationV3Input, "title" | "body">,
): boolean => refs.length > 0 && refs.length <= 8 && refs.every((ref) => {
  const text = ref.field === "title" ? input.title : input.body;
  return Number.isSafeInteger(ref.start) && Number.isSafeInteger(ref.end) &&
    ref.start >= 0 && ref.end > ref.start && ref.end <= text.length &&
    text.slice(ref.start, ref.end) === ref.quote;
});
