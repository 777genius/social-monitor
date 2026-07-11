import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryTopicLabelerPort,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicMapPublicationAuditPort,
  ReaderSummaryTopicMapPublicationRejection,
  ReaderSummaryTopicRelationVerifierInput,
  ReaderSummaryTopicRelationVerifierPort,
} from "../../ports";
import type { StoryCluster, SummaryEvidenceItem } from "../../domain";
import { BuildReaderSummaryTopicMapUseCase } from "./build-reader-summary-topic-map.use-case";

describe("BuildReaderSummaryTopicMapUseCase", () => {
  it("uses topic labeler output without letting it change evidence scores", async () => {
    const labeler = new CapturingTopicLabeler();
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler,
    }).execute(command());

    expect(labeler.inputs).toHaveLength(1);
    expect(labeler.inputs[0]?.candidates[0]?.labelCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringContaining("Runtime") }),
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.generatedBy).toBe("agent-runtime");
    expect(result.value.nodes[0]).toMatchObject({
      id: "topic:story:runtime",
      label: "Runtime agents",
      groupId: "group:ungrouped",
    });
    expect(result.value.nodes[0]?.popularityScore).toBeGreaterThan(0);
  });

  it("fails instead of silently downgrading when agent-runtime labeling fails", async () => {
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new FailingTopicLabeler(),
    }).execute(command());

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected topic map labeling to fail");
    }
    expect(result.error.message).toContain("agent runtime unavailable");
  });

  it("uses deterministic labels only in deterministic mode", async () => {
    const result = await new BuildReaderSummaryTopicMapUseCase().execute(
      command(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.generatedBy).toBe("deterministic");
    expect(result.value.nodes[0]?.label).toBe("Runtime Signal");
  });

  it("requires a topic labeler in agent-runtime mode", async () => {
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
    }).execute(command());

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected topic map labeling to fail");
    }
    expect(result.error.message).toContain("requires a topic labeler");
  });

  it("rejects an LLM map whose proposed groups have no shared evidence anchors", async () => {
    const publicationAudit = new RecordingTopicMapPublicationAudit();
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new UnsupportedGroupTopicLabeler(),
      publicationAudit,
    }).execute(multiTopicCommand());

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected topic map publication quality to fail");
    }
    expect(result.error.message).toContain("failed publication quality");
    expect(result.error.message).toContain("supported semantic groups");
    expect(publicationAudit.rejections).toHaveLength(1);
    expect(publicationAudit.rejections[0]).toMatchObject({
      minimumGroupedCoverage: 0.5,
      structureQuality: { passed: false },
    });
  });

  it("applies only focused relation-verifier decisions to topic aggregation", async () => {
    const verifier = new AcceptingTopicRelationVerifier();
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new RelatedTopicLabeler(),
      relationVerifier: verifier,
    }).execute(relatedTopicCommand());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(verifier.inputs).toHaveLength(1);
    expect(verifier.inputs[0]?.relations).toEqual([
      expect.objectContaining({
        sharedTerms: expect.arrayContaining(["work", "codex"]),
      }),
    ]);
    expect(result.value.nodes).toHaveLength(1);
    expect(result.value.nodes[0]).toMatchObject({ evidenceCount: 2 });
  });

  it("reviews and splits an existing LLM merge when verification rejects it", async () => {
    const verifier = new RejectingTopicRelationVerifier();
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new MergedRelatedTopicLabeler(),
      relationVerifier: verifier,
    }).execute(relatedTopicCommand());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(verifier.inputs[0]?.relations).toHaveLength(1);
    expect(result.value.nodes).toHaveLength(2);
    expect(new Set(result.value.nodes.map((node) => node.id)).size).toBe(2);
  });

  it("keeps LLM labels but splits proposed merges when relation verification is unavailable", async () => {
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new MergedRelatedTopicLabeler(),
      relationVerifier: new FailingTopicRelationVerifier(),
    }).execute(relatedTopicCommand());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.generatedBy).toBe("agent-runtime");
    expect(result.value.nodes).toHaveLength(2);
    expect(new Set(result.value.nodes.map((node) => node.id)).size).toBe(2);
    expect(result.value.warnings).toContain(
      "Topic merges were kept separate because focused semantic relation verification was unavailable",
    );
  });

  it("fails closed when the LLM proposes a merge without a verifier", async () => {
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new MergedRelatedTopicLabeler(),
    }).execute(relatedTopicCommand());

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected unverified LLM merge to fail");
    }
    expect(result.error.message).toContain("requires a relation verifier");
  });

  it("keeps one labeler candidate per story cluster before LLM aggregation", async () => {
    const labeler = new CapturingAllTopicLabeler();
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler,
    }).execute(relatedTopicCommand());

    expect(result.ok).toBe(true);
    expect(labeler.nodeIds).toEqual([
      "topic:story:work-0",
      "topic:story:work-1",
    ]);
  });

  it("verifies a ten-node proposed merge with a minimal relation tree", async () => {
    const verifier = new AcceptingTopicRelationVerifier();
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new MergedRelatedTopicLabeler(),
      relationVerifier: verifier,
    }).execute(manyTopicCommand(10));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(verifier.inputs[0]?.relations).toHaveLength(24);
    expect(
      new Set(
        verifier.inputs[0]?.relations
          .slice(0, 9)
          .flatMap((relation) => [
            relation.sourceNodeId,
            relation.targetNodeId,
          ]),
      ).size,
    ).toBe(10);
    expect(result.value.nodes).toHaveLength(1);
  });

  it("keeps the hard limit for a genuinely oversized verification tree", async () => {
    const verifier = new AcceptingTopicRelationVerifier();
    const result = await new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new MergedRelatedTopicLabeler(),
      relationVerifier: verifier,
    }).execute(manyTopicCommand(26));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected oversized topic verification to fail");
    }
    expect(result.error.message).toContain("25 checks");
    expect(result.error.message).toContain("safe limit of 24");
    expect(verifier.inputs).toHaveLength(0);
  });
});

