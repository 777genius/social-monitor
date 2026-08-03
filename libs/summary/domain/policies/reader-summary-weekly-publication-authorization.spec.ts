import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyDailyPeriod,
} from "../value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyDailyCertificationSchemaVersion,
  readerSummaryWeeklyDailyArtifactSchemaVersion,
  readerSummaryWeeklyDailyProofSchemaVersion,
  readerSummaryWeeklyDailyReportSchemaVersion,
  readerSummaryWeeklyProviderSourceEvidenceSchemaVersion,
  readerSummaryWeeklyRequiredDailyBlockingGateNames,
  type ReaderSummaryWeeklyCanonicalProviderKey,
  type ReaderSummaryWeeklyDailyCertificationEvidenceInput,
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
  readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
  sealReaderSummaryWeeklyInputManifest,
  type ReaderSummaryWeeklyInputManifestEvidence,
} from "../value-objects/reader-summary-weekly-input-manifest";
import {
  deriveReaderSummaryWeeklyPublicationEvidence,
} from "../value-objects/reader-summary-weekly-publication-evidence";
import {
  readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
  type ReaderSummaryWeeklyPublicationGitHubEvidence,
} from "../value-objects/reader-summary-weekly-publication-github-evidence";
import {
  readerSummaryWeeklyStoryAuthoritySchemaVersion,
  type ReaderSummaryWeeklyStoryAuthorityBinding,
  type ReaderSummaryWeeklyStoryAuthorityEvidence,
} from "../value-objects/reader-summary-weekly-story-authority";
import {
  readerSummaryWeeklyModelInputSchemaVersion,
  readerSummaryWeeklyModelOutputSchemaVersion,
  sealReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import type {
  ReaderSummaryWeeklyStoryAuthorityHandle,
  ReaderSummaryWeeklyStoryAuthorityPort,
} from "../../ports/reader-summary-weekly-story-authority.port";
import { ReaderSummaryWeeklyArtifact } from "../entities/reader-summary-weekly-artifact";
import {
  authorizeReaderSummaryWeeklyPublication,
  readReaderSummaryWeeklyPublicationAuthorization,
  type ReaderSummaryWeeklyPublicationAuthorization,
} from "./reader-summary-weekly-publication-authorization";

const dates = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
] as const;
const selectedDays = [0, 2, 4, 6] as const;
const selectedProviders = [
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const;

describe("reader summary weekly publication authorization", () => {
  it("issues an opaque authorization for exact sealed DB authority", () => {
    const fixture = weeklyFixture();
    const authorization = authorize(fixture);
    const details =
      readReaderSummaryWeeklyPublicationAuthorization(authorization);

    expect(Object.keys(authorization)).toEqual([]);
    expect(details).toMatchObject({
      artifactId: "weekly-artifact-2026-07-20",
      qualitySignals: {
        kind: "weekly",
        editorialQuality: {
          publicationDecision: "allow",
          blockingPassed: true,
        },
      },
      proof: {
        weekStartedOn: dates[0],
        weekEndedOn: dates[6],
        authorities: expect.any(Array),
        citations: expect.any(Array),
      },
    });
    expect(details.proof.authorities).toHaveLength(7);
    expect(details.proof.citations).toHaveLength(4);
    expect(fixture.command.modelInput.sealSha).toBe(
      "1354000809f6c009778b529c10c46bc5929ce86ae756b271b0290731e142dacf",
    );
    expect(
      fixture.command.modelInput.days.every(
        (day) => !("githubAuthorizationIdentity" in day),
      ),
    ).toBe(true);
    expect(
      canonicalizeReaderSummaryWeeklyJson(fixture.command.modelInput).json,
    ).not.toContain('"githubAuthorizationIdentity":null');
    expect(new Set(details.proof.citations.map((item) => item.citationId))).toEqual(
      new Set(["citation:01", "citation:02", "citation:03", "citation:04"]),
    );
  });

  it("fails closed for missing, duplicate, or out-of-week authorities", () => {
    const fixture = weeklyFixture();
    const missing = fixture.handles.slice(0, 6);
    const duplicate = [...fixture.handles.slice(0, 6), fixture.handles[0]!];
    const outOfWeek = [...fixture.handles.slice(0, 6), opaqueHandle()];
    fixture.port.bind(
      outOfWeek[6]!,
      resealAuthority({
        ...fixture.bindings[6]!,
        requestedUtcDate: "2026-07-27",
        evidence: fixture.bindings[6]!.evidence.map((item) => ({
          ...item,
          observedAt: "2026-07-27T20:00:00.000Z",
        })),
      }),
    );

    for (const handles of [missing, duplicate, outOfWeek]) {
      expect(() =>
        authorizeReaderSummaryWeeklyPublication(
          { ...fixture.command, dailyAuthorityHandles: handles },
          fixture.port,
        ),
      ).toThrow();
    }
  });

  it("rejects a mismatched manifest seal and non-1:1 citations", () => {
    const fixture = weeklyFixture();
    const wrongManifest = {
      ...fixture.command.manifest,
      sha256: "f".repeat(64),
    };
    expect(() =>
      authorizeReaderSummaryWeeklyPublication(
        { ...fixture.command, manifest: wrongManifest },
        fixture.port,
      ),
    ).toThrow();

    const binding = fixture.bindings[0]!;
    const citationMismatch = resealAuthority({
      ...binding,
      evidence: binding.evidence.map((item) =>
        item.citationId === "citation:01"
          ? { ...item, sourceContentHash: "e".repeat(64) }
          : item,
      ),
    });
    fixture.port.bind(fixture.handles[0]!, citationMismatch);
    expect(() => authorize(fixture)).toThrow("1:1 DB authority");
  });

  it("rejects a missing or forged weekly GitHub board", () => {
    const fixture = weeklyFixture();
    const binding = fixture.bindings[3]!;
    const withoutGitHub = resealAuthority({
      ...binding,
      evidence: binding.evidence.filter(
        (item) => item.providerKey !== "github-trending-page",
      ),
    });
    fixture.port.bind(fixture.handles[3]!, withoutGitHub);

    expect(() => authorize(fixture)).toThrow();
  });

  it("authorizes sealed July 23 history without calling it verified", () => {
    const fixture = weeklyFixture(true);
    const authorization = authorize(fixture);
    const details =
      readReaderSummaryWeeklyPublicationAuthorization(authorization);
    const modelDay = fixture.command.modelInput.days[3]!;

    expect(modelDay).toMatchObject({
      date: "2026-07-23",
      githubBoardStatus: "historical_unavailable",
      githubAuthorizationIdentity:
        readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
      providerCounts: expect.arrayContaining([
        { providerKey: "github-trending-page", count: 0 },
      ]),
    });
    expect(modelDay.dailyCertificationId).toBe(
      `${readerSummaryWeeklyDailyCertificationSchemaVersion}:${modelDay.dailyCertificationSha}`,
    );
    expect(details.proof.authorities[3]!.githubBoardIdentity).toBe(
      modelDay.githubBoardId,
    );
  });

  it("never authorizes a GitHub citation from historical evidence", () => {
    const fixture = weeklyFixture(true);
    const day = fixture.command.manifest.days[3]!;

    expect(() =>
      sealReaderSummaryWeeklyModelInput({
        manifest: fixture.command.manifest,
        stories: [{ storyId: "story:forged", label: "Forged history" }],
        observations: [{
          observationId: "observation:forged",
          storyId: "story:forged",
          observedOn: day.requestedUtcDate,
          providerKey: "github-trending-page",
          text: "A forged historical GitHub observation.",
          claimSupport: ["snapshot"],
          citationIds: ["citation:forged"],
          dailyCertificationId: day.dailyCertification.identity,
          dailyCertificationSha: day.dailyCertification.sha256,
          sourceSha256: "f".repeat(64),
        }],
        citations: [{
          citationId: "citation:forged",
          observationId: "observation:forged",
          storyId: "story:forged",
          observedOn: day.requestedUtcDate,
          providerKey: "github-trending-page",
          title: "Forged GitHub citation",
          canonicalUrl: "https://github.com/forged/repository",
          dailyCertificationId: day.dailyCertification.identity,
          dailyCertificationSha: day.dailyCertification.sha256,
          sourceSha256: "f".repeat(64),
        }],
      }),
    ).toThrow("not certified");
  });

  it("rejects model days that diverge from manifest history or authorization", () => {
    const fixture = weeklyFixture(true);
    const statusMismatch = resealModelInput(
      fixture.command.modelInput,
      (body) => {
        const days = body.days as Record<string, unknown>[];
        const day = days[3]!;
        day.githubBoardStatus = "verified";
        day.githubBoardId = "forged-verified-board";
        delete day.githubAuthorizationIdentity;
        const counts = day.providerCounts as Record<string, unknown>[];
        counts[0]!.count = 10;
      },
    );
    expect(() =>
      authorizeReaderSummaryWeeklyPublication(
        commandForModelInput(fixture, statusMismatch),
        fixture.port,
      ),
    ).toThrow("model day does not match the manifest");

    const authorizationMismatch = resealModelInput(
      fixture.command.modelInput,
      (body) => {
        const days = body.days as Record<string, unknown>[];
        days[3]!.githubAuthorizationIdentity =
          "reader_summary.production_recovery.github.2026-07-23.v1";
      },
    );
    expect(() =>
      authorizeReaderSummaryWeeklyPublication(
        {
          ...fixture.command,
          modelInput: authorizationMismatch,
        },
        fixture.port,
      ),
    ).toThrow("GitHub authority is invalid");
  });

  it("rejects concatenated daily prose through truthful editorial quality", () => {
    const fixture = weeklyFixture();
    const output = {
      ...fixture.output,
      synthesis:
        "Monday: controls appeared. Tuesday: controls changed. Wednesday: the daily summary continued.",
    };

    expect(() =>
      ReaderSummaryWeeklyArtifact.create({
        input: fixture.command.modelInput,
        output,
      }),
    ).toThrow("blocked");
  });

  it("rejects caller-forged authorization values", () => {
    expect(() =>
      readReaderSummaryWeeklyPublicationAuthorization(
        Object.freeze({}) as ReaderSummaryWeeklyPublicationAuthorization,
      ),
    ).toThrow("forged or unavailable");
  });
});

const authorize = (fixture: ReturnType<typeof weeklyFixture>) =>
  authorizeReaderSummaryWeeklyPublication(fixture.command, fixture.port);

const commandForModelInput = (
  fixture: ReturnType<typeof weeklyFixture>,
  modelInput: ReaderSummaryWeeklyModelInput,
) => {
  const output = {
    ...fixture.output,
    sealId: modelInput.sealId,
    sealSha: modelInput.sealSha,
  };
  return {
    ...fixture.command,
    modelInput,
    artifact: ReaderSummaryWeeklyArtifact.create({ input: modelInput, output }),
  };
};

const resealModelInput = (
  input: ReaderSummaryWeeklyModelInput,
  mutateBody: (body: Record<string, unknown>) => void,
): ReaderSummaryWeeklyModelInput => {
  const {
    sealId: _sealId,
    sealSha: _sealSha,
    ...sourceBody
  } = input;
  void _sealId;
  void _sealSha;
  const body = JSON.parse(
    canonicalizeReaderSummaryWeeklyJson(sourceBody).json,
  ) as Record<string, unknown>;
  mutateBody(body);
  const sealSha = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    sealId: `${readerSummaryWeeklyModelInputSchemaVersion}:${sealSha}`,
    sealSha,
  } as ReaderSummaryWeeklyModelInput;
};

