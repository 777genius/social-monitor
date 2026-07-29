import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyDailyPeriod,
} from "../value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyDailyArtifactSchemaVersion,
  readerSummaryWeeklyDailyProofSchemaVersion,
  readerSummaryWeeklyDailyReportSchemaVersion,
  readerSummaryWeeklyRequiredDailyBlockingGateNames,
  type ReaderSummaryWeeklyDailyArtifactPayloadInput,
  type ReaderSummaryWeeklyDailyCertificationEvidenceInput,
  type ReaderSummaryWeeklyDailyExactProofInput,
  type ReaderSummaryWeeklyDailyReportPayloadInput,
  type ReaderSummaryWeeklyGitHubBindingInput,
  type ReaderSummaryWeeklyProviderCountsInput,
} from "../value-objects/reader-summary-weekly-daily-certification";
import {
  certifyReaderSummaryWeeklyGitHubAudit,
  readerSummaryWeeklyGitHubEvidenceKind,
  readerSummaryWeeklyGitHubProviderKey,
  type ReaderSummaryWeeklyCanonicalGitHubAudit,
  type ReaderSummaryWeeklyGitHubAuditEvidenceInput,
} from "../value-objects/reader-summary-weekly-github-audit";
import {
  sealReaderSummaryWeeklyInputManifest,
  type ReaderSummaryWeeklyInputManifestEvidence,
} from "../value-objects/reader-summary-weekly-input-manifest";
import {
  readerSummaryWeeklyModelInputSchemaVersion,
  readerSummaryWeeklyModelOutputSchemaVersion,
  sealReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import { ReaderSummaryWeeklyArtifact } from "./reader-summary-weekly-artifact";

const dates = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
] as const;
const sourceHashes = ["a", "b", "c", "d"].map((value) => value.repeat(64));