class CapturingTopicLabeler implements ReaderSummaryTopicLabelerPort {
  readonly inputs: ReaderSummaryTopicLabelerInput[] = [];

  async label(
    input: ReaderSummaryTopicLabelerInput,
  ): Promise<Awaited<ReturnType<ReaderSummaryTopicLabelerPort["label"]>>> {
    this.inputs.push(input);

    return {
      nodeLabels: [
        {
          nodeId: "topic:story:runtime",
          label: "Runtime agents",
          groupId: "group:runtime",
        },
      ],
      groups: [{ id: "group:runtime", label: "Runtime tooling" }],
    };
  }
}

class FailingTopicLabeler implements ReaderSummaryTopicLabelerPort {
  async label(): Promise<never> {
    throw new Error("agent runtime unavailable");
  }
}

class UnsupportedGroupTopicLabeler implements ReaderSummaryTopicLabelerPort {
  async label(
    input: ReaderSummaryTopicLabelerInput,
  ): Promise<Awaited<ReturnType<ReaderSummaryTopicLabelerPort["label"]>>> {
    return {
      nodeLabels: input.candidates.map((candidate) => ({
        nodeId: candidate.nodeId,
        label: candidate.fallbackLabel,
        groupId: "group:openai-models",
      })),
      groups: [
        {
          id: "group:openai-models",
          label: "OpenAI Models",
          semanticAnchors: ["OpenAI", "GPT"],
        },
      ],
    };
  }
}

class RecordingTopicMapPublicationAudit implements ReaderSummaryTopicMapPublicationAuditPort {
  readonly rejections: ReaderSummaryTopicMapPublicationRejection[] = [];

  async recordRejectedCandidate(
    rejection: ReaderSummaryTopicMapPublicationRejection,
  ): Promise<void> {
    this.rejections.push(rejection);
  }
}

