import { ReaderSummaryWeeklyArtifact } from "../entities/reader-summary-weekly-artifact";
import {
  canonicalizeReaderSummaryWeeklyJson,
} from "../value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCertificationSealSchemaVersion,
  type ReaderSummaryWeeklyCertificationSealBinding,
} from "../value-objects/reader-summary-weekly-certification-seal";
import { readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity } from "../value-objects/reader-summary-weekly-input-manifest-canonical";
import {
  readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
} from "../value-objects/reader-summary-weekly-publication-github-evidence";
import { deriveReaderSummaryWeeklyReviewCitationSelector } from "../value-objects/reader-summary-weekly-review-manifest";
import {
  readerSummaryWeeklyStoryAuthoritySchemaVersion,
  type ReaderSummaryWeeklyStoryAuthorityBinding,
  type ReaderSummaryWeeklyStoryAuthorityEvidence,
} from "../value-objects/reader-summary-weekly-story-authority";
import {
  readerSummaryWeeklyModelInputSchemaVersion,
  readerSummaryWeeklyModelOutputSchemaVersion,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import type {
  ReaderSummaryWeeklyCertificationSealHandle,
} from "../../ports/reader-summary-weekly-certification-seal-authority.port";
import type {
  ReaderSummaryWeeklyStoryAuthorityHandle,
} from "../../ports/reader-summary-weekly-story-authority.port";
import {
  authorizeReaderSummaryWeeklyCertifiedPublication,
  authorizeReaderSummaryWeeklyPublication,
  readReaderSummaryWeeklyPublicationAuthorization,
} from "./reader-summary-weekly-publication-authorization";

const dates = [
  "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23",
  "2026-07-24", "2026-07-25", "2026-07-26",
] as const;
const citedDays = [0, 2, 4, 6] as const;
const citedProviders = ["hacker-news", "reddit", "rss", "x-twitter"] as const;
const tenant = "11111111-1111-4111-8111-111111111111";
const workspace = "22222222-2222-4222-8222-222222222222";

describe("reader summary weekly certified publication authorization", () => {
  it("issues the existing opaque authorization and binds proof to the DB seal", () => {
    const fixture = certifiedFixture(undefined, true);
    const authorization = authorizeCertified(fixture);
    const details = readReaderSummaryWeeklyPublicationAuthorization(authorization);

    expect(Object.keys(authorization)).toEqual([]);
    expect(details.proof).toMatchObject({
      artifactId: "33333333-3333-5333-8333-333333333333",
      manifestSealId: fixture.seal.sealId,
      manifestSealSha256: fixture.seal.sealSha,
    });
    expect(details.proof.authorities).toHaveLength(7);
    expect(details.proof.citations).toHaveLength(4);
    expect(details.proof.authorities.map((item) => item.publicationId)).toEqual(
      fixture.seal.days.map((day) => day.publicationId),
    );
    expect(new Set(fixture.bindings.flatMap((binding) => binding.evidence)
      .filter((evidence) => evidence.providerKey === "rss")
      .map((evidence) => evidence.citationId))).toEqual(
      new Set(["citation:reused-local-id"]),
    );
    expect(new Set(fixture.command.modelInput.citations
      .filter((citation) => citation.providerKey === "rss")
      .map((citation) => citation.citationId)).size).toBe(2);
  });

  it("authorizes sealed historical GitHub-unavailable days", () => {
    const fixture = certifiedFixture(undefined, false, true);
    const details = readReaderSummaryWeeklyPublicationAuthorization(
      authorizeCertified(fixture),
    );

    expect(details.proof.authorities).toHaveLength(7);
    expect(fixture.command.modelInput.days.every((day) =>
      day.githubBoardStatus === "historical_unavailable"
    )).toBe(true);
  });

  it("fails closed for duplicate story handles and divergent model day counts", () => {
    const duplicate = certifiedFixture();
    expect(() => authorizeReaderSummaryWeeklyCertifiedPublication(
      {
        ...duplicate.command,
        dailyAuthorityHandles: [
          ...duplicate.storyHandles.slice(0, 6),
          duplicate.storyHandles[0]!,
        ],
      },
      duplicate.sealAuthority,
      duplicate.storyAuthority,
    )).toThrow(/seven unique DB stories/u);

    const divergent = certifiedFixture((body) => {
      const days = body.days as Record<string, unknown>[];
      const counts = days[1]!.providerCounts as Record<string, unknown>[];
      counts[3]!.count = 1;
    });
    expect(() => authorizeCertified(divergent)).toThrow(/DB story diverged/u);
  });

  it("rejects a forged certification seal before reading story authority", () => {
    const readStory = jest.fn();
    expect(() => authorizeReaderSummaryWeeklyCertifiedPublication(
      {
        artifactId: "33333333-3333-5333-8333-333333333333",
        artifact: Object.freeze({}) as never,
        modelInput: Object.freeze({}) as never,
        certificationSealHandle:
          Object.freeze({}) as ReaderSummaryWeeklyCertificationSealHandle,
        dailyAuthorityHandles: [],
      },
      { readVerifiedBinding: () => { throw new Error("forged DB seal"); } },
      { readVerifiedBinding: readStory },
    )).toThrow(/forged DB seal/u);
    expect(readStory).not.toHaveBeenCalled();
  });

  it("remains a separate additive entrypoint from legacy authorization", () => {
    expect(authorizeReaderSummaryWeeklyCertifiedPublication).not.toBe(
      authorizeReaderSummaryWeeklyPublication,
    );
  });

  it("rejects forged and cross-date substituted selectors for reused local citation ids", () => {
    const fixture = certifiedFixture(undefined, true);
    const forged = modelInputFor(fixture.seal, fixture.bindings, (body) => {
      const citations = body.citations as Record<string, unknown>[];
      const observations = body.observations as Record<string, unknown>[];
      const citation = citations.find((item) =>
        item.observationId === observations[1]!.observationId)!;
      citation.citationId = `citation:${"f".repeat(64)}`;
      observations[1]!.citationIds = [citation.citationId];
      citations.sort((left, right) => String(left.citationId).localeCompare(String(right.citationId)));
    });
    expect(() => authorizeReaderSummaryWeeklyCertifiedPublication(
      commandForModelInput(fixture, forged),
      fixture.sealAuthority,
      fixture.storyAuthority,
    )).toThrow("1:1 certified DB authority");

    const substituted = modelInputFor(fixture.seal, fixture.bindings, (body) => {
      const citations = body.citations as Record<string, unknown>[];
      const observations = body.observations as Record<string, unknown>[];
      const first = citations.find((item) =>
        item.observationId === observations[1]!.observationId)!;
      const second = citations.find((item) =>
        item.observationId === observations[2]!.observationId)!;
      [first.citationId, second.citationId] = [
        second.citationId, first.citationId,
      ];
      [observations[1]!.citationIds, observations[2]!.citationIds] = [
        [first.citationId], [second.citationId],
      ];
      citations.sort((left, right) => String(left.citationId).localeCompare(String(right.citationId)));
    });
    expect(() => authorizeReaderSummaryWeeklyCertifiedPublication(
      commandForModelInput(fixture, substituted),
      fixture.sealAuthority,
      fixture.storyAuthority,
    )).toThrow("1:1 certified DB authority");
  });
});

const authorizeCertified = (fixture: ReturnType<typeof certifiedFixture>) =>
  authorizeReaderSummaryWeeklyCertifiedPublication(
    fixture.command,
    fixture.sealAuthority,
    fixture.storyAuthority,
  );

const commandForModelInput = (
  fixture: ReturnType<typeof certifiedFixture>,
  modelInput: ReaderSummaryWeeklyModelInput,
) => ({
  ...fixture.command,
  modelInput,
  artifact: ReaderSummaryWeeklyArtifact.create({
    input: modelInput,
    output: weeklyOutput(modelInput),
  }),
});

const certifiedFixture = (
  mutateModelBody?: (body: Record<string, unknown>) => void,
  reuseLocalCitationIds = false,
  historicalGitHub = false,
) => {
  const bindings = dates.map((date, index) =>
    storyBinding(date, index, reuseLocalCitationIds, historicalGitHub),
  );
  const seal = certificationSeal(bindings);
  const modelInput = modelInputFor(seal, bindings, mutateModelBody);
  const output = weeklyOutput(modelInput);
  const artifact = ReaderSummaryWeeklyArtifact.create({ input: modelInput, output });
  const sealHandle = opaqueSealHandle();
  const storyHandles = bindings.map(() => opaqueStoryHandle());
  const storyByHandle = new WeakMap<object, ReaderSummaryWeeklyStoryAuthorityBinding>();
  storyHandles.forEach((handle, index) => storyByHandle.set(handle, bindings[index]!));
  return {
    seal,
    bindings,
    storyHandles,
    sealAuthority: {
      readVerifiedBinding: (handle: ReaderSummaryWeeklyCertificationSealHandle) => {
        if (handle !== sealHandle) throw new Error("seal was not DB loaded");
        return seal;
      },
    },
    storyAuthority: {
      readVerifiedBinding: (handle: ReaderSummaryWeeklyStoryAuthorityHandle) => {
        const binding = storyByHandle.get(handle as object);
        if (binding === undefined) throw new Error("story was not DB loaded");
        return binding;
      },
    },
    command: {
      artifactId: "33333333-3333-5333-8333-333333333333",
      artifact,
      modelInput,
      certificationSealHandle: sealHandle,
      dailyAuthorityHandles: storyHandles,
    },
  };
};

const storyBinding = (
  date: string,
  index: number,
  reuseLocalCitationIds = false,
  historicalGitHub = false,
): ReaderSummaryWeeklyStoryAuthorityBinding => {
  const publicationId = `publication:${date}`;
  const publicationEvidenceSha256 = canonicalizeReaderSummaryWeeklyJson({
    kind: "publication", date,
  }).sha256;
  const evidence = authorityEvidence(
    date,
    index,
    reuseLocalCitationIds,
    historicalGitHub,
  );
  const body = {
    schemaVersion: readerSummaryWeeklyStoryAuthoritySchemaVersion,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" as const },
    requestedUtcDate: date,
    publicationId,
    artifactId: publicationId,
    jobId: `job:${date}`,
    reportId: `reader-summary-report:${publicationId}`,
    proofId: `reader-summary-proof:${publicationId}`,
    publicationEvidenceIdentity:
      `reader_summary.weekly_publication_evidence.v1:${publicationEvidenceSha256}`,
    publicationEvidenceSha256,
    reportSha256: canonicalizeReaderSummaryWeeklyJson({ kind: "report", date }).sha256,
    proofSha256: canonicalizeReaderSummaryWeeklyJson({ kind: "proof", date }).sha256,
    artifactPayloadSha256:
      canonicalizeReaderSummaryWeeklyJson({ kind: "artifact", date }).sha256,
    providerEvidenceSha256: canonicalizeReaderSummaryWeeklyJson(evidence).sha256,
    githubEvidenceSha256:
      canonicalizeReaderSummaryWeeklyJson({ kind: "github", date }).sha256,
    semanticStatus: "COMPLETED" as const,
    publishedAt: `${date}T23:00:00.000Z`,
    evidence,
  };
  const sha256 = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    identity: `${readerSummaryWeeklyStoryAuthoritySchemaVersion}:${sha256}`,
    sha256,
  };
};