describe("ReaderSummaryWeeklyArtifact", () => {
  it("creates an immutable replay-stable artifact bound to sealed evidence", () => {
    const input = weeklyInput();
    const first = ReaderSummaryWeeklyArtifact.create({
      input,
      output: weeklyOutput(input),
    }).toSnapshot();
    const replay = ReaderSummaryWeeklyArtifact.create({
      input,
      output: weeklyOutput(input),
    }).toSnapshot();

    expect(first).toEqual(replay);
    expect(first.output).toMatchObject({
      schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
      sealId: input.sealId,
      sealSha: input.sealSha,
      weekStartedOn: dates[0],
      weekEndedOn: dates[6],
    });
    expect(first.editorialQuality).toMatchObject({
      publicationDecision: "allow",
      blockingPassed: true,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.output.sections)).toBe(true);
  });

  it("seals real 7/7 manifest evidence immutably and deterministically", () => {
    const firstManifest =
      sealReaderSummaryWeeklyInputManifest(manifestEvidence());
    const replayManifest =
      sealReaderSummaryWeeklyInputManifest(manifestEvidence());
    const first = sealReaderSummaryWeeklyModelInput(
      modelEvidence(firstManifest),
    );
    const replay = sealReaderSummaryWeeklyModelInput(
      modelEvidence(replayManifest),
    );

    expect(first).toEqual(replay);
    expect(first.days).toHaveLength(7);
    expect(new Set(first.days.map((day) => day.date)).size).toBe(7);
    expect(new Set(first.days.map((day) => day.githubBoardId)).size).toBe(7);
    expect(
      first.days.every(
        (day) =>
          day.dailyCertificationStatus === "certified" &&
          day.githubBoardStatus === "verified",
      ),
    ).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.observations)).toBe(true);
    expect(Object.isFrozen(first.citations)).toBe(true);
  });

  it("rejects truncated or reordered source manifests before model sealing", () => {
    const manifest = sealReaderSummaryWeeklyInputManifest(manifestEvidence());
    const evidence = modelEvidence(manifest);
    const truncated = {
      ...manifest,
      days: manifest.days.slice(0, 6),
    };
    const reordered = {
      ...manifest,
      days: [...manifest.days].reverse(),
    };

    expect(() =>
      sealReaderSummaryWeeklyModelInput({
        ...evidence,
        manifest: truncated,
      }),
    ).toThrow();
    expect(() =>
      sealReaderSummaryWeeklyModelInput({
        ...evidence,
        manifest: reordered,
      }),
    ).toThrow();
  });

  it("rejects unknown and duplicate citations", () => {
    const input = weeklyInput();
    const unknown = mutable(weeklyOutput(input));
    unknown.stories[0]!.citationIds = ["citation:missing"];
    const duplicate = mutable(weeklyOutput(input));
    duplicate.sections[0]!.citationIds = ["citation:01", "citation:01"];

    expect(() =>
      ReaderSummaryWeeklyArtifact.create({ input, output: unknown }),
    ).toThrow("cites unknown evidence");
    expect(() =>
      ReaderSummaryWeeklyArtifact.create({ input, output: duplicate }),
    ).toThrow("duplicate");
  });

  it("rejects story and section citations mixed across story authority", () => {
    const input = weeklyInput();
    const mixedStory = mutable(weeklyOutput(input));
    mixedStory.stories[0]!.citationIds = ["citation:01", "citation:03"];
    mixedStory.stories[0]!.observedThrough = dates[4];
    const mixedSection = mutable(weeklyOutput(input));
    mixedSection.sections[1]!.citationIds = ["citation:02", "citation:03"];
    mixedSection.sections[1]!.observedFrom = dates[2];

    for (const output of [mixedStory, mixedSection]) {
      expect(() =>
        ReaderSummaryWeeklyArtifact.create({ input, output }),
      ).toThrow("cites another story");
    }
  });

  it("rejects duplicate story ids and duplicate story sections", () => {
    const input = weeklyInput();
    const duplicateStory = mutable(weeklyOutput(input));
    duplicateStory.stories[1]!.storyId = "story:alpha";
    duplicateStory.stories[1]!.citationIds = ["citation:01", "citation:02"];
    duplicateStory.stories[1]!.observedFrom = dates[0];
    duplicateStory.stories[1]!.observedThrough = dates[2];
    const duplicateSection = mutable(weeklyOutput(input));
    duplicateSection.sections.push({
      ...duplicateSection.sections[0]!,
      sectionId: "section:alpha-lead-copy",
      citationIds: [...duplicateSection.sections[0]!.citationIds],
    });

    expect(() =>
      ReaderSummaryWeeklyArtifact.create({ input, output: duplicateStory }),
    ).toThrow("duplicate output story ids");
    expect(() =>
      ReaderSummaryWeeklyArtifact.create({ input, output: duplicateSection }),
    ).toThrow("duplicate output story sections");
  });

  it("rejects fabricated or out-of-week chronology", () => {
    const input = weeklyInput();
    const fabricated = mutable(weeklyOutput(input));
    fabricated.stories[0]!.observedFrom = dates[1];
    const outside = mutable(weeklyOutput(input));
    outside.sections[0]!.observedThrough = "2026-07-27";

    for (const output of [fabricated, outside]) {
      expect(() =>
        ReaderSummaryWeeklyArtifact.create({ input, output }),
      ).toThrow(/fabricates chronology|UTC day/u);
    }
  });

  it("rejects uncited facts and unsupported resolution before publication", () => {
    const input = weeklyInput();
    const uncited = mutable(weeklyOutput(input));
    uncited.synthesisCitationIds = [];
    const unsupported = mutable(weeklyOutput(input));
    unsupported.sections[1]!.claimType = "resolution";
    unsupported.sections[1]!.text =
      "The release question was resolved and the final outcome is now settled.";

    expect(() =>
      ReaderSummaryWeeklyArtifact.create({ input, output: uncited }),
    ).toThrow("must cite evidence");
    expect(() =>
      ReaderSummaryWeeklyArtifact.create({ input, output: unsupported }),
    ).toThrow("unsupported resolution");
  });

  it("rejects a weekly artifact without a cross-day lead story", () => {
    const input = weeklyInput();
    const output = mutable(weeklyOutput(input));
    output.stories[0] = {
      ...output.stories[0]!,
      summary:
        "The cited safeguard report describes current controls without claiming a later change.",
      status: "watch",
      observedThrough: dates[0],
      citationIds: ["citation:01"],
    };
    output.sections[0] = {
      ...output.sections[0]!,
      claimType: "snapshot",
      text:
        "The cited safeguard report describes current controls and their limits.",
      observedThrough: dates[0],
      citationIds: ["citation:01"],
    };
    output.stories[1] = {
      ...output.stories[1]!,
      observedThrough: dates[4],
      citationIds: ["citation:03"],
    };
    output.sections[1] = {
      ...output.sections[1]!,
      observedThrough: dates[4],
      citationIds: ["citation:03"],
    };

    expect(() =>
      ReaderSummaryWeeklyArtifact.create({ input, output }),
    ).toThrow("must carry one stable story across multiple days");
  });

  it("rejects unknown fields and any unverified weekly board", () => {
    const input = weeklyInput();
    const extra = mutable(weeklyOutput(input));
    Object.assign(extra, { extra: true });
    const unverified = mutable(weeklyInput());
    Object.assign(unverified.days[3]!, {
      githubBoardStatus: "unverified",
    });

    expect(() =>
      ReaderSummaryWeeklyArtifact.create({ input, output: extra }),
    ).toThrow("exactly");
    expect(() =>
      ReaderSummaryWeeklyArtifact.create({
        input: unverified as ReaderSummaryWeeklyModelInput,
        output: weeklyOutput(input),
      }),
    ).toThrow("not certified");
  });
});

