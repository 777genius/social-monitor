import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyDailyPeriod,
} from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCanonicalProviderKeys,
} from "../../../domain/value-objects/reader-summary-weekly-daily-certification";
import {
  readerSummaryWeeklyPublicationEvidenceSchemaVersion,
  type ReaderSummaryWeeklyPublicationProviderEvidence,
} from "../../../domain/value-objects/reader-summary-weekly-publication-evidence";
import {
  readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
} from "../../../domain/value-objects/reader-summary-weekly-publication-github-evidence";
import {
  assertReaderSummaryWeeklyStoryAuthorityBinding,
  readerSummaryWeeklyStoryAuthoritySchemaVersion,
  type ReaderSummaryWeeklyStoryAuthorityBinding,
} from "../../../domain/value-objects/reader-summary-weekly-story-authority";
import {
  deriveReaderSummaryWeeklyStoryIdentity,
} from "../../../domain/value-objects/reader-summary-weekly-story-identity";
import {
  observeReaderSummaryWeeklyStories,
  observeReaderSummaryWeeklyStory,
  type ReaderSummaryWeeklyStoryObservationInput,
} from "../../../domain/entities/reader-summary-weekly-story-observation";
import type {
  LoadReaderSummaryWeeklyStoryAuthorityQuery,
  ReaderSummaryWeeklyStoryAuthorityHandle,
  ReaderSummaryWeeklyStoryAuthorityPort,
} from "../../../ports/reader-summary-weekly-story-authority.port";
import { PrismaReaderSummaryWeeklyStoryAuthority } from "./prisma-reader-summary-weekly-story-authority";
import type { PrismaSummaryClient } from "./prisma-summary-client";