const weeklyFixture = (historical = false) => {
  const manifest = sealReaderSummaryWeeklyInputManifest(
    manifestEvidence(historical),
  );
  const port = new FakeAuthorityPort();
  const bindings = manifest.days.map((day, index) =>
    authorityBinding(day, index),
  );
  const handles = bindings.map((binding) => {
    const handle = opaqueHandle();
    port.bind(handle, binding);
    return handle;
  });
  const modelInput = weeklyModelInput(manifest, bindings);
  const output = weeklyOutput(modelInput);
  const artifact = ReaderSummaryWeeklyArtifact.create({
    input: modelInput,
    output,
  });
  return {
    port,
    handles,
    bindings,
    output,
    command: {
      artifactId: "weekly-artifact-2026-07-20",
      artifact,
      modelInput,
      manifest,
      dailyAuthorityHandles: handles,
    },
  };
};

class FakeAuthorityPort
  implements Pick<ReaderSummaryWeeklyStoryAuthorityPort, "readVerifiedBinding">
{
  private readonly values = new WeakMap<
    object,
    ReaderSummaryWeeklyStoryAuthorityBinding
  >();

  bind(
    handle: ReaderSummaryWeeklyStoryAuthorityHandle,
    binding: ReaderSummaryWeeklyStoryAuthorityBinding,
  ): void {
    this.values.set(handle as object, binding);
  }

  readVerifiedBinding(
    handle: ReaderSummaryWeeklyStoryAuthorityHandle,
  ): ReaderSummaryWeeklyStoryAuthorityBinding {
    const binding = this.values.get(handle as object);
    if (binding === undefined) {
      throw new Error("authority was not DB loaded");
    }
    return binding;
  }
}

