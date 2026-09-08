import type { AgentRuntimeExecutionRequest } from "../../apps/agent-runtime/src/agent-runtime-executor.port";

export const outputFor = (request: AgentRuntimeExecutionRequest) => {
  const input = JSON.parse(request.prompt) as { candidates: {
    candidateId: string; bindingId: string; untrustedSource: { bodyPreview: string };
  }[] };
  return { reviews: input.candidates.map((candidate) => ({
    candidateId: candidate.candidateId, bindingId: candidate.bindingId,
    decision: "promote", confidence: 0.95, qualityScore: 0.8,
    interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95, flags: [],
    reason: "Synthetic plumbing evidence", resolvedSoftFlags: [],
    evidence: [{ field: "bodyPreview", start: 0, end: candidate.untrustedSource.bodyPreview.length,
      quote: candidate.untrustedSource.bodyPreview }],
  })) };
};