describe("PrismaReaderSummaryWeeklyStoryAuthority", () => {
  it("loads one exact tenant, workspace and publication authority", async () => {
    const row = publicationRow();
    const prisma = new FakeAuthorityPrisma([row]);
    const port: ReaderSummaryWeeklyStoryAuthorityPort =
      new PrismaReaderSummaryWeeklyStoryAuthority(
        prisma as unknown as PrismaSummaryClient,
      );

    const authority = await port.load(query);
    const binding = port.readVerifiedBinding(authority!);

    expect(binding).toMatchObject({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      publicationId: query.publicationId,
      publicationEvidenceIdentity: row.identity,
      publicationEvidenceSha256: row.canonicalSha256,
      reportSha256: row.reportSha256,
      proofSha256: row.proofSha256,
      artifactPayloadSha256: row.artifactPayloadSha256,
      providerEvidenceSha256: row.providerEvidenceSha256,
      semanticStatus: "COMPLETED",
    });
    expect(binding.evidence.map((item) => item.providerKey)).toEqual([
      "hacker-news",
      "rss",
    ]);
    expect(prisma.calls[0]?.values).toEqual([
      query.tenantId,
      query.workspaceId,
      query.publicationId,
    ]);
    expect(prisma.calls[0]?.sql).toContain(
      'FROM "reader_summary_weekly_publication_evidence"',
    );
    expect(prisma.calls[0]?.sql).toContain('"tenant_id" = ?::uuid');
    expect(prisma.calls[0]?.sql).toContain('"workspace_id" = ?::uuid');
    expect(prisma.calls[0]?.sql).toContain('"publication_id" = ?::uuid');
  });

  it("returns null when the exact append-only row does not exist", async () => {
    const prisma = new FakeAuthorityPrisma([]);

    await expect(authorityAdapter(prisma).load(query)).resolves.toBeNull();
    expect(prisma.calls).toHaveLength(1);
  });

  it.each([
    ["tenant", { tenantId: "00000000-0000-4000-8000-000000000099" }],
    ["workspace", { workspaceId: "00000000-0000-4000-8000-000000000099" }],
    [
      "publication",
      { publicationId: "20000000-0000-4000-8000-000000000099" },
    ],
  ])("rejects a row with a mismatched %s", async (_label, override) => {
    const prisma = new FakeAuthorityPrisma([
      { ...publicationRow(), ...override },
    ]);

    await expect(authorityAdapter(prisma).load(query)).rejects.toThrow(
      "escaped exact tenant, workspace, or publication scope",
    );
  });

  it.each([
    [
      "job identity",
      { readerSummaryJobId: "10000000-0000-4000-8000-000000000099" },
    ],
    [
      "artifact identity",
      {
        readerSummaryArtifactId:
          "20000000-0000-4000-8000-000000000099",
      },
    ],
    ["report identity", { reportId: "reader-summary-report:forged" }],
    ["proof identity", { proofId: "reader-summary-proof:forged" }],
    ["scope identity", { scopeKey: "interest:forged" }],
    [
      "recorded timestamp",
      { recordedAt: new Date("2026-07-05T12:00:00.001Z") },
    ],
  ])("rejects a diverged persisted %s", async (_label, override) => {
    const prisma = new FakeAuthorityPrisma([
      { ...publicationRow(), ...override },
    ]);

    await expect(authorityAdapter(prisma).load(query)).rejects.toThrow(
      "persisted identity or scope diverged",
    );
  });

  it("rejects caller trust fields before issuing SQL", async () => {
    const prisma = new FakeAuthorityPrisma([publicationRow()]);

    await expect(
      authorityAdapter(prisma).load({
        ...query,
        trusted: true,
      } as never),
    ).rejects.toThrow("must contain exactly");
    expect(prisma.calls).toEqual([]);
  });

  it.each([
    [
      "canonical record",
      (row: MutablePublicationRow) => {
        row.canonicalRecord = {
          ...(row.canonicalRecord as Record<string, unknown>),
          reportSha256: "f".repeat(64),
        };
      },
    ],
    [
      "canonical bytes",
      (row: MutablePublicationRow) => {
        row.canonicalBytes = Buffer.from("{}", "utf8");
      },
    ],
    [
      "canonical hash",
      (row: MutablePublicationRow) => {
        row.canonicalSha256 = "f".repeat(64);
      },
    ],
    [
      "canonical identity",
      (row: MutablePublicationRow) => {
        row.identity =
          `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${"f".repeat(64)}`;
      },
    ],
  ])("rejects corrupted %s", async (_label, mutate) => {
    const row = publicationRow();
    mutate(row);

    await expect(
      authorityAdapter(new FakeAuthorityPrisma([row])).load(query),
    ).rejects.toThrow("canonical record, bytes, hash, or identity diverged");
  });

  it.each([
    [
      "report",
      (row: MutablePublicationRow) => {
        row.report = { ...row.report, changed: true };
      },
    ],
    [
      "proof",
      (row: MutablePublicationRow) => {
        row.exactProof = { publication: "mutated" };
      },
    ],
    [
      "provider evidence",
      (row: MutablePublicationRow) => {
        row.providerEvidence = [
          {
            ...row.providerEvidence[0]!,
            sourceContentHash: "f".repeat(64),
          },
          ...row.providerEvidence.slice(1),
        ];
      },
    ],
    [
      "artifact hash",
      (row: MutablePublicationRow) => {
        row.artifactPayloadSha256 = "f".repeat(64);
      },
    ],
  ])("rejects a diverged persisted %s", async (_label, mutate) => {
    const row = publicationRow();
    mutate(row);

    await expect(
      authorityAdapter(new FakeAuthorityPrisma([row])).load(query),
    ).rejects.toThrow("persisted hash diverged");
  });

  it("recomputes artifactPayloadSha256 from canonical report.artifactPayload bytes", async () => {
    const row = publicationRow();
    row.report = {
      ...row.report,
      artifactPayload: {
        qualityFlags: [],
        changedAfterIncorrectV4FixtureHash: true,
      },
    };
    row.reportSha256 =
      canonicalizeReaderSummaryWeeklyJson(row.report).sha256;
    row.canonicalRecord = {
      ...(row.canonicalRecord as Record<string, unknown>),
      reportSha256: row.reportSha256,
    };
    recanonicalizeEvidenceRow(row);

    await expect(
      authorityAdapter(new FakeAuthorityPrisma([row])).load(query),
    ).rejects.toThrow("persisted hash diverged");
  });

  it("rejects a corrupt persisted GitHub evidence seal", async () => {
    const row = publicationRow();
    row.githubEvidence = {
      ...row.githubEvidence,
      sha256: "f".repeat(64),
    };

    await expect(
      authorityAdapter(new FakeAuthorityPrisma([row])).load(query),
    ).rejects.toThrow("GitHub evidence seal is invalid");
  });

  it("keeps construction and trusted-set membership private to loaded rows", async () => {
    const adapter = authorityAdapter(
      new FakeAuthorityPrisma([publicationRow()]),
    );
    const authority = (await adapter.load(query))!;
    const binding = adapter.readVerifiedBinding(authority);
    const prototype = Object.getPrototypeOf(authority) as object;
    const synthetic = Object.freeze(
      Object.create(prototype) as object,
    ) as ReaderSummaryWeeklyStoryAuthorityHandle;
    const reflectedConstructor = (
      prototype as { constructor: new (...args: unknown[]) => unknown }
    ).constructor;

    expect(Object.keys(authority)).toEqual([]);
    expect((authority as unknown as Record<string, unknown>).tenantId).toBe(
      undefined,
    );
    expect(() => adapter.readVerifiedBinding(synthetic)).toThrow(
      "was not loaded by verified Prisma publication evidence",
    );
    expect(() =>
      Reflect.construct(reflectedConstructor, [{}, binding]),
    ).toThrow("is not publicly constructible");
  });

  it("rejects the frozen inherited-reader bypass against the real adapter", async () => {
    const adapter = authorityAdapter(
      new FakeAuthorityPrisma([publicationRow()]),
    );
    const authority = (await adapter.load(query))!;
    const forgedBinding = resealCallerForgedBinding(
      adapter.readVerifiedBinding(authority),
    );
    const inheritedReader = jest.fn(() => forgedBinding);
    const forgedHandle = Object.freeze(
      Object.create({ readBinding: inheritedReader }) as object,
    ) as ReaderSummaryWeeklyStoryAuthorityHandle;

    expect(() =>
      assertReaderSummaryWeeklyStoryAuthorityBinding(forgedBinding),
    ).not.toThrow();
    expect(() =>
      adapter.readVerifiedBinding(forgedHandle),
    ).toThrow("was not loaded by verified Prisma publication evidence");
    expect(inheritedReader).not.toHaveBeenCalled();
  });

  it("preserves the evidence snapshot across source_items mutation and replay", async () => {
    const row = publicationRow();
    const prisma = new FakeAuthorityPrisma([row]);
    const adapter = authorityAdapter(prisma);
    const before = adapter.readVerifiedBinding(
      (await adapter.load(query))!,
    );
    const persistedEvidenceBefore =
      canonicalizeReaderSummaryWeeklyJson(row.providerEvidence).json;

    prisma.mutateSourceItemsAfterPublication();

    const replay = adapter.readVerifiedBinding(
      (await adapter.load(query))!,
    );
    expect(prisma.sourceItems[0]).toMatchObject({
      title: "mutated after publication",
      body: "mutated source body",
      providerItemId: "provider-citation-1:mutated",
      contentHash: "f".repeat(64),
    });
    expect(
      canonicalizeReaderSummaryWeeklyJson(row.providerEvidence).json,
    ).toBe(persistedEvidenceBefore);
    expect(replay).toEqual(before);
    expect(replay.evidence[0]?.providerItemId).toBe("provider-citation-1");
    expect(replay.evidence[0]?.sourceContentHash).toBe("a".repeat(64));
  });

  it("keeps later-observed backfill evidence and excludes impossible chronology", async () => {
    const row = publicationRow();
    row.providerEvidence = [
      { ...row.providerEvidence[0]!, observedAt: "2026-07-06T08:05:00.000Z" },
      { ...row.providerEvidence[1]!, observedAt: "2026-07-04T08:05:00.000Z" },
    ];
    row.providerEvidenceSha256 =
      canonicalizeReaderSummaryWeeklyJson(row.providerEvidence).sha256;
    row.canonicalRecord = {
      ...(row.canonicalRecord as Record<string, unknown>),
      providerEvidence: row.providerEvidence,
      providerEvidenceSha256: row.providerEvidenceSha256,
    };
    recanonicalizeEvidenceRow(row);

    const adapter = authorityAdapter(new FakeAuthorityPrisma([row]));
    const authority = await adapter.load(query);
    const binding = adapter.readVerifiedBinding(authority!);

    expect(binding.evidence.map((item) => item.citationId)).toEqual([
      "citation-1",
    ]);
    expect(binding.evidence[0]?.observedAt).toBe(
      "2026-07-06T08:05:00.000Z",
    );
  });

  it("replays exact durable bytes without sharing mutable row state", async () => {
    const row = publicationRow();
    const adapter = authorityAdapter(new FakeAuthorityPrisma([row]));

    const firstAuthority = (await adapter.load(query))!;
    const replayAuthority = (await adapter.load(query))!;
    const first = adapter.readVerifiedBinding(firstAuthority);
    const replay = adapter.readVerifiedBinding(replayAuthority);

    expect(replayAuthority).not.toBe(firstAuthority);
    expect(replay).toEqual(first);
    expect(Object.isFrozen(firstAuthority)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.evidence)).toBe(true);
    expect(Object.isFrozen(first.evidence[0])).toBe(true);
  });

  it("reuses one stable story identity across days and weeks", async () => {
    const storyIdentity = reviewedStoryIdentity();
    const first = await observationInput(
      publicationRow("2026-07-05", 1),
      storyIdentity,
    );
    const later = await observationInput(
      publicationRow("2026-07-12", 2),
      storyIdentity,
    );

    const [firstObservation, laterObservation] =
      observeReaderSummaryWeeklyStories([first, later]);

    expect(firstObservation!.story.identity).toBe(storyIdentity.identity);
    expect(laterObservation!.story.identity).toBe(storyIdentity.identity);
    expect(laterObservation!.story.sha256).toBe(firstObservation!.story.sha256);
    expect(firstObservation!.observedUtcDate).toBe("2026-07-05");
    expect(laterObservation!.observedUtcDate).toBe("2026-07-12");
    expect(laterObservation!.uniquenessKey).not.toBe(
      firstObservation!.uniquenessKey,
    );
  });

  it("rejects the same story/date regardless of selected evidence subset", async () => {
    const input = await observationInput(publicationRow());
    const firstSubset = { ...input, evidence: [input.evidence[0]!] };
    const secondSubset = { ...input, evidence: [input.evidence[1]!] };
    const first = observeReaderSummaryWeeklyStory(firstSubset, []);
    const second = observeReaderSummaryWeeklyStory(secondSubset, []);

    expect(first.uniquenessKey).toBe(second.uniquenessKey);
    expect(first.identity).not.toBe(second.identity);
    expect(() =>
      observeReaderSummaryWeeklyStory(secondSubset, [first]),
    ).toThrow("already has an observation for the requested UTC date");
    expect(() =>
      observeReaderSummaryWeeklyStories([firstSubset, secondSubset]),
    ).toThrow("already has an observation for the requested UTC date");
  });

  it("rejects caller chronology and evidence timestamps", async () => {
    const input = await observationInput(publicationRow());
    expect(() =>
      observeReaderSummaryWeeklyStory(
        { ...input, firstSeen: "caller-authored" } as never,
        [],
      ),
    ).toThrow("must contain exactly");
    expect(() =>
      observeReaderSummaryWeeklyStory(
        {
          ...input,
          evidence: [
            { ...input.evidence[0]!, observedAt: "2026-07-05" },
          ],
        } as never,
        [],
      ),
    ).toThrow("must contain exactly");
  });

  it("rejects more than one result for the exact authority tuple", async () => {
    const row = publicationRow();
    const adapter = authorityAdapter(new FakeAuthorityPrisma([row, row]));

    await expect(adapter.load(query)).rejects.toThrow(
      "lookup was not unique",
    );
  });
});

