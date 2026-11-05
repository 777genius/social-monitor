import { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import { ReaderSummaryPublicationPolicy } from "./reader-summary-publication-policy";
import {
  artifact,
  content,
  dailyEvidenceSelection,
  dailySynthesisArtifact,
  evidenceSelection,
  providerDominatedDailySynthesisArtifact,
} from "./reader-summary-publication-policy-test-fixtures";

const policy = new ReaderSummaryPublicationPolicy();
describe("ReaderSummaryPublicationPolicy", () => {
  it("publishes artifacts whose top reads resolve to eligible evidence", () => {
    const decision = policy.evaluate({
      artifact: artifact(),
      evidence: evidenceSelection(),
    });
    expect(decision).toMatchObject({
      status: "published",
      qualityPassed: true,
    });
  });

  it("rejects creation and rehydration when ordered card citations differ from the signed attestation", () => {
    const snapshot = artifact().toSnapshot();
    const tampered = {
      ...snapshot,
      citationMap: [...snapshot.citationMap, {
        ...snapshot.citationMap[0]!,
        citationId: "citation-publication-alternate",
      }],
      content: {
        ...snapshot.content!,
        topReads: snapshot.content!.topReads.map((item) => ({
          ...item,
          citationIds: ["citation-publication-alternate"],
        })),
      },
    };
    expect(() => ReaderSummaryArtifact.create(tampered)).toThrow(
      "promotion attestation placement is invalid",
    );
    expect(() => ReaderSummaryArtifact.rehydrate(tampered)).toThrow(
      "promotion attestation placement is invalid",
    );
  });

  it("does not report V1 placement eligibility for a signed V2 slate", () => {
    const decision = policy.evaluate({
      artifact: artifact(),
      evidence: evidenceSelection({
        firstContentQuality: {
          qualityScore: 0.2,
          interestRelevanceScore: 0.3,
          engagementIntegrityScore: 0.5,
          eligibleForSummary: true,
          eligibleForTopRead: false,
          needsLlmReview: true,
          decision: "downrank",
          flags: ["rumor_only"],
          reason: "Rumor-only evidence cannot become a top read.",
        },
      }),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      qualityPassed: false,
      reasonCodes: ["editorial_quality"],
    });
    if (decision.status !== "rejected") {
      throw new Error("Expected publication rejection");
    }
    expect(decision.reasonCodes).not.toContain("top_read_ineligible_source");
  });

  it("rejects user-facing technical leakage before publish", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        content: content({
          oneLineTakeaway:
            "This summary references canonicalUrl evidence from source item 00000000-0000-7000-8000-000000000001.",
        }),
      }),
      evidence: evidenceSelection(),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["technical_leakage"],
      findings: [
        expect.objectContaining({
          code: "technical_leakage",
          reason: expect.stringContaining("canonicalUrl"),
        }),
      ],
    });
  });

  it("rejects technical leakage inside the canonical public narrative", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        content: content({
          narrativeSections: [
            {
              id: "narrative-publication-lead",
              kind: "lead",
              title: "Main signal",
              text: "Internal provider:reddit evidence should never reach readers.",
              citationIds: ["citation-publication-1"],
              storyClusterId: "story-publication-1",
            },
          ],
        }),
      }),
      evidence: evidenceSelection(),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["technical_leakage"],
      findings: [
        expect.objectContaining({
          code: "technical_leakage",
          reason: expect.stringContaining("provider:reddit"),
        }),
      ],
    });
  });

  it("rejects technical leakage inside the public executive summary", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        executiveSummary:
          "Internal source item 00000000-0000-7000-8000-000000000001 must stay private.",
      }),
      evidence: evidenceSelection(),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["technical_leakage"],
      findings: [
        expect.objectContaining({
          code: "technical_leakage",
          reason: expect.stringContaining("source item"),
        }),
      ],
    });
  });

  it("publishes a multi-provider daily synthesis with an unbound lead", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact(),
      evidence: dailyEvidenceSelection(25),
    });
    expect(decision).toMatchObject({
      status: "published",
      qualityPassed: true,
    });
  });

  it("rejects a single-story artifact when the deterministic coverage plan requires a daily synthesis", () => {
    const decision = policy.evaluate({
      artifact: artifact(),
      evidence: dailyEvidenceSelection(25),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["top_read_ineligible_source", "editorial_quality"],
      reasons: expect.arrayContaining([
        expect.stringContaining(
          "Daily synthesis lead must cite at least two story clusters",
        ),
        expect.stringContaining(
          "Daily synthesis lead must cite at least two providers",
        ),
      ]),
    });
  });

  it("publishes a structured Watch section whose text starts with a repository bullet", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        watchText: "- **example/repo**: +1,200 stars today.",
      }),
      evidence: dailyEvidenceSelection(25),
    });
    expect(decision).toMatchObject({
      status: "published",
      qualityPassed: true,
    });
  });

  it("rejects a daily synthesis lead bound to a single story", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        narrativeSections: [
          {
            id: "narrative-publication-daily-lead",
            kind: "lead",
            title: "Main signal",
            text: "Reddit and Hacker News surface distinct AI workflow signals.",
            citationIds: [
              "citation-publication-1",
              "citation-publication-2",
            ],
            storyClusterId: "story-publication-1",
          },
        ],
      }),
      evidence: dailyEvidenceSelection(25),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: expect.arrayContaining([
        expect.stringContaining(
          "Daily synthesis lead must not be bound to one story cluster",
        ),
      ]),
    });
  });

  it("rejects a secondary signal that mixes unrelated story clusters", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        narrativeSections: [
          {
            id: "narrative-publication-daily-lead",
            kind: "lead",
            title: "Main signal",
            text: "Reddit and Hacker News surface distinct AI workflow signals.",
            citationIds: [
              "citation-publication-1",
              "citation-publication-2",
            ],
          },
          {
            id: "narrative-publication-secondary",
            kind: "secondary_signal",
            title: "Workflow costs",
            text: "A secondary signal must remain grounded in one story.",
            citationIds: [
              "citation-publication-2",
              "citation-publication-1",
            ],
            storyClusterId: "story-publication-2",
          },
        ],
      }),
      evidence: dailyEvidenceSelection(25),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: expect.arrayContaining([
        expect.stringContaining(
          "Secondary signal cites evidence from another story cluster",
        ),
      ]),
    });
  });

  it("rejects a daily synthesis whose headline copies a top post", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        headline: "AI runtime quality discussion",
      }),
      evidence: dailyEvidenceSelection(25),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: [expect.stringContaining("Headline copies a top-post title")],
    });
  });

  it("rejects a provider-dominated daily synthesis", () => {
    const decision = policy.evaluate({
      artifact: providerDominatedDailySynthesisArtifact(),
      evidence: dailyEvidenceSelection(25),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: expect.arrayContaining([
        expect.stringContaining(
          "One provider supplies more than 75% of main narrative citations",
        ),
      ]),
    });
  });

  it("rejects malformed narrative Markdown before publish", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        watchText: "Watch: - **example/repo**: +1,200 stars today.",
      }),
      evidence: dailyEvidenceSelection(25),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: [expect.stringContaining("inline nested Watch bullet")],
    });
  });

  it("bypasses editorial gates for a valid no-signal artifact", () => {
    const noSignalEvidence = evidenceSelection();
    const decision = policy.evaluate({
      artifact: artifact({
        content: undefined,
        topStories: [],
        qualityFlags: ["no_signal", "limited_sources"],
        noSignalReason: "No eligible evidence passed the selection policy.",
        confidence: {
          level: "none",
          score: 0,
          rationale: "No eligible evidence was selected.",
        },
      }),
      evidence: {
        ...noSignalEvidence,
        editorialSlate: {
          ...noSignalEvidence.editorialSlate!,
          top: [],
          additional: [],
          excluded: noSignalEvidence.selectedEvidence.map((item) => ({
            candidateId: item.feedItemId,
            canonicalIdentity:
              item.promotionFacts?.canonicalIdentity ?? item.feedItemId,
            reasonCodes: ["provider_floor_not_met"],
          })),
          orderedCandidateIds: [],
          orderedCanonicalIdentities: [],
          digestInputs: [],
          digestMaterial: "empty-publication-slate",
        },
        selectedEvidence: noSignalEvidence.selectedEvidence.map((item) => ({
          ...item,
          promotionFacts: {
            ...item.promotionFacts!,
            metrics: { provider: "reddit" as const, score: 24 },
          },
        })),
      },
    });
    expect(decision).toMatchObject({
      status: "published",
      qualityPassed: true,
      reasons: ["Reader summary artifact is a valid no-signal result."],
    });
  });

  it("does not bypass editorial gates for a signaled artifact carrying a no-signal flag", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        qualityFlags: ["no_signal"],
        noSignalReason: "Inconsistent legacy marker.",
      }),
      evidence: evidenceSelection(),
    });
    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: [
        expect.stringContaining(
          "no_signal flag conflicts with publishable content",
        ),
      ],
    });
  });

  it("keeps borderline source risks in shadow mode without blocking publish", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        confidence: {
          level: "low",
          score: 0.42,
          rationale: "Single-source evidence is directionally useful.",
        },
      }),
      evidence: evidenceSelection(),
    });
    expect(decision).toMatchObject({
      status: "published",
      shadow: {
        mode: "shadow",
        policyVersion: "reader_summary_publication_shadow_v1",
        signals: expect.arrayContaining([
          expect.objectContaining({ code: "low_confidence" }),
          expect.objectContaining({ code: "single_source" }),
        ]),
      },
    });
  });
});