const weeklyInput = (): ReaderSummaryWeeklyModelInput => {
  const days = dates.map((date, index) => ({
    date,
    dailyCertificationId: `daily:${date}`,
    dailyCertificationSha: "1".repeat(64),
    dailyCertificationStatus: "certified" as const,
    githubBoardId: `github-board:${date}`,
    githubBoardSha: String(index + 2).repeat(64),
    githubBoardStatus: "verified" as const,
    providerCounts: [
      { providerKey: "github-trending-page" as const, count: 10 },
      { providerKey: "hacker-news" as const, count: 2 },
      { providerKey: "reddit" as const, count: 2 },
      { providerKey: "rss" as const, count: 2 },
      { providerKey: "x-twitter" as const, count: 2 },
    ],
  }));
  const observations = [
    observation(1, "story:alpha", 0, "hacker-news", ["snapshot"]),
    observation(2, "story:alpha", 2, "reddit", ["snapshot", "evolution"]),
    observation(3, "story:beta", 4, "rss", ["snapshot"]),
    observation(4, "story:beta", 6, "x-twitter", ["snapshot"]),
  ];
  const body = {
    schemaVersion: readerSummaryWeeklyModelInputSchemaVersion,
    manifestSealId: `reader_summary.weekly_input_manifest.v1:${"f".repeat(64)}`,
    manifestSealSha: "f".repeat(64),
    tenantId: "tenant-weekly",
    workspaceId: "workspace-weekly",
    scope: { type: "workspace" as const },
    weekStartedOn: dates[0],
    weekEndedOn: dates[6],
    days,
    stories: [
      { storyId: "story:alpha", label: "Agent safety controls" },
      { storyId: "story:beta", label: "Release questions" },
    ],
    observations,
    citations: observations.map((item, index) => ({
      citationId: item.citationIds[0]!,
      observationId: item.observationId,
      storyId: item.storyId,
      observedOn: item.observedOn,
      providerKey: item.providerKey,
      title: `Grounded source ${index + 1}`,
      canonicalUrl: `https://example.test/source-${index + 1}`,
      dailyCertificationId: item.dailyCertificationId,
      dailyCertificationSha: item.dailyCertificationSha,
      sourceSha256: item.sourceSha256,
    })),
  };
  const sealSha = canonicalizeReaderSummaryWeeklyJson(
    body,
    "test weekly input",
  ).sha256;
  return {
    ...body,
    sealId: `${readerSummaryWeeklyModelInputSchemaVersion}:${sealSha}`,
    sealSha,
  };
};

const observation = (
  number: number,
  storyId: string,
  dayIndex: number,
  providerKey: "hacker-news" | "reddit" | "rss" | "x-twitter",
  claimSupport: readonly ("snapshot" | "evolution")[],
) => ({
  observationId: `observation:${String(number).padStart(2, "0")}`,
  storyId,
  observedOn: dates[dayIndex]!,
  providerKey,
  text: `Sealed observation ${number} supplies grounded weekly context.`,
  claimSupport,
  citationIds: [`citation:${String(number).padStart(2, "0")}`],
  dailyCertificationId: `daily:${dates[dayIndex]}`,
  dailyCertificationSha: "1".repeat(64),
  sourceSha256: sourceHashes[number - 1]!,
});