type ProviderEvidence = ReaderSummaryWeeklyPublicationProviderEvidence;
type MutablePublicationRow = ReturnType<typeof publicationRow>;

type RawQueryCall = Readonly<{
  sql: string;
  values: readonly unknown[];
}>;

class FakeAuthorityPrisma {
  readonly calls: RawQueryCall[] = [];
  readonly sourceItems = sourceItemRows();

  constructor(
    private readonly rows: readonly MutablePublicationRow[],
  ) {}

  readonly $queryRaw = async <T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T> => {
    this.calls.push({ sql: strings.join("?"), values });
    return this.rows as T;
  };

  mutateSourceItemsAfterPublication(): void {
    for (const source of this.sourceItems) {
      source.title = "mutated after publication";
      source.body = "mutated source body";
      source.providerItemId = `${source.providerItemId}:mutated`;
      source.contentHash = "f".repeat(64);
    }
  }
}

const authorityAdapter = (
  prisma: FakeAuthorityPrisma,
): PrismaReaderSummaryWeeklyStoryAuthority =>
  new PrismaReaderSummaryWeeklyStoryAuthority(
    prisma as unknown as PrismaSummaryClient,
  );

const observationInput = async (
  row: MutablePublicationRow,
  storyIdentity = reviewedStoryIdentity(),
): Promise<ReaderSummaryWeeklyStoryObservationInput> => {
  const adapter = authorityAdapter(
    new FakeAuthorityPrisma([row]),
  );
  const authority = await adapter.load({
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    publicationId: row.publicationId,
  });
  if (authority === null) {
    throw new Error("Expected the fixture publication authority to load");
  }
  return {
    storyIdentity,
    authority: adapter.readVerifiedBinding(authority),
    evidence: row.providerEvidence.map((item) => ({
      providerKey: item.providerKey,
      citationId: item.citationId,
      sourceItemId: item.sourceItemId,
      sourceContentHash: item.sourceContentHash,
    })),
  };
};

