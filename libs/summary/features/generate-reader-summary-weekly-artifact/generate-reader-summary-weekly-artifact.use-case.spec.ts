import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyDailyPeriod,
} from "../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyDailyArtifactSchemaVersion,
  readerSummaryWeeklyDailyProofSchemaVersion,
  readerSummaryWeeklyDailyReportSchemaVersion,
  readerSummaryWeeklyProviderSourceEvidenceSchemaVersion,
  readerSummaryWeeklyRequiredDailyBlockingGateNames,
  type ReaderSummaryWeeklyDailyArtifactPayloadInput,
  type ReaderSummaryWeeklyDailyCertificationEvidenceInput,
  type ReaderSummaryWeeklyDailyExactProofInput,
  type ReaderSummaryWeeklyDailyReportPayloadInput,
  type ReaderSummaryWeeklyGitHubBindingInput,
  type ReaderSummaryWeeklyProviderCountsInput,
} from "../../domain/value-objects/reader-summary-weekly-daily-certification";
import {
  certifyReaderSummaryWeeklyGitHubAudit,
  readerSummaryWeeklyGitHubEvidenceKind,
  readerSummaryWeeklyGitHubProviderKey,
  type ReaderSummaryWeeklyCanonicalGitHubAudit,
  type ReaderSummaryWeeklyGitHubAuditEvidenceInput,
} from "../../domain/value-objects/reader-summary-weekly-github-audit";
import {
  sealReaderSummaryWeeklyInputManifest,
  type ReaderSummaryWeeklyInputManifestEvidence,
} from "../../domain/value-objects/reader-summary-weekly-input-manifest";
import {
  readerSummaryWeeklyModelOutputSchemaVersion,
  sealReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelEvidenceInput,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
  type ReaderSummaryWeeklyModelPort,
} from "../../ports/reader-summary-weekly-model.port";
import type { GenerateReaderSummaryWeeklyArtifactCommand } from "./generate-reader-summary-weekly-artifact.command";
import { GenerateReaderSummaryWeeklyArtifactUseCase } from "./generate-reader-summary-weekly-artifact.use-case";