const authorityEvidence = (
  date: string,
  dayIndex: number,
  reuseLocalCitationIds = false,
  historicalGitHub = false,
): readonly ReaderSummaryWeeklyStoryAuthorityEvidence[] => {
  const citedIndex = citedDays.indexOf(dayIndex as (typeof citedDays)[number]);
  const providerKey = citedIndex >= 0 && reuseLocalCitationIds &&
    (citedIndex === 1 || citedIndex === 2)
    ? "rss"
    : citedProviders[citedIndex]!;
  const citationId = reuseLocalCitationIds && providerKey === "rss"
    ? "citation:reused-local-id"
    : `citation:${date}`;
  const citedEvidence = citedIndex >= 0
    ? evidenceItem(date, providerKey, citationId, 11)
    : evidenceItem(date, "rss", `citation:${date}:uncited`, 11);
  return [
    ...Array.from({ length: historicalGitHub ? 0 : 10 }, (_, index) => evidenceItem(
      date,
      "github-trending-page",
      `github:${date}:${String(index + 1).padStart(2, "0")}`,
      index + 1,
    )),
    ...(citedIndex >= 0 || historicalGitHub ? [citedEvidence] : []),
  ];
};

const evidenceItem = (
  date: string,
  providerKey:
    | "github-trending-page"
    | "hacker-news"
    | "reddit"
    | "rss"
    | "x-twitter",
  citationId: string,
  number: number,
): ReaderSummaryWeeklyStoryAuthorityEvidence => {
  const serial = String(number).padStart(2, "0");
  return {
    providerKey,
    citationId,
    citationField: "title",
    feedItemId: `feed:${date}:${serial}`,
    sourceItemId: `source:${date}:${serial}`,
    sourceBindingId: `binding:${date}:${serial}`,
    providerItemId: `provider:${date}:${serial}`,
    canonicalUrl: providerKey === "rss"
      ? `https://example.test/${date}`
      : `https://github.com/example-${date}/repository-${serial}`,
    sourceContentHash: canonicalizeReaderSummaryWeeklyJson({
      date, providerKey, number,
    }).sha256,
    publishedAt: `${date}T18:00:00.000Z`,
    observedAt: `${date}T20:00:00.000Z`,
  };
};