const weeklyOutput = (
  input: ReaderSummaryWeeklyModelInput,
): ReaderSummaryWeeklyModelOutput => ({
  schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
  sealId: input.sealId,
  sealSha: input.sealSha,
  weekStartedOn: dates[0],
  weekEndedOn: dates[6],
  headline: "Agent safeguards reached teams while release questions stayed open",
  headlineCitationIds: [
    "citation:01",
    "citation:02",
    "citation:03",
    "citation:04",
  ],
  takeaway:
    "Practical safety controls mattered most, while release details remained open.",
  takeawayCitationIds: ["citation:01", "citation:02", "citation:03"],
  synthesis:
    "Across the week, teams put agent safety controls into practice while separate release questions remained open. The combined record shows concrete adoption without turning incomplete release discussion into a claimed outcome.",
  synthesisCitationIds: [
    "citation:01",
    "citation:02",
    "citation:03",
    "citation:04",
  ],
  stories: [
    {
      storyId: "story:alpha",
      headline: "Agent safety controls entered practical use",
      summary:
        "Early safeguards were followed by concrete use in team workflows, with limits still clearly stated.",
      status: "developing",
      observedFrom: dates[0],
      observedThrough: dates[2],
      citationIds: ["citation:01", "citation:02"],
    },
    {
      storyId: "story:beta",
      headline: "Release questions remained open",
      summary:
        "Separate reports kept attention on release details without establishing a final outcome.",
      status: "watch",
      observedFrom: dates[4],
      observedThrough: dates[6],
      citationIds: ["citation:03", "citation:04"],
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
      citationIds: ["citation:01", "citation:02"],
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
      citationIds: ["citation:03", "citation:04"],
    },
  ],
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
        description: `Day ${dayIndex} repository ${index + 1} evidence`,
        primaryLanguage: index % 2 === 0 ? "TypeScript" : null,
        starsToday: 100 - index,
        totalStars: 1_000 + dayIndex * 100 + index,
        forks: 100 + index,
      },
    })),
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
  "hacker-news": 0,
  reddit: 0,
  rss: 0,
  "x-twitter": 0,
});

const dailyEvidence = (
  date: string,
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): ReaderSummaryWeeklyDailyCertificationEvidenceInput => {
  const authority = {
    requestedUtcDate: date,
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
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
    providerEvidence: audit.repositories.map((repository, index) => ({
      evidenceId: `github-${date}-${index + 1}`,
      providerKey: readerSummaryWeeklyGitHubProviderKey,
      sourceBindingId: audit.sourceBindingId,
      repositoryIdentity: repository.repositoryIdentity,
    })),
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

const manifestEvidence = (): ReaderSummaryWeeklyInputManifestEvidence => ({
  weekStartedUtcDate: dates[0],
  tenantId: "tenant-a",
  workspaceId: "workspace-a",
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

const modelEvidence = (
  manifest: ReturnType<typeof sealReaderSummaryWeeklyInputManifest>,
) => {
  const selectedDays = [0, 2, 4, 6] as const;
  const observations = selectedDays.map((dayIndex, index) => {
    const day = manifest.days[dayIndex]!;
    const source = day.githubAudit.repositories[0]!;
    return {
      observationId: `observation:0${index + 1}`,
      storyId: index < 2 ? "story:alpha" : "story:beta",
      observedOn: day.requestedUtcDate,
      providerKey: readerSummaryWeeklyGitHubProviderKey,
      text: `Verified GitHub board observation ${index + 1}.`,
      claimSupport:
        index === 1
          ? (["snapshot", "evolution"] as const)
          : (["snapshot"] as const),
      citationIds: [`citation:0${index + 1}`],
      dailyCertificationId: day.dailyCertification.identity,
      dailyCertificationSha: day.dailyCertification.sha256,
      sourceSha256: source.sourceContentHash,
    };
  });
  return {
    manifest,
    stories: [
      { storyId: "story:alpha", label: "Agent safety controls" },
      { storyId: "story:beta", label: "Release questions" },
    ],
    observations,
    citations: observations.map((observation, index) => {
      const source =
        manifest.days[selectedDays[index]!]!.githubAudit.repositories[0]!;
      return {
        citationId: observation.citationIds[0]!,
        observationId: observation.observationId,
        storyId: observation.storyId,
        observedOn: observation.observedOn,
        providerKey: observation.providerKey,
        title: source.sourceEvidence.heading,
        canonicalUrl: source.canonicalUrl,
        dailyCertificationId: observation.dailyCertificationId,
        dailyCertificationSha: observation.dailyCertificationSha,
        sourceSha256: observation.sourceSha256,
      };
    }),
  };
};

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

const mutable = <T>(value: T): Mutable<T> => value as Mutable<T>;