const opaqueHandle = (): ReaderSummaryWeeklyStoryAuthorityHandle =>
  Object.freeze({}) as ReaderSummaryWeeklyStoryAuthorityHandle;

const manifestEvidence = (
  historical = false,
): ReaderSummaryWeeklyInputManifestEvidence => ({
  weekStartedUtcDate: dates[0],
  tenantId: "tenant-weekly",
  workspaceId: "workspace-weekly",
  scope: { type: "workspace" },
  days: dates.map((date, index) => {
    if (historical && date === "2026-07-23") {
      const publicationEvidence = historicalPublicationEvidence();
      return {
        historicalPublicationEvidence: publicationEvidence,
        historicalDailyCertification:
          historicalDailyCertification(publicationEvidence),
        authorizationIdentity:
          readerSummaryWeeklyHistoricalGitHubAuthorizationIdentity,
      };
    }
    const githubAuditEvidence = githubEvidence(date, index);
    const audit = certifyReaderSummaryWeeklyGitHubAudit(githubAuditEvidence);
    return {
      githubAuditEvidence,
      dailyCertificationEvidence: dailyEvidence(date, index, audit),
    };
  }),
});

const historicalPublicationEvidence = () => {
  const date = "2026-07-23";
  const githubBody = {
    schemaVersion: readerSummaryWeeklyPublicationGitHubEvidenceSchemaVersion,
    mode: "historical_unavailable" as const,
    requestedUtcDay: date,
    providerKey: "github-trending-page" as const,
    scanJobId: null,
    sourceBindingId: null,
    evidenceCount: 0,
    historicalUnavailableReason:
      "Persisted recovery records that GitHub evidence is unavailable.",
    authorizedAt: "2026-07-29T12:00:00.000Z",
    sourceProviderContentHash: null,
    repositories: [],
  };
  const githubEvidence: ReaderSummaryWeeklyPublicationGitHubEvidence = {
    ...githubBody,
    sha256: canonicalizeReaderSummaryWeeklyJson(githubBody).sha256,
  };
  const publicationId = `publication-${date}`;
  const evidence = deriveReaderSummaryWeeklyPublicationEvidence({
    tenantId: "tenant-weekly",
    workspaceId: "workspace-weekly",
    scope: { type: "workspace" },
    period: readerSummaryWeeklyDailyPeriod(date),
    requestedUtcDate: date,
    publicationId,
    artifactId: publicationId,
    jobId: `job-${date}`,
    semanticStatus: "COMPLETED",
    report: { status: "COMPLETED" },
    exactProof: { status: "exact" },
    artifactPayload: { qualityFlags: [] },
    providerEvidence: [{
      providerKey: "hacker-news",
      citationId: "historical-hn-citation",
      citationField: "bodyPreview",
      feedItemId: "historical-hn-feed",
      sourceItemId: "historical-hn-source",
      sourceBindingId: "historical-hn-binding",
      providerItemId: "historical-hn-item",
      canonicalUrl: "https://example.test/historical-hn",
      title: "Historical non-GitHub source",
      sourceText: "Persisted source evidence.",
      publishedAt: `${date}T17:00:00.000Z`,
      observedAt: `${date}T20:00:00.000Z`,
      sourceContentHash: "b".repeat(64),
    }],
    githubEvidence,
    publishedAt: "2026-07-29T12:05:00.000Z",
  });
  const {
    canonicalJson: _canonicalJson,
    byteLength: _byteLength,
    toBytes: _toBytes,
    ...persisted
  } = evidence;
  void _canonicalJson;
  void _byteLength;
  void _toBytes;
  return persisted;
};

