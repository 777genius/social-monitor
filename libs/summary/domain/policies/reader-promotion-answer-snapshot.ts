/**
 * Consumer-owned, immutable structural view of the relevance assessment.
 *
 * Relevance owns validation and persistence. Summary only reads the admitted
 * answer snapshot to rank/attest candidates. Adapter-boundary parity tests
 * prevent these published choice literals from silently drifting.
 */
export const readerPromotionAnswerChoices = {
  usefulness: ['noise', 'context', 'useful', 'important', 'insufficient_context'],
  relevance: ['unrelated', 'adjacent', 'relevant', 'central', 'insufficient_context'],
  context_sufficiency: ['insufficient', 'partial', 'sufficient'],
  evidence_basis: [
    'observation', 'described_data', 'linked_claim', 'unsupported_claim',
    'no_claim', 'insufficient_context',
  ],
} as const;

export type ReaderPromotionAnswerCriterion = keyof typeof readerPromotionAnswerChoices;
export type ReaderPromotionAnswerChoice<K extends ReaderPromotionAnswerCriterion> =
  (typeof readerPromotionAnswerChoices)[K][number];

export type ReaderPromotionAnswer<K extends ReaderPromotionAnswerCriterion> = {
  readonly choice: ReaderPromotionAnswerChoice<K>;
  readonly probabilities: Readonly<Record<ReaderPromotionAnswerChoice<K>, number>>;
  readonly confidence: number;
  readonly choiceDiffersFromArgmax: boolean;
  readonly probabilityTie: boolean;
};

export type ReaderPromotionAnswers = {
  readonly [K in ReaderPromotionAnswerCriterion]: ReaderPromotionAnswer<K>;
};