const dates = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
] as const;
const genericProviders = [
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const;
type GenericProvider = (typeof genericProviders)[number];

describe("GenerateReaderSummaryWeeklyArtifactUseCase", () => {
  it("binds the exact sealed evidence and invokes the model once", async () => {
    const evidence = weeklyEvidence();
    const expectedInput = sealReaderSummaryWeeklyModelInput(evidence);
    const model = new FakeWeeklyModel((input) => weeklyOutput(input));

    const artifact =
      await new GenerateReaderSummaryWeeklyArtifactUseCase(model).execute(
        evidence,
      );

    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]).toEqual(expectedInput);
    expect(model.calls[0]).toMatchObject({
      sealId: expectedInput.sealId,
      sealSha: expectedInput.sealSha,
      manifestSealId: evidence.manifest.identity,
      manifestSealSha: evidence.manifest.sha256,
    });
    expect(Object.isFrozen(model.calls[0])).toBe(true);
    expect(artifact.toModelOutput()).toMatchObject({
      sealId: expectedInput.sealId,
      sealSha: expectedInput.sealSha,
    });
  });

  it("propagates the original model error without a second call", async () => {
    const failure = new Error("weekly model unavailable");
    const model = new FakeWeeklyModel(() => {
      throw failure;
    });

    await expect(
      new GenerateReaderSummaryWeeklyArtifactUseCase(model).execute(
        weeklyEvidence(),
      ),
    ).rejects.toBe(failure);
    expect(model.calls).toHaveLength(1);
  });

  it("rejects output with a fabricated schema or sealed-input binding", async () => {
    const scenarios: readonly ((
      input: ReaderSummaryWeeklyModelInput,
    ) => ReaderSummaryWeeklyModelOutput)[] = [
      (input) =>
        ({
          ...weeklyOutput(input),
          schemaVersion: "reader_summary.weekly_model_output.v0",
        }) as unknown as ReaderSummaryWeeklyModelOutput,
      (input) => ({
        ...weeklyOutput(input),
        sealSha: "f".repeat(64),
      }),
      (input) => ({
        ...weeklyOutput(input),
        sealId: `reader_summary.weekly_model_input.v1:${"e".repeat(64)}`,
      }),
    ];

    for (const output of scenarios) {
      const model = new FakeWeeklyModel(output);
      await expect(
        new GenerateReaderSummaryWeeklyArtifactUseCase(model).execute(
          weeklyEvidence(),
        ),
      ).rejects.toThrow("does not bind the sealed input");
      expect(model.calls).toHaveLength(1);
    }
  });

  it("rejects fabricated citations, stories, and chronology", async () => {
    const scenarios: readonly Readonly<{
      change: (input: ReaderSummaryWeeklyModelInput) =>
        ReaderSummaryWeeklyModelOutput;
      message: RegExp;
    }>[] = [
      {
        change: (input) => ({
          ...weeklyOutput(input),
          headlineCitationIds: ["citation:fabricated"],
        }),
        message: /cites unknown evidence/u,
      },
      {
        change: (input) => {
          const output = weeklyOutput(input);
          return {
            ...output,
            stories: [
              { ...output.stories[0]!, storyId: "story:fabricated" },
              ...output.stories.slice(1),
            ],
          };
        },
        message: /invents a story id/u,
      },
      {
        change: (input) => {
          const output = weeklyOutput(input);
          return {
            ...output,
            stories: [
              { ...output.stories[0]!, observedFrom: dates[1] },
              ...output.stories.slice(1),
            ],
          };
        },
        message: /fabricates chronology/u,
      },
    ];

    for (const scenario of scenarios) {
      const model = new FakeWeeklyModel(scenario.change);
      await expect(
        new GenerateReaderSummaryWeeklyArtifactUseCase(model).execute(
          weeklyEvidence(),
        ),
      ).rejects.toThrow(scenario.message);
      expect(model.calls).toHaveLength(1);
    }
  });

  it("rejects provider and day dominance", async () => {
    const providerDominatedEvidence = weeklyEvidence({
      providers: ["hacker-news", "hacker-news", "hacker-news", "rss"],
    });
    const providerModel = new FakeWeeklyModel((input) => weeklyOutput(input));

    await expect(
      new GenerateReaderSummaryWeeklyArtifactUseCase(providerModel).execute(
        providerDominatedEvidence,
      ),
    ).rejects.toMatchObject({
      result: {
        qualityGates: { providerDominanceIsControlled: false },
      },
    });
    expect(providerModel.calls).toHaveLength(1);

    const dayDominatedEvidence = weeklyEvidence({
      dayIndexes: [0, 6, 0, 0],
      storyIds: [
        "story:alpha",
        "story:alpha",
        "story:beta",
        "story:gamma",
      ],
    });
    const dayModel = new FakeWeeklyModel((input) =>
      weeklyOutput(input),
    );

    await expect(
      new GenerateReaderSummaryWeeklyArtifactUseCase(dayModel).execute(
        dayDominatedEvidence,
      ),
    ).rejects.toMatchObject({
      result: {
        qualityGates: { dayDominanceIsControlled: false },
      },
    });
    expect(dayModel.calls).toHaveLength(1);
  });

  it("rejects duplicate same-story same-day observations before model work", async () => {
    const model = new FakeWeeklyModel((input) => weeklyOutput(input));

    await expect(
      new GenerateReaderSummaryWeeklyArtifactUseCase(model).execute(
        weeklyEvidence({ dayIndexes: [0, 0, 4, 6] }),
      ),
    ).rejects.toThrow("duplicate same-story same-day observations");
    expect(model.calls).toHaveLength(0);
  });

  it("rejects a stitched-daily narrative", async () => {
    const model = new FakeWeeklyModel((input) => ({
      ...weeklyOutput(input),
      synthesis:
        "A day-by-day digest would repeat isolated updates instead of explaining the grounded cross-week story and its open questions.",
    }));

    await expect(
      new GenerateReaderSummaryWeeklyArtifactUseCase(model).execute(
        weeklyEvidence(),
      ),
    ).rejects.toMatchObject({
      result: {
        qualityGates: { weeklySynthesisIsCoherent: false },
      },
    });
    expect(model.calls).toHaveLength(1);
  });

  it("allows a valid multi-day, multi-provider weekly synthesis", async () => {
    const model = new FakeWeeklyModel((input) => weeklyOutput(input));

    const snapshot = (
      await new GenerateReaderSummaryWeeklyArtifactUseCase(model).execute(
        weeklyEvidence(),
      )
    ).toSnapshot();

    expect(model.calls).toHaveLength(1);
    expect(snapshot.editorialQuality).toMatchObject({
      publicationDecision: "allow",
      blockingPassed: true,
      metrics: {
        citedDayCount: 4,
        citedProviderCount: 4,
        dominantDayCitationShare: 0.25,
        dominantProviderCitationShare: 0.25,
      },
    });
    expect(snapshot.output.stories).toHaveLength(2);
    expect(snapshot.output.sections).toHaveLength(2);
  });

  it("does not admit caller-controlled daily text into model authority", async () => {
    const marker = "CALLER DAILY TEXT MUST NOT ENTER THE MODEL";
    const command = {
      ...weeklyEvidence(),
      dailySummaries: [marker],
    } as GenerateReaderSummaryWeeklyArtifactCommand;
    const model = new FakeWeeklyModel((input) => weeklyOutput(input));

    await new GenerateReaderSummaryWeeklyArtifactUseCase(model).execute(command);

    expect(model.calls).toHaveLength(1);
    expect(JSON.stringify(model.calls[0])).not.toContain(marker);
  });
});

