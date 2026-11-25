import {
  sealReaderPostPresentationV3,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import { bindHeadline } from "./openai-promotion-presentation-v3-headline";

/** Preserve requested candidate order after the strict wire batch validator. */
export const sealOpenAiPromotionPresentationV3Proposals = (
  inputs: readonly ReaderPostPresentationV3Input[],
  proposals: ReadonlyMap<string, Record<string, unknown>>,
): readonly ReaderPostPresentationV3Result[] => {
  return inputs.map((input) => {
    const proposal = proposals.get(input.candidateId)!;
    if (proposal.status === "unavailable") {
      return { status: "unavailable", reason: "insufficient_support" };
    }
    const headline = bindHeadline(input, proposal);
    return sealReaderPostPresentationV3({ input, headline });
  });
};
