import {
  readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-input-manifest";
import {
  deriveReaderSummaryWeeklyReviewStoryCandidates,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";

import {
  buildModelInputFromDbState,
} from "./reader-summary-weekly-production-input";
import {
  readerSummaryWeeklyReviewAuthorityFromProductionState,
} from "./reader-summary-weekly-production-postgres-contract";
import {
  completeDbState,
  historicalGithubUnavailableDbState,
  reviewManifestFor,
  sha,
} from "./reader-summary-weekly-production-test-fixture";

describe("reader summary weekly production manifest input admission", () => {
  it("binds every manifest citation to exactly one DB evidence row and maps its internal story", () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const built = buildModelInputFromDbState(dbState, manifest);

    if (built.status !== "complete") throw new Error(built.reasons.join("; "));
    expect(built.status).toBe("complete");
    expect(built.input.observations).toHaveLength(manifest.citations.length);
    expect(built.input.citations).toHaveLength(manifest.citations.length);
    for (const reviewed of manifest.citations) {
      const observation = built.input.observations.find((candidate) =>
        candidate.observationId === `observation:${reviewed.selector.slice("citation:".length)}`,
      );
      const citation = built.input.citations.find((candidate) =>
        candidate.observationId === observation?.observationId,
      );
      expect(observation).toMatchObject({
        storyId: `story:${reviewed.storyId.split(":")[1]}`,
        observedOn: reviewed.requestedUtcDate,
        providerKey: reviewed.providerKey,
        citationIds: [reviewed.selector],
        sourceSha256: reviewed.sourceContentHash,
      });
      expect(citation).toMatchObject({
        citationId: reviewed.selector,
        storyId: `story:${reviewed.storyId.split(":")[1]}`,
        observedOn: reviewed.requestedUtcDate,
        providerKey: reviewed.providerKey,
        sourceSha256: reviewed.sourceContentHash,
      });
    }
  });

  it("keeps cross-date duplicate local citation ids isolated by exact manifest selectors", () => {
    const dbState = completeDbState();
    const localCitationId = "citation:reused-local-id";
    const repeatedLocalIds = Object.freeze({
      ...dbState,
      certifications: Object.freeze(dbState.certifications.map((certification) =>
        Object.freeze({
          ...certification,
          providerEvidence: Object.freeze(certification.providerEvidence.map((evidence) =>
            evidence.providerKey === "rss"
              ? Object.freeze({ ...evidence, citationId: localCitationId })
              : evidence,
          )),
        }),
      )),
    });
    const manifest = reviewManifestFor(repeatedLocalIds);
    const built = buildModelInputFromDbState(repeatedLocalIds, manifest);

    if (built.status !== "complete") throw new Error(built.reasons.join("; "));
    const reviewed = manifest.citations.filter((citation) =>
      citation.providerKey === "rss");
    const modelCitations = built.input.citations.filter((citation) =>
      citation.providerKey === "rss");
    const modelObservationCitationIds = built.input.observations
      .filter((observation) => observation.providerKey === "rss")
      .flatMap((observation) => observation.citationIds)
      .sort();
    const selectors = reviewed.map((citation) => citation.selector).sort();

    expect(new Set(reviewed.map((citation) => citation.citationId))).toEqual(
      new Set([localCitationId]),
    );
    expect(modelCitations.map((citation) => citation.citationId).sort()).toEqual(
      selectors,
    );
    expect(modelObservationCitationIds).toEqual(selectors);
    expect(new Set(modelCitations.map((citation) => citation.citationId)).size).toBe(
      reviewed.length,
    );
  });

  it("allows only the review manifest's after selector to carry evolution", () => {
    const dbState = completeDbState();
    const candidate = durableStoryCandidate(dbState);
    const first = candidate.citations[0]!;
    const last = candidate.citations.at(-1)!;
    const manifest = reviewManifestFor(dbState, {
      selections: [{
        story: candidate.story,
        label: "evolution",
        citationSelectors: [first.selector, last.selector],
        beforeCitationSelector: first.selector,
        afterCitationSelector: last.selector,
      }],
    });
    const built = buildModelInputFromDbState(dbState, manifest);

    if (built.status !== "complete") throw new Error(built.reasons.join("; "));
    expect(built.status).toBe("complete");
    expect(observationFor(built.input, first.selector).claimSupport).toEqual([
      "snapshot",
    ]);
    expect(observationFor(built.input, last.selector).claimSupport).toEqual([
      "snapshot",
      "evolution",
    ]);
  });

  it("allows only the review manifest's terminal selector to carry resolution", () => {
    const dbState = completeDbState();
    const candidate = durableStoryCandidate(dbState);
    const first = candidate.citations[0]!;
    const last = candidate.citations.at(-1)!;
    const manifest = reviewManifestFor(dbState, {
      selections: [{
        story: candidate.story,
        label: "resolution",
        citationSelectors: [first.selector, last.selector],
        terminalCitationSelector: last.selector,
      }],
    });
    const built = buildModelInputFromDbState(dbState, manifest);

    if (built.status !== "complete") throw new Error(built.reasons.join("; "));
    expect(built.status).toBe("complete");
    expect(observationFor(built.input, first.selector).claimSupport).toEqual([
      "snapshot",
    ]);
    expect(observationFor(built.input, last.selector).claimSupport).toEqual([
      "snapshot",
      "resolution",
    ]);
  });

  it("fails closed when a certified evidence row no longer exactly matches the manifest citation", () => {
    const dbState = completeDbState();
    const manifest = reviewManifestFor(dbState);
    const certification = dbState.certifications[0]!;
    const tampered = Object.freeze({
      ...dbState,
      certifications: Object.freeze([
        Object.freeze({
          ...certification,
          providerEvidence: Object.freeze(certification.providerEvidence.map((evidence) =>
            evidence.providerKey === "github-trending-page"
              ? Object.freeze({ ...evidence, sourceContentHash: sha("tampered") })
              : evidence,
          )),
        }),
        ...dbState.certifications.slice(1),
      ]),
    });

    expect(buildModelInputFromDbState(tampered, manifest)).toMatchObject({
      status: "partial",
    });
  });

  it.each(["2026-07-23", "2026-07-24"])(
    "keeps an honestly unavailable historical GitHub board for %s in the model input",
    (requestedUtcDate) => {
    const dbState = historicalGithubUnavailableDbState(requestedUtcDate);
    const built = buildModelInputFromDbState(dbState, reviewManifestFor(dbState));

    if (built.status !== "complete") throw new Error(built.reasons.join("; "));
    expect(built.status).toBe("complete");
    expect(built.input.days.find((day) => day.date === requestedUtcDate)).toMatchObject({
      date: requestedUtcDate,
      githubBoardStatus: "historical_unavailable",
      githubAuthorizationIdentity:
        readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
    });
  });

  it("does not require a weekday-count heuristic before editorial quality is evaluated", () => {
    const dbState = completeDbState();
    const candidate = durableStoryCandidate(dbState);
    const manifest = reviewManifestFor(dbState, {
      selections: [{
        story: candidate.story,
        label: "observation",
        citationSelectors: [candidate.citations[0]!.selector],
      }],
    });
    const built = buildModelInputFromDbState(dbState, manifest);

    if (built.status !== "complete") throw new Error(built.reasons.join("; "));
    expect(built.status).toBe("complete");
    expect(built.input.citations).toHaveLength(1);
  });
});

const durableStoryCandidate = (dbState: ReturnType<typeof completeDbState>) => {
  const authority = readerSummaryWeeklyReviewAuthorityFromProductionState(dbState);
  const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(authority)
    .find((item) => item.citations.length === 7);
  if (candidate === undefined) throw new Error("Expected seven-day durable fixture story");
  return candidate;
};

const observationFor = (
  input: Extract<ReturnType<typeof buildModelInputFromDbState>, { status: "complete" }>["input"],
  selector: string,
) => {
  const observation = input.observations.find((candidate) =>
    candidate.observationId === `observation:${selector.slice("citation:".length)}`,
  );
  if (observation === undefined) throw new Error("Missing manifest observation");
  return observation;
};