class FakeWeeklyModel implements ReaderSummaryWeeklyModelPort {
  readonly calls: ReaderSummaryWeeklyModelInput[] = [];

  constructor(
    private readonly respond: (
      input: ReaderSummaryWeeklyModelInput,
    ) => ReaderSummaryWeeklyModelOutput | Promise<ReaderSummaryWeeklyModelOutput>,
  ) {}

  async generate(
    input: ReaderSummaryWeeklyModelInput,
  ): Promise<ReaderSummaryWeeklyModelOutput> {
    this.calls.push(input);
    return this.respond(input);
  }
}

type WeeklyEvidenceOptions = Readonly<{
  providers?: readonly GenericProvider[];
  dayIndexes?: readonly number[];
  storyIds?: readonly string[];
}>;

const weeklyEvidence = (
  options: WeeklyEvidenceOptions = {},
): ReaderSummaryWeeklyModelEvidenceInput => {
  const manifest = sealReaderSummaryWeeklyInputManifest(manifestEvidence());
  const providers = options.providers ?? genericProviders;
  const dayIndexes = options.dayIndexes ?? [0, 2, 4, 6];
  const storyIds = options.storyIds ?? [
    "story:alpha",
    "story:alpha",
    "story:beta",
    "story:beta",
  ];
  const observations = providers.map((providerKey, index) => {
    const day = manifest.days[dayIndexes[index]!]!;
    return {
      observationId: `observation:0${index + 1}`,
      storyId: storyIds[index]!,
      observedOn: day.requestedUtcDate,
      providerKey,
      text: `Database-derived observation ${index + 1} supplies weekly context.`,
      claimSupport:
        index < 2
          ? (["snapshot", "evolution"] as const)
          : (["snapshot"] as const),
      citationIds: [`citation:0${index + 1}`],
      dailyCertificationId: day.dailyCertification.identity,
      dailyCertificationSha: day.dailyCertification.sha256,
      sourceSha256: genericSourceHash(providerKey, day.requestedUtcDate),
    };
  });

  return {
    manifest,
    stories: [...new Set(storyIds)].map((storyId) => ({
      storyId,
      label:
        storyId === "story:alpha"
          ? "Agent safety controls"
          : "Release questions",
    })),
    observations,
    citations: observations.map((observation, index) => ({
      citationId: observation.citationIds[0]!,
      observationId: observation.observationId,
      storyId: observation.storyId,
      observedOn: observation.observedOn,
      providerKey: observation.providerKey,
      title: `Grounded source ${index + 1}`,
      canonicalUrl: `https://example.test/source-${index + 1}`,
      dailyCertificationId: observation.dailyCertificationId,
      dailyCertificationSha: observation.dailyCertificationSha,
      sourceSha256: observation.sourceSha256,
    })),
  };
};