const certificationSeal = (
  bindings: readonly ReaderSummaryWeeklyStoryAuthorityBinding[],
): ReaderSummaryWeeklyCertificationSealBinding => {
  const body = {
    schemaVersion: readerSummaryWeeklyCertificationSealSchemaVersion,
    tenantId: tenant,
    workspaceId: workspace,
    scopeType: "workspace" as const,
    scopeKey: "workspace",
    weekStartedOn: dates[0],
    weekEndedOn: dates[6],
    days: bindings.map((binding) => ({
      requestedUtcDate: binding.requestedUtcDate,
      publicationId: binding.publicationId,
      artifactId: binding.artifactId,
      jobId: binding.jobId,
      semanticStatus: binding.semanticStatus,
      publicationEvidenceIdentity: binding.publicationEvidenceIdentity,
      publicationEvidenceSha256: binding.publicationEvidenceSha256,
    })),
  };
  const sealSha = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    sealId: `${readerSummaryWeeklyCertificationSealSchemaVersion}:${sealSha}`,
    sealSha,
  };
};

const modelInputFor = (
  seal: ReaderSummaryWeeklyCertificationSealBinding,
  bindings: readonly ReaderSummaryWeeklyStoryAuthorityBinding[],
  mutate?: (body: Record<string, unknown>) => void,
): ReaderSummaryWeeklyModelInput => {
  const observations = citedDays.map((dayIndex, index) => {
    const authority = bindings[dayIndex]!;
    const evidence = authority.evidence.find(
      (item) => item.providerKey !== "github-trending-page",
    )!;
    const citationId = deriveReaderSummaryWeeklyReviewCitationSelector({
      requestedUtcDate: authority.requestedUtcDate,
      publicationId: authority.publicationId,
      publicationEvidenceSha256: authority.publicationEvidenceSha256,
      providerKey: evidence.providerKey,
      citationId: evidence.citationId,
      sourceItemId: evidence.sourceItemId,
      sourceContentHash: evidence.sourceContentHash,
    });
    return {
      observationId: `observation:${index + 1}`,
      storyId: index < 2 ? "story:alpha" : "story:beta",
      observedOn: authority.requestedUtcDate,
      providerKey: evidence.providerKey,
      text: `Certified observation ${index + 1} supplies grounded context.`,
      claimSupport: index === 1
        ? (["snapshot", "evolution"] as const)
        : (["snapshot"] as const),
      citationIds: [citationId],
      dailyCertificationId: authority.publicationEvidenceIdentity,
      dailyCertificationSha: authority.publicationEvidenceSha256,
      sourceSha256: evidence.sourceContentHash,
    };
  });
  const body: Record<string, unknown> = {
    schemaVersion: readerSummaryWeeklyModelInputSchemaVersion,
    manifestSealId: seal.sealId,
    manifestSealSha: seal.sealSha,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    weekStartedOn: dates[0],
    weekEndedOn: dates[6],
    days: bindings.map((binding, index) => {
      const githubCount = binding.evidence.filter(
        (item) => item.providerKey === "github-trending-page",
      ).length;
      const citedProvider = bindings[index]!.evidence.find(
        (item) => item.providerKey !== "github-trending-page",
      )?.providerKey;
      return {
        date: binding.requestedUtcDate,
        dailyCertificationId: binding.publicationEvidenceIdentity,
        dailyCertificationSha: binding.publicationEvidenceSha256,
        dailyCertificationStatus: "certified",
        githubBoardId:
          `${readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion}:${binding.githubEvidenceSha256}`,
        githubBoardSha: binding.githubEvidenceSha256,
        githubBoardStatus:
          githubCount === 0 ? "historical_unavailable" : "verified",
        ...(githubCount === 0
          ? {
              githubAuthorizationIdentity:
                readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
            }
          : {}),
        providerCounts: [
          { providerKey: "github-trending-page", count: githubCount },
          {
            providerKey: "hacker-news",
            count: citedProvider === "hacker-news" ? 1 : 0,
          },
          { providerKey: "reddit", count: citedProvider === "reddit" ? 1 : 0 },
          { providerKey: "rss", count: citedProvider === "rss" ? 1 : 0 },
          {
            providerKey: "x-twitter",
            count: citedProvider === "x-twitter" ? 1 : 0,
          },
        ],
      };
    }),
    stories: [
      { storyId: "story:alpha", label: "Agent safety controls" },
      { storyId: "story:beta", label: "Release questions" },
    ],
    observations,
    citations: observations.map((observation, index) => ({
      citationId: observation.citationIds[0]!,
      observationId: observation.observationId,
      storyId: observation.storyId,
      observedOn: observation.observedOn,
      providerKey: observation.providerKey,
      title: `Certified source ${index + 1}`,
      canonicalUrl: bindings[citedDays[index]!]!.evidence.find(
        (item) =>
          item.providerKey === observation.providerKey &&
          item.sourceContentHash === observation.sourceSha256,
      )!.canonicalUrl,
      dailyCertificationId: observation.dailyCertificationId,
      dailyCertificationSha: observation.dailyCertificationSha,
      sourceSha256: observation.sourceSha256,
    })).sort((left, right) => left.citationId.localeCompare(right.citationId)),
  };
  mutate?.(body);
  const sealSha = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    sealId: `${readerSummaryWeeklyModelInputSchemaVersion}:${sealSha}`,
    sealSha,
  } as ReaderSummaryWeeklyModelInput;
};