const historicalDailyCertification = (
  authority: ReturnType<typeof historicalPublicationEvidence>,
) => {
  const body = {
    schemaVersion: readerSummaryWeeklyDailyCertificationSchemaVersion,
    status: "certified" as const, blockingPassed: true as const,
    requestedUtcDate: "2026-07-23" as const,
    tenantId: authority.tenantId, workspaceId: authority.workspaceId,
    scope: JSON.parse(canonicalizeReaderSummaryWeeklyJson(authority.scope).json),
    publicationId: authority.publicationId,
    artifactId: authority.artifactId, jobId: authority.jobId,
    reportId: authority.reportId, proofId: authority.proofId,
    reportSha256: authority.reportSha256,
    exactProofSha256: authority.proofSha256,
    artifactPayloadSha256: authority.artifactPayloadSha256,
    providerCounts: JSON.parse(
      canonicalizeReaderSummaryWeeklyJson(authority.providerCounts).json),
    githubAuditSha256: authority.githubEvidence.sha256,
  };
  const sha256 = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    identity: `${readerSummaryWeeklyDailyCertificationSchemaVersion}:${sha256}`,
    sha256,
  };
};

const githubEvidence = (
  date: string,
  dayIndex: number,
): ReaderSummaryWeeklyGitHubAuditEvidenceInput => {
  const authority = {
    requestedUtcDay: date,
    scanJobId: `github-scan-${date}`,
    providerKey: readerSummaryWeeklyGitHubProviderKey,
    kind: readerSummaryWeeklyGitHubEvidenceKind,
    sourceBindingId: `github-binding-${date}`,
    fetchStartedAt: `${date}T20:00:00.000Z`,
    checkedAt: `${date}T21:00:00.000Z`,
    observedAt: `${date}T21:01:00.000Z`,
  };
  return {
    ...authority,
    repositories: Array.from({ length: 10 }, (_, index) => ({
      ...authority,
      publishedAt: `${date}T20:${String(index).padStart(2, "0")}:00.000Z`,
      rank: index + 1,
      canonicalUrl: `https://github.com/owner-${dayIndex}/repo-${index + 1}`,
      sourceEvidence: {
        heading: `owner-${dayIndex}/repo-${index + 1}`,
        description: `Repository evidence ${dayIndex}-${index + 1}`,
        primaryLanguage: "TypeScript",
        starsToday: 100 - index,
        totalStars: 1_000 + index,
        forks: 100 + index,
      },
    })),
  };
};