const weeklyOutput = (
  input: ReaderSummaryWeeklyModelInput,
  options: Readonly<{ alphaEvolves?: boolean }> = {},
): ReaderSummaryWeeklyModelOutput => {
  const alphaCitationIds = citationIdsFor(input, "story:alpha");
  const alphaEvolves = options.alphaEvolves ?? true;
  const allCitationIds = input.citations.map((citation) => citation.citationId);

  return {
    schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
    sealId: input.sealId,
    sealSha: input.sealSha,
    weekStartedOn: input.weekStartedOn,
    weekEndedOn: input.weekEndedOn,
    headline:
      "Agent safeguards reached teams while release questions stayed open",
    headlineCitationIds: [...allCitationIds],
    takeaway:
      "Practical safety controls mattered most, while release details remained open.",
    takeawayCitationIds: [...allCitationIds],
    synthesis:
      "Across the week, teams put agent safety controls into practice while separate release questions remained open. The combined record shows concrete adoption without turning incomplete discussion into a claimed outcome.",
    synthesisCitationIds: [...allCitationIds],
    stories: input.stories.map((story) => {
      const citationIds = citationIdsFor(input, story.storyId);
      const range = citedRange(input, citationIds);
      return story.storyId === "story:alpha"
        ? {
            storyId: "story:alpha",
            headline: "Agent safety controls entered practical use",
            summary:
              "Early safeguards were followed by concrete use in team workflows, with limits still clearly stated.",
            status: alphaEvolves ? "developing" : "watch",
            ...range,
            citationIds: [...alphaCitationIds],
          }
        : {
            storyId: story.storyId,
            headline: "Release questions remained open",
            summary:
              "Separate reports kept attention on release details without establishing a final outcome.",
            status: "watch",
            ...range,
            citationIds: [...citationIds],
          };
    }),
    sections: input.stories.map((story) => {
      const citationIds = citationIdsFor(input, story.storyId);
      const range = citedRange(input, citationIds);
      return story.storyId === "story:alpha"
        ? {
            sectionId: "section:alpha-lead",
            storyId: "story:alpha",
            kind: "lead",
            claimType: alphaEvolves ? "evolution" : "snapshot",
            heading: "Safety controls entered practice",
            text:
              "The week connected safeguards to concrete use in team workflows.",
            ...range,
            citationIds: [...alphaCitationIds],
          }
        : {
            sectionId: `section:${story.storyId.slice("story:".length)}-watch`,
            storyId: story.storyId,
            kind: "watch",
            claimType: "snapshot",
            heading: "Release details stayed open",
            text:
              "The cited reports raised useful questions but did not establish an outcome.",
            ...range,
            citationIds: [...citationIds],
          };
    }),
  };
};

const citationIdsFor = (
  input: ReaderSummaryWeeklyModelInput,
  storyId: string,
): readonly string[] =>
  input.citations
    .filter((citation) => citation.storyId === storyId)
    .map((citation) => citation.citationId);

const citedRange = (
  input: ReaderSummaryWeeklyModelInput,
  citationIds: readonly string[],
): Readonly<{ observedFrom: string; observedThrough: string }> => {
  const citedDates = input.citations
    .filter((citation) => citationIds.includes(citation.citationId))
    .map((citation) => citation.observedOn)
    .sort();
  return {
    observedFrom: citedDates[0]!,
    observedThrough: citedDates[citedDates.length - 1]!,
  };
};

const manifestEvidence = (): ReaderSummaryWeeklyInputManifestEvidence => ({
  weekStartedUtcDate: dates[0],
  tenantId: "tenant-weekly",
  workspaceId: "workspace-weekly",
  scope: { type: "workspace" },
  days: dates.map((date, index) => {
    const githubAuditEvidence = githubEvidence(date, index);
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubAuditEvidence);
    return {
      githubAuditEvidence,
      dailyCertificationEvidence: dailyEvidence(date, audit),
    };
  }),
});

const githubEvidence = (
  date: string,
  dayIndex: number,
): ReaderSummaryWeeklyGitHubAuditEvidenceInput => {
  const scanJobId = `github-scan-${date}`;
  const observedAt = new Date(
    Date.parse(`${date}T00:00:00.000Z`) + 86_424_435,
  ).toISOString();
  return {
    requestedUtcDay: date,
    scanJobId,
    providerKey: readerSummaryWeeklyGitHubProviderKey,
    kind: readerSummaryWeeklyGitHubEvidenceKind,
    sourceBindingId: `github-binding-${date}`,
    fetchStartedAt: `${date}T23:50:00.000Z`,
    checkedAt: `${date}T23:59:59.999Z`,
    observedAt,
    repositories: Array.from({ length: 10 }, (_, index) => ({
      requestedUtcDay: date,
      scanJobId,
      providerKey: readerSummaryWeeklyGitHubProviderKey,
      kind: readerSummaryWeeklyGitHubEvidenceKind,
      sourceBindingId: `github-binding-${date}`,
      fetchStartedAt: `${date}T23:50:00.000Z`,
      checkedAt: `${date}T23:59:59.999Z`,
      publishedAt: `${date}T23:${String(50 + index).padStart(2, "0")}:30.000Z`,
      observedAt,
      rank: index + 1,
      canonicalUrl: `https://github.com/owner-${dayIndex}/repo-${index + 1}`,
      sourceEvidence: {
        heading: `owner-${dayIndex}/repo-${index + 1}`,
        description: `Synthetic repository evidence ${dayIndex}-${index + 1}`,
        primaryLanguage: index % 2 === 0 ? "TypeScript" : null,
        starsToday: 100 - index,
        totalStars: 1_000 + dayIndex * 100 + index,
        forks: 100 + index,
      },
    })),
  };
};