const weeklyOutput = (
  input: ReaderSummaryWeeklyModelInput,
): ReaderSummaryWeeklyModelOutput => {
  const citationIds = input.citations.map((citation) => citation.citationId);
  const citationIdsForStory = (storyId: string): string[] => input.citations
    .filter((citation) => citation.storyId === storyId)
    .sort((left, right) => left.observedOn.localeCompare(right.observedOn))
    .map((citation) => citation.citationId);
  const alphaCitationIds = citationIdsForStory("story:alpha");
  const betaCitationIds = citationIdsForStory("story:beta");
  return {
    schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
    sealId: input.sealId,
    sealSha: input.sealSha,
    weekStartedOn: dates[0],
    weekEndedOn: dates[6],
    headline: "Agent safeguards reached teams while release questions stayed open",
    headlineCitationIds: [...citationIds],
    takeaway:
      "Practical safety controls mattered most, while release details remained open.",
    takeawayCitationIds: citationIds.slice(0, 3),
    synthesis:
      "Across the week, teams put agent safety controls into practice while separate release questions remained open. The combined record shows concrete adoption without turning incomplete release discussion into a claimed outcome.",
    synthesisCitationIds: [...citationIds],
    stories: [
      {
        storyId: "story:alpha",
        headline: "Agent safety controls entered practical use",
        summary:
          "Early safeguards were followed by concrete use in team workflows, with limits still clearly stated.",
        status: "developing",
        observedFrom: dates[0],
        observedThrough: dates[2],
        citationIds: [...alphaCitationIds],
      },
      {
        storyId: "story:beta",
        headline: "Release questions remained open",
        summary:
          "Separate reports kept attention on release details without establishing a final outcome.",
        status: "watch",
        observedFrom: dates[4],
        observedThrough: dates[6],
        citationIds: [...betaCitationIds],
      },
    ],
    sections: [
      {
        sectionId: "section:alpha-lead",
        storyId: "story:alpha",
        kind: "lead",
        claimType: "evolution",
        heading: "Safety controls entered practice",
        text: "The week connected early safeguards to concrete use in team workflows.",
        observedFrom: dates[0],
        observedThrough: dates[2],
        citationIds: [...alphaCitationIds],
      },
      {
        sectionId: "section:beta-watch",
        storyId: "story:beta",
        kind: "watch",
        claimType: "snapshot",
        heading: "Release details stayed open",
        text: "The cited reports raised useful questions but did not establish an outcome.",
        observedFrom: dates[4],
        observedThrough: dates[6],
        citationIds: [...betaCitationIds],
      },
    ],
  };
};

const opaqueSealHandle = (): ReaderSummaryWeeklyCertificationSealHandle =>
  Object.freeze({}) as ReaderSummaryWeeklyCertificationSealHandle;

const opaqueStoryHandle = (): ReaderSummaryWeeklyStoryAuthorityHandle =>
  Object.freeze({}) as ReaderSummaryWeeklyStoryAuthorityHandle;