const dailyEvidence = (
  date: string,
  dayIndex: number,
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): ReaderSummaryWeeklyDailyCertificationEvidenceInput => {
  const publicationId = `publication-${date}`;
  const authority = {
    requestedUtcDate: date,
    tenantId: "tenant-weekly",
    workspaceId: "workspace-weekly",
    scope: { type: "workspace" as const },
    publicationId,
    artifactId: publicationId,
    jobId: `job-${date}`,
    reportId: `reader-summary-report:${publicationId}`,
    proofId: `reader-summary-proof:${publicationId}`,
  };
  const githubBinding = githubBindingFor(audit);
  const generic = genericSource(date, dayIndex);
  const artifactPayload = {
    schemaVersion: readerSummaryWeeklyDailyArtifactSchemaVersion,
    ...authority,
    scope: { type: "workspace" as const },
    period: readerSummaryWeeklyDailyPeriod(date),
    githubBinding: { ...githubBinding },
    providerEvidence: [
      ...audit.repositories.map((repository, index) => ({
        evidenceId: `github-${date}-${index + 1}`,
        providerKey: readerSummaryWeeklyGitHubProviderKey,
        sourceBindingId: audit.sourceBindingId,
        repositoryIdentity: repository.repositoryIdentity,
      })),
      ...(generic === undefined
        ? []
        : [
            {
              evidenceId: `generic-${date}`,
              providerKey: generic.providerKey,
              sourceBindingId: generic.sourceBindingId,
              sourceEvidence: generic.sourceEvidence,
            },
          ]),
    ],
  };
  const artifactSha256 =
    canonicalizeReaderSummaryWeeklyJson(artifactPayload).sha256;
  const providerCounts = providerCountsFor(generic?.providerKey);
  const reportPayload = {
    schemaVersion: readerSummaryWeeklyDailyReportSchemaVersion,
    requestedUtcDate: date,
    tenantId: authority.tenantId,
    workspaceId: authority.workspaceId,
    scope: { type: "workspace" as const },
    period: readerSummaryWeeklyDailyPeriod(date),
    publicationId,
    reportId: authority.reportId,
    artifactBinding: {
      artifactId: authority.artifactId,
      jobId: authority.jobId,
      proofId: authority.proofId,
      artifactSha256,
    },
    githubBinding: { ...githubBinding },
    providerCounts: { ...providerCounts },
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
  return {
    ...authority,
    reportPayload,
    exactProof: {
      schemaVersion: readerSummaryWeeklyDailyProofSchemaVersion,
      ...authority,
      scope: { type: "workspace" as const },
      period: readerSummaryWeeklyDailyPeriod(date),
      reportSha256:
        canonicalizeReaderSummaryWeeklyJson(reportPayload).sha256,
      artifactSha256,
      githubBinding: { ...githubBinding },
      providerCounts: { ...providerCounts },
      blockingGateNames: [...readerSummaryWeeklyRequiredDailyBlockingGateNames],
    },
    artifactPayload,
  };
};

const githubBindingFor = (
  audit: ReaderSummaryWeeklyCanonicalGitHubAudit,
): ReaderSummaryWeeklyGitHubBindingInput => ({
  requestedUtcDay: audit.requestedUtcDay,
  scanJobId: audit.scanJobId,
  providerKey: audit.providerKey,
  kind: audit.kind,
  sourceBindingId: audit.sourceBindingId,
});

const genericSource = (date: string, dayIndex: number) => {
  const selectedIndex = selectedDays.indexOf(
    dayIndex as (typeof selectedDays)[number],
  );
  if (selectedIndex < 0) {
    return undefined;
  }
  const providerKey = selectedProviders[selectedIndex]!;
  return {
    providerKey,
    sourceBindingId: `${providerKey}-binding-${date}`,
    sourceEvidence: {
      sourceRecordId: `${providerKey}-source-${date}`,
      observedAt: `${date}T18:00:00.000Z`,
      title: `Grounded source ${selectedIndex + 1}`,
      content: `Sealed source content ${selectedIndex + 1}`,
    },
  };
};

const providerCountsFor = (
  selected?: ReaderSummaryWeeklyCanonicalProviderKey,
): ReaderSummaryWeeklyProviderCountsInput => ({
  "github-trending-page": 10,
  "hacker-news": selected === "hacker-news" ? 1 : 0,
  reddit: selected === "reddit" ? 1 : 0,
  rss: selected === "rss" ? 1 : 0,
  "x-twitter": selected === "x-twitter" ? 1 : 0,
});

const authorityBinding = (
  day: ReturnType<typeof sealReaderSummaryWeeklyInputManifest>["days"][number],
  dayIndex: number,
): ReaderSummaryWeeklyStoryAuthorityBinding => {
  const certification = day.dailyCertification;
  if ("historicalAuthority" in day) {
    return resealAuthority({
      schemaVersion: readerSummaryWeeklyStoryAuthoritySchemaVersion,
      tenantId: certification.tenantId,
      workspaceId: certification.workspaceId,
      scope: certification.scope,
      requestedUtcDate: certification.requestedUtcDate,
      publicationId: certification.publicationId,
      artifactId: certification.artifactId,
      jobId: certification.jobId,
      reportId: certification.reportId,
      proofId: certification.proofId,
      publicationEvidenceIdentity: day.historicalAuthority.identity,
      publicationEvidenceSha256: day.historicalAuthority.sha256,
      reportSha256: certification.reportSha256,
      proofSha256: certification.exactProofSha256,
      artifactPayloadSha256: certification.artifactPayloadSha256,
      providerEvidenceSha256:
        day.historicalAuthority.providerEvidenceSha256,
      githubEvidenceSha256: day.githubAudit.sha256,
      semanticStatus: "COMPLETED",
      publishedAt: day.historicalAuthority.publishedAt,
      evidence: day.historicalAuthority.providerEvidence.map((item) => ({
        providerKey: item.providerKey,
        citationId: item.citationId,
        citationField: item.citationField,
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        sourceBindingId: item.sourceBindingId,
        providerItemId: item.providerItemId,
        canonicalUrl: item.canonicalUrl,
        sourceContentHash: item.sourceContentHash,
        publishedAt: item.publishedAt,
        observedAt: item.observedAt,
      })),
      identity: "",
      sha256: "",
    });
  }
  const githubEvidence = day.githubAudit.repositories.map((repository, index) =>
    authorityEvidence({
      providerKey: "github-trending-page",
      citationId: `github:${day.requestedUtcDate}:${index + 1}`,
      sourceBindingId: day.githubAudit.sourceBindingId,
      providerItemId: repository.repositoryIdentity,
      canonicalUrl: repository.canonicalUrl,
      sourceContentHash: repository.sourceContentHash,
      requestedUtcDate: day.requestedUtcDate,
      number: index + 1,
    }),
  );
  const generic = genericSource(day.requestedUtcDate, dayIndex);
  const selectedIndex = selectedDays.indexOf(
    dayIndex as (typeof selectedDays)[number],
  );
  const genericEvidence =
    generic === undefined
      ? []
      : [
          authorityEvidence({
            providerKey: generic.providerKey,
            citationId: `citation:0${selectedIndex + 1}`,
            sourceBindingId: generic.sourceBindingId,
            providerItemId: generic.sourceEvidence.sourceRecordId,
            canonicalUrl:
              `https://example.test/source-${selectedIndex + 1}`,
            sourceContentHash: genericSourceHash(generic),
            requestedUtcDate: day.requestedUtcDate,
            number: 11,
          }),
        ];
  const evidence = [...githubEvidence, ...genericEvidence];
  const githubEvidenceSha256 = githubPublicationEvidenceSha(day, githubEvidence);
  return resealAuthority({
    schemaVersion: readerSummaryWeeklyStoryAuthoritySchemaVersion,
    tenantId: certification.tenantId,
    workspaceId: certification.workspaceId,
    scope: certification.scope,
    requestedUtcDate: certification.requestedUtcDate,
    publicationId: certification.publicationId,
    artifactId: certification.artifactId,
    jobId: certification.jobId,
    reportId: certification.reportId,
    proofId: certification.proofId,
    publicationEvidenceIdentity:
      `reader_summary.weekly_publication_evidence.v1:${String(dayIndex + 1).repeat(64)}`,
    publicationEvidenceSha256: String(dayIndex + 1).repeat(64),
    reportSha256: certification.reportSha256,
    proofSha256: certification.exactProofSha256,
    artifactPayloadSha256: certification.artifactPayloadSha256,
    providerEvidenceSha256: "a".repeat(64),
    githubEvidenceSha256,
    semanticStatus: "COMPLETED",
    publishedAt: `${day.requestedUtcDate}T22:00:00.000Z`,
    evidence,
    identity: "",
    sha256: "",
  });
};

const authorityEvidence = (input: {
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
  citationId: string;
  sourceBindingId: string;
  providerItemId: string;
  canonicalUrl: string;
  sourceContentHash: string;
  requestedUtcDate: string;
  number: number;
}): ReaderSummaryWeeklyStoryAuthorityEvidence => ({
  providerKey: input.providerKey,
  citationId: input.citationId,
  citationField: "bodyPreview",
  feedItemId:
    `feed-${input.requestedUtcDate}-${String(input.number).padStart(2, "0")}`,
  sourceItemId:
    `source-${input.requestedUtcDate}-${String(input.number).padStart(2, "0")}`,
  sourceBindingId: input.sourceBindingId,
  providerItemId: input.providerItemId,
  canonicalUrl: input.canonicalUrl,
  sourceContentHash: input.sourceContentHash,
  publishedAt: `${input.requestedUtcDate}T17:00:00.000Z`,
  observedAt: `${input.requestedUtcDate}T20:00:00.000Z`,
});

const githubPublicationEvidenceSha = (
  day: ReturnType<typeof sealReaderSummaryWeeklyInputManifest>["days"][number],
  evidence: readonly ReaderSummaryWeeklyStoryAuthorityEvidence[],
): string =>
  canonicalizeReaderSummaryWeeklyJson({
    schemaVersion: "reader_summary.weekly_publication_github_evidence.v1",
    mode: "verified",
    requestedUtcDay: day.requestedUtcDate,
    providerKey: "github-trending-page",
    scanJobId: day.githubAudit.scanJobId,
    sourceBindingId: day.githubAudit.sourceBindingId,
    evidenceCount: 10,
    historicalUnavailableReason: null,
    authorizedAt: null,
    sourceProviderContentHash: day.githubAudit.sourceProviderContentHash,
    repositories: day.githubAudit.repositories.map((repository, index) => ({
      rank: repository.rank,
      citationId: evidence[index]!.citationId,
      feedItemId: evidence[index]!.feedItemId,
      sourceItemId: evidence[index]!.sourceItemId,
      repositoryIdentity: repository.repositoryIdentity,
      canonicalUrl: repository.canonicalUrl,
      sourceContentHash: repository.sourceContentHash,
      sourceProviderContentHash: repository.sourceProviderContentHash,
    })),
  }).sha256;

const genericSourceHash = (
  source: NonNullable<ReturnType<typeof genericSource>>,
): string =>
  canonicalizeReaderSummaryWeeklyJson({
    schemaVersion: readerSummaryWeeklyProviderSourceEvidenceSchemaVersion,
    providerKey: source.providerKey,
    sourceBindingId: source.sourceBindingId,
    ...source.sourceEvidence,
  }).sha256;

const resealAuthority = (
  input: ReaderSummaryWeeklyStoryAuthorityBinding,
): ReaderSummaryWeeklyStoryAuthorityBinding => {
  const { identity: _identity, sha256: _sha256, ...body } = input;
  void _identity;
  void _sha256;
  const sha256 = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    identity: `${readerSummaryWeeklyStoryAuthoritySchemaVersion}:${sha256}`,
    sha256,
  };
};