const dailyEvidence = (
  date: string,
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): ReaderSummaryWeeklyDailyCertificationEvidenceInput => {
  const authority = {
    requestedUtcDate: date,
    tenantId: "tenant-weekly",
    workspaceId: "workspace-weekly",
    publicationId: `publication-${date}`,
    artifactId: `artifact-${date}`,
    jobId: `job-${date}`,
    reportId: `report-${date}`,
    proofId: `proof-${date}`,
  };
  const artifactPayload: ReaderSummaryWeeklyDailyArtifactPayloadInput = {
    schemaVersion: readerSummaryWeeklyDailyArtifactSchemaVersion,
    ...authority,
    scope: { type: "workspace" },
    period: readerSummaryWeeklyDailyPeriod(date),
    githubBinding: githubBinding(audit),
    providerEvidence: [
      ...audit.repositories.map((repository, index) => ({
        evidenceId: `github-${date}-${index + 1}`,
        providerKey: readerSummaryWeeklyGitHubProviderKey,
        sourceBindingId: audit.sourceBindingId,
        repositoryIdentity: repository.repositoryIdentity,
      })),
      ...genericProviders.map((providerKey) => ({
        evidenceId: `${providerKey}-evidence-${date}`,
        providerKey,
        sourceBindingId: genericSourceBindingId(providerKey, date),
        sourceEvidence: genericSourceEvidence(providerKey, date),
      })),
    ],
  };
  const artifactSha256 =
    canonicalizeReaderSummaryWeeklyJson(artifactPayload).sha256;
  const reportPayload: ReaderSummaryWeeklyDailyReportPayloadInput = {
    schemaVersion: readerSummaryWeeklyDailyReportSchemaVersion,
    requestedUtcDate: date,
    tenantId: authority.tenantId,
    workspaceId: authority.workspaceId,
    scope: { type: "workspace" },
    period: readerSummaryWeeklyDailyPeriod(date),
    publicationId: authority.publicationId,
    reportId: authority.reportId,
    artifactBinding: {
      artifactId: authority.artifactId,
      jobId: authority.jobId,
      proofId: authority.proofId,
      artifactSha256,
    },
    githubBinding: githubBinding(audit),
    providerCounts: providerCounts(),
    blockingGates: Object.fromEntries(
      readerSummaryWeeklyRequiredDailyBlockingGateNames.map((name) => [
        name,
        true,
      ]),
    ) as Record<
      (typeof readerSummaryWeeklyRequiredDailyBlockingGateNames)[number],
      boolean
    >,
  };
  const exactProof: ReaderSummaryWeeklyDailyExactProofInput = {
    schemaVersion: readerSummaryWeeklyDailyProofSchemaVersion,
    ...authority,
    scope: { type: "workspace" },
    period: readerSummaryWeeklyDailyPeriod(date),
    reportSha256: canonicalizeReaderSummaryWeeklyJson(reportPayload).sha256,
    artifactSha256,
    githubBinding: githubBinding(audit),
    providerCounts: providerCounts(),
    blockingGateNames: [...readerSummaryWeeklyRequiredDailyBlockingGateNames],
  };
  return {
    ...authority,
    scope: { type: "workspace" },
    reportPayload,
    exactProof,
    artifactPayload,
  };
};

const githubBinding = (
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): ReaderSummaryWeeklyGitHubBindingInput => ({
  requestedUtcDay: audit.requestedUtcDay,
  scanJobId: audit.scanJobId,
  providerKey: audit.providerKey,
  kind: audit.kind,
  sourceBindingId: audit.sourceBindingId,
});

const providerCounts = (): ReaderSummaryWeeklyProviderCountsInput => ({
  "github-trending-page": 10,
  "hacker-news": 1,
  reddit: 1,
  rss: 1,
  "x-twitter": 1,
});

const genericSourceBindingId = (
  providerKey: GenericProvider,
  date: string,
): string => `${providerKey}-binding-${date}`;

const genericSourceEvidence = (
  providerKey: GenericProvider,
  date: string,
) => ({
  sourceRecordId: `${providerKey}-record-${date}`,
  observedAt: `${date}T12:00:00.000Z`,
  title: `${providerKey} evidence ${date}`,
  content: `Synthetic ${providerKey} evidence observed on ${date}.`,
});

const genericSourceHash = (
  providerKey: GenericProvider,
  date: string,
): string =>
  canonicalizeReaderSummaryWeeklyJson({
    schemaVersion: readerSummaryWeeklyProviderSourceEvidenceSchemaVersion,
    providerKey,
    sourceBindingId: genericSourceBindingId(providerKey, date),
    ...genericSourceEvidence(providerKey, date),
  }).sha256;