class RelatedTopicLabeler implements ReaderSummaryTopicLabelerPort {
  async label(
    input: ReaderSummaryTopicLabelerInput,
  ): Promise<Awaited<ReturnType<ReaderSummaryTopicLabelerPort["label"]>>> {
    return {
      nodeLabels: input.candidates.map((candidate, index) => ({
        nodeId: candidate.nodeId,
        topicId: `topic:work-${index}`,
        label: index === 0 ? "ChatGPT Work Rollout" : "Codex Work Rollout",
        semantic: {
          subject: index === 0 ? "ChatGPT Work" : "Codex Work",
          parentSubject: "OpenAI",
          claimType: "release",
          confidenceScore: 0.9,
        },
        groupId: "group:ungrouped",
      })),
      groups: [],
    };
  }
}

class MergedRelatedTopicLabeler implements ReaderSummaryTopicLabelerPort {
  async label(
    input: ReaderSummaryTopicLabelerInput,
  ): Promise<Awaited<ReturnType<ReaderSummaryTopicLabelerPort["label"]>>> {
    return {
      nodeLabels: input.candidates.map((candidate, index) => ({
        nodeId: candidate.nodeId,
        topicId: "topic:work",
        label: index === 0 ? "ChatGPT Work Rollout" : "Codex Work Comment",
        semantic: {
          subject: index === 0 ? "ChatGPT Work" : "Codex Work",
          parentSubject: "OpenAI",
          claimType: "release",
          confidenceScore: 0.9,
        },
        groupId: "group:ungrouped",
      })),
      groups: [],
    };
  }
}

class AcceptingTopicRelationVerifier implements ReaderSummaryTopicRelationVerifierPort {
  readonly inputs: ReaderSummaryTopicRelationVerifierInput[] = [];

  async verify(
    input: ReaderSummaryTopicRelationVerifierInput,
  ): Promise<
    Awaited<ReturnType<ReaderSummaryTopicRelationVerifierPort["verify"]>>
  > {
    this.inputs.push(input);

    return input.relations.map((relation) => ({
      ...relation,
      sameTopic: true,
      confidenceScore: 0.95,
    }));
  }
}

class RejectingTopicRelationVerifier implements ReaderSummaryTopicRelationVerifierPort {
  readonly inputs: ReaderSummaryTopicRelationVerifierInput[] = [];

  async verify(
    input: ReaderSummaryTopicRelationVerifierInput,
  ): Promise<
    Awaited<ReturnType<ReaderSummaryTopicRelationVerifierPort["verify"]>>
  > {
    this.inputs.push(input);

    return input.relations.map((relation) => ({
      ...relation,
      sameTopic: false,
      confidenceScore: 0.95,
    }));
  }
}

class FailingTopicRelationVerifier implements ReaderSummaryTopicRelationVerifierPort {
  async verify(): Promise<never> {
    throw new Error("quota unavailable");
  }
}

class CapturingAllTopicLabeler implements ReaderSummaryTopicLabelerPort {
  nodeIds: string[] = [];

  async label(
    input: ReaderSummaryTopicLabelerInput,
  ): Promise<Awaited<ReturnType<ReaderSummaryTopicLabelerPort["label"]>>> {
    this.nodeIds = input.candidates.map((candidate) => candidate.nodeId);

    return {
      nodeLabels: input.candidates.map((candidate) => ({
        nodeId: candidate.nodeId,
        label: candidate.fallbackLabel,
        groupId: "group:ungrouped",
      })),
      groups: [],
    };
  }
}

