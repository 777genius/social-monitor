import { decodeMimoQualifiedHeadlines, MIMO_QUALIFIED_HEADLINE_CONTRACT } from
  "./mimo-qualified-headline-codec";
import type { ReaderPostPresentationCandidate,
  ReaderPostPresentationProposalFailure } from "./reader-post-presentation-v3-proposal";

type CandidateDecode = {
  readonly candidateId: string;
  readonly proposal?: Record<string, unknown>;
  readonly failure?: ReaderPostPresentationProposalFailure;
};

/**
 * Preserve the exact batch envelope and unique requested identities. Once
 * attribution is unambiguous, each headline passes the unchanged strict
 * single-candidate decoder; a bad sibling cannot revoke a valid headline.
 */
export const decodeReaderPostPresentationBatch = (
  value: unknown, candidates: readonly ReaderPostPresentationCandidate[],
): readonly CandidateDecode[] => {
  const reject = (code: ReaderPostPresentationProposalFailure["code"]) =>
    candidates.map(({ candidateId }) => ({ candidateId, failure: { code } }));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return reject("proposal_fields");
  }
  const wire = value as Record<string, unknown>;
  if (Reflect.ownKeys(wire).length !== 2 ||
      !Object.hasOwn(wire, "contractVersion") || !Object.hasOwn(wire, "presentations") ||
      wire.contractVersion !== MIMO_QUALIFIED_HEADLINE_CONTRACT ||
      !Array.isArray(wire.presentations)) return reject("proposal_fields");
  if (candidates.length < 1 || candidates.length > 4 ||
      wire.presentations.length !== candidates.length) return reject("proposal_cardinality");
  const requested = new Set(candidates.map(({ candidateId }) => candidateId));
  if (requested.size !== candidates.length) return reject("proposal_shape_or_identity");
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of wire.presentations) {
    if (item === null || typeof item !== "object" || Array.isArray(item) ||
        typeof item.candidateId !== "string" || !requested.has(item.candidateId) ||
        byId.has(item.candidateId)) return reject("proposal_shape_or_identity");
    byId.set(item.candidateId, item as Record<string, unknown>);
  }
  return candidates.map((candidate) => {
    const decoded = decodeMimoQualifiedHeadlines({
      contractVersion: MIMO_QUALIFIED_HEADLINE_CONTRACT,
      presentations: [byId.get(candidate.candidateId)!],
    }, [candidate]);
    return decoded.failure === null
      ? { candidateId: candidate.candidateId, proposal: decoded.output.presentations[0]! }
      : { candidateId: candidate.candidateId, failure: decoded.failure };
  });
};
