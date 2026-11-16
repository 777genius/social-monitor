import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";

// Measure serialized UTF-8 wire size; batch admission and dispatch live elsewhere.
export const requestBytes = (inputs: readonly ReaderPostPresentationV3Input[]): number =>
  Buffer.byteLength(JSON.stringify({ candidates: inputs.map((input) => ({
    candidateId: input.candidateId, title: input.title, sourceText: input.body,
  })) }), "utf8");