const reviewedStoryIdentity = () =>
  deriveReaderSummaryWeeklyStoryIdentity({
    subjectKey: "product:openai/codex",
    actionKey: "action:release",
    objectKeys: ["capability:agent"],
    qualifierKeys: ["audience:developer"],
  });

const publicationRow = (
  requestedUtcDate = "2026-07-05",
  identitySuffix = 1,
) => {
  const providerEvidence = [
    providerEvidenceItem(
      requestedUtcDate,
      "hacker-news",
      "citation-1",
      "source-1",
      "a".repeat(64),
    ),
    providerEvidenceItem(
      requestedUtcDate,
      "rss",
      "citation-2",
      "source-2",
      "b".repeat(64),
    ),
  ];
  const artifactPayload = { qualityFlags: [] as string[] };
  const report: Record<string, unknown> = {
    schemaVersion: "reader_summary.publication_report.v1",
    artifactPayload,
    citations: providerEvidence.map((item) => ({
      id: item.citationId,
      sourceItemId: item.sourceItemId,
    })),
  };
  const exactProof = { publication: "exact" };
  const githubEvidence = historicalGitHubEvidence(requestedUtcDate);
  const publicationId = uuidWithSuffix("2", identitySuffix);
  const jobId = uuidWithSuffix("1", identitySuffix);
  const reportSha256 = canonicalizeReaderSummaryWeeklyJson(report).sha256;
  const proofSha256 =
    canonicalizeReaderSummaryWeeklyJson(exactProof).sha256;
  const artifactPayloadSha256 =
    canonicalizeReaderSummaryWeeklyJson(artifactPayload).sha256;
  const providerEvidenceSha256 =
    canonicalizeReaderSummaryWeeklyJson(providerEvidence).sha256;
  const period = readerSummaryWeeklyDailyPeriod(requestedUtcDate);
  const body = {
    schemaVersion: readerSummaryWeeklyPublicationEvidenceSchemaVersion,
    tenantId: query.tenantId,
    workspaceId: query.workspaceId,
    scope: { type: "workspace" as const },
    period,
    requestedUtcDate,
    publicationId,
    artifactId: publicationId,
    jobId,
    reportId: `reader-summary-report:${publicationId}`,
    proofId: `reader-summary-proof:${publicationId}`,
    semanticStatus: "COMPLETED" as const,
    reportSha256,
    proofSha256,
    artifactPayloadSha256,
    providerEvidenceSha256,
    providerEvidence,
    providerCounts: readerSummaryWeeklyCanonicalProviderKeys.map(
      (providerKey) => ({
        providerKey,
        count: providerEvidence.filter(
          (item) => item.providerKey === providerKey,
        ).length,
      }),
    ),
    githubEvidence,
    publishedAt: `${requestedUtcDate}T12:00:00.000Z`,
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(body);
  return {
    publicationId,
    tenantId: query.tenantId,
    workspaceId: query.workspaceId,
    scopeType: "workspace",
    scopeKey: "workspace",
    cadence: "daily",
    periodStartedAt: new Date(period.startedAt),
    periodEndedAt: new Date(period.endedAt),
    periodTimezone: "UTC",
    requestedUtcDate: new Date(`${requestedUtcDate}T00:00:00.000Z`),
    readerSummaryJobId: body.jobId,
    readerSummaryArtifactId: publicationId,
    reportId: body.reportId,
    proofId: body.proofId,
    semanticStatus: body.semanticStatus,
    report,
    reportSha256,
    exactProof,
    proofSha256,
    artifactPayloadSha256,
    providerEvidence,
    providerEvidenceSha256,
    githubEvidence,
    canonicalRecord: JSON.parse(canonical.json) as unknown,
    canonicalBytes: Buffer.from(canonical.toBytes()),
    canonicalSha256: canonical.sha256,
    identity:
      `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonical.sha256}`,
    recordedAt: new Date(body.publishedAt),
  };
};

const recanonicalizeEvidenceRow = (row: MutablePublicationRow): void => {
  const canonical = canonicalizeReaderSummaryWeeklyJson(row.canonicalRecord);
  row.canonicalRecord = JSON.parse(canonical.json) as unknown;
  row.canonicalBytes = Buffer.from(canonical.toBytes());
  row.canonicalSha256 = canonical.sha256;
  row.identity =
    `${readerSummaryWeeklyPublicationEvidenceSchemaVersion}:${canonical.sha256}`;
};

const resealCallerForgedBinding = (
  binding: ReaderSummaryWeeklyStoryAuthorityBinding,
): ReaderSummaryWeeklyStoryAuthorityBinding => {
  const body = {
    ...Object.fromEntries(
      Object.entries(binding).filter(
        ([key]) => key !== "identity" && key !== "sha256",
      ),
    ),
    artifactPayloadSha256: "f".repeat(64),
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(body);
  return {
    ...body,
    identity:
      `${readerSummaryWeeklyStoryAuthoritySchemaVersion}:${canonical.sha256}`,
    sha256: canonical.sha256,
  } as ReaderSummaryWeeklyStoryAuthorityBinding;
};

const providerEvidenceItem = (
  requestedUtcDate: string,
  providerKey: ProviderEvidence["providerKey"],
  citationId: string,
  sourceItemId: string,
  sourceContentHash: string,
): ProviderEvidence => ({
  citationId,
  citationField: "canonicalUrl",
  feedItemId: `feed-${citationId}`,
  sourceItemId,
  sourceBindingId: `binding-${citationId}`,
  providerKey,
  providerItemId: `provider-${citationId}`,
  canonicalUrl: `https://example.test/${citationId}`,
  title: "Persisted source title",
  sourceText: "Persisted factual source preview.",
  publishedAt: `${requestedUtcDate}T08:00:00.000Z`,
  observedAt: `${requestedUtcDate}T08:05:00.000Z`,
  sourceContentHash,
});

const sourceItemRows = () => [
  {
    id: "source-1",
    title: "Persisted source title",
    body: "Persisted factual source preview.",
    providerItemId: "provider-citation-1",
    contentHash: "a".repeat(64),
  },
  {
    id: "source-2",
    title: "Persisted source title",
    body: "Persisted factual source preview.",
    providerItemId: "provider-citation-2",
    contentHash: "b".repeat(64),
  },
];

const historicalGitHubEvidence = (requestedUtcDay: string) => {
  const authorizedAt = new Date(
    Date.parse(`${requestedUtcDay}T00:00:00.000Z`) + 86_400_000,
  ).toISOString();
  const body = {
    schemaVersion:
      readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
    mode: "historical_unavailable" as const,
    requestedUtcDay,
    providerKey: "github-trending-page" as const,
    scanJobId: null,
    sourceBindingId: null,
    evidenceCount: 0,
    historicalUnavailableReason:
      "Authorized source snapshot is unavailable for this historical day.",
    authorizedAt,
    sourceProviderContentHash: null,
    repositories: [],
  };
  return {
    ...body,
    sha256: canonicalizeReaderSummaryWeeklyJson(body).sha256,
  };
};

const query: LoadReaderSummaryWeeklyStoryAuthorityQuery = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  publicationId: "20000000-0000-4000-8000-000000000001",
};

const uuidWithSuffix = (prefix: string, suffix: number): string =>
  `${prefix}0000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