const weeklyModelInput = (
  manifest: ReturnType<typeof sealReaderSummaryWeeklyInputManifest>,
  bindings: readonly ReaderSummaryWeeklyStoryAuthorityBinding[],
): ReaderSummaryWeeklyModelInput => {
  const observations = selectedDays.map((dayIndex, index) => {
    const day = manifest.days[dayIndex]!;
    const evidence = bindings[dayIndex]!.evidence.find(
      (item) => item.citationId === `citation:0${index + 1}`,
    )!;
    return {
      observationId: `observation:0${index + 1}`,
      storyId: index < 2 ? "story:alpha" : "story:beta",
      observedOn: day.requestedUtcDate,
      providerKey: evidence.providerKey,
      text: `Sealed observation ${index + 1} supplies grounded context.`,
      claimSupport:
        index === 1
          ? (["snapshot", "evolution"] as const)
          : (["snapshot"] as const),
      citationIds: [evidence.citationId],
      dailyCertificationId: day.dailyCertification.identity,
      dailyCertificationSha: day.dailyCertification.sha256,
      sourceSha256: evidence.sourceContentHash,
    };
  });
  return sealReaderSummaryWeeklyModelInput({
    manifest,
    stories: [
      { storyId: "story:alpha", label: "Agent safety controls" },
      { storyId: "story:beta", label: "Release questions" },
    ],
    observations,
    citations: observations.map((observation, index) => {
      const evidence = bindings[selectedDays[index]!]!.evidence.find(
        (item) => item.citationId === observation.citationIds[0],
      )!;
      return {
        citationId: evidence.citationId,
        observationId: observation.observationId,
        storyId: observation.storyId,
        observedOn: observation.observedOn,
        providerKey: evidence.providerKey,
        title: `Grounded source ${index + 1}`,
        canonicalUrl: evidence.canonicalUrl,
        dailyCertificationId: observation.dailyCertificationId,
        dailyCertificationSha: observation.dailyCertificationSha,
        sourceSha256: observation.sourceSha256,
      };
    }),
  });
};

const weeklyOutput = (
  input: ReaderSummaryWeeklyModelInput,
): ReaderSummaryWeeklyModelOutput => ({
  schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
  sealId: input.sealId,
  sealSha: input.sealSha,
  weekStartedOn: dates[0],
  weekEndedOn: dates[6],
  headline: "Agent safeguards reached teams while release questions stayed open",
  headlineCitationIds: ["citation:01", "citation:02", "citation:03", "citation:04"],
  takeaway:
    "Practical safety controls mattered most, while release details remained open.",
  takeawayCitationIds: ["citation:01", "citation:02", "citation:03"],
  synthesis:
    "Across the week, teams put agent safety controls into practice while separate release questions remained open. The combined record shows concrete adoption without turning incomplete release discussion into a claimed outcome.",
  synthesisCitationIds: ["citation:01", "citation:02", "citation:03", "citation:04"],
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