const command = () => ({
  tenantId: tenantId("tenant-topic-map"),
  workspaceId: workspaceId("workspace-topic-map"),
  scope: { type: "workspace" as const },
  period: {
    cadence: "daily" as const,
    startedAt: new Date("2026-06-01T00:00:00.000Z"),
    endedAt: new Date("2026-06-02T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "2026-06-01",
  },
  requestedAt: new Date("2026-06-02T01:00:00.000Z"),
  clusters: [
    {
      id: "story:runtime",
      storyKey: "runtime",
      representativeFeedItemId: "feed-runtime",
      duplicateFeedItemIds: [],
      interestIds: ["agent-runtime"],
      providerKeys: ["rss"],
      score: 0.9,
      observedAtRange: {
        startedAt: new Date("2026-06-01T01:00:00.000Z"),
        endedAt: new Date("2026-06-01T02:00:00.000Z"),
      },
      whyImportant: ["Runtime topic is growing"],
    } satisfies StoryCluster,
  ],
  selectedEvidence: [
    {
      feedItemId: "feed-runtime",
      sourceItemId: "source-runtime",
      sourceBindingId: "binding-runtime",
      interestId: "agent-runtime",
      providerKey: "rss",
      canonicalUrl: "https://example.test/runtime",
      title: "Runtime signal",
      bodyPreview: "Agent runtime task orchestration.",
      publishedAt: new Date("2026-06-01T01:00:00.000Z"),
      observedAt: new Date("2026-06-01T01:10:00.000Z"),
      score: 0.9,
      whyImportant: ["Selected by ranking"],
    } satisfies SummaryEvidenceItem,
  ],
  topStories: [
    {
      storyClusterId: "story:runtime",
      title: "Runtime signal",
      summary: "RSS evidence discusses runtime task orchestration.",
      interestIds: ["agent-runtime"],
      providerKeys: ["rss"],
      citationIds: ["c1"],
    },
  ],
  citationMap: [
    {
      citationId: "c1",
      feedItemId: "feed-runtime",
      sourceItemId: "source-runtime",
      providerKey: "rss",
      field: "title" as const,
      canonicalUrl: "https://example.test/runtime",
    },
  ],
});

const multiTopicCommand = (): ReturnType<typeof command> => {
  const base = command();
  const names = ["Alpha", "Beta", "Gamma", "Delta"] as const;
  const clusters = Array.from({ length: 4 }, (_, index) => ({
    ...base.clusters[0]!,
    id: `story:runtime-${index}`,
    storyKey: `runtime-${index}`,
    representativeFeedItemId: `feed-runtime-${index}`,
  }));
  const selectedEvidence = Array.from({ length: 4 }, (_, index) => ({
    ...base.selectedEvidence[0]!,
    feedItemId: `feed-runtime-${index}`,
    sourceItemId: `source-runtime-${index}`,
    title: `${names[index]} runtime signal`,
  }));

  return {
    ...base,
    clusters,
    selectedEvidence,
    topStories: [],
    citationMap: selectedEvidence.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: "title" as const,
      canonicalUrl: item.canonicalUrl,
    })),
  };
};

const relatedTopicCommand = (): ReturnType<typeof command> => {
  const base = command();
  const clusters = [0, 1].map((index) => ({
    ...base.clusters[0]!,
    id: `story:work-${index}`,
    storyKey: `work-${index}`,
    representativeFeedItemId: `feed-work-${index}`,
  }));
  const selectedEvidence = [
    {
      ...base.selectedEvidence[0]!,
      feedItemId: "feed-work-0",
      sourceItemId: "source-work-0",
      title: "ChatGPT Work launches with Codex work agent",
    },
    {
      ...base.selectedEvidence[0]!,
      feedItemId: "feed-work-1",
      sourceItemId: "source-work-1",
      title: "Codex powers the new work product",
    },
  ];

  return {
    ...base,
    clusters,
    selectedEvidence,
    topStories: [],
    citationMap: selectedEvidence.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: "title" as const,
      canonicalUrl: item.canonicalUrl,
    })),
  };
};

const manyTopicCommand = (count: number): ReturnType<typeof command> => {
  const base = command();
  const selectedEvidence = Array.from({ length: count }, (_, index) => ({
    ...base.selectedEvidence[0]!,
    feedItemId: `feed-many-${index}`,
    sourceItemId: `source-many-${index}`,
    title: `Shared work topic ${index}`,
  }));
  return {
    ...base,
    clusters: selectedEvidence.map((item, index) => ({
      ...base.clusters[0]!,
      id: `story:many-${index}`,
      storyKey: `many-${index}`,
      representativeFeedItemId: item.feedItemId,
    })),
    selectedEvidence,
    topStories: [],
    citationMap: [],
  };
};
