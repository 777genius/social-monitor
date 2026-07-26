import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyDailyPeriod,
  readerSummaryWeeklySha256,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyDailyArtifactSchemaVersion,
  readerSummaryWeeklyDailyCertificationSchemaVersion,
  readerSummaryWeeklyDailyProofSchemaVersion,
  readerSummaryWeeklyDailyReportSchemaVersion,
  readerSummaryWeeklyRequiredDailyBlockingGateNames,
  type ReaderSummaryWeeklyDailyArtifactPayloadInput,
  type ReaderSummaryWeeklyDailyCertificationEvidenceInput,
  type ReaderSummaryWeeklyDailyExactProofInput,
  type ReaderSummaryWeeklyDailyReportPayloadInput,
  type ReaderSummaryWeeklyGitHubBindingInput,
  type ReaderSummaryWeeklyProviderCountsInput,
} from "./reader-summary-weekly-daily-certification";
import {
  certifyReaderSummaryWeeklyGitHubAudit,
  readerSummaryWeeklyGitHubEvidenceKind,
  readerSummaryWeeklyGitHubProviderKey,
  type ReaderSummaryWeeklyCanonicalGitHubAudit,
  type ReaderSummaryWeeklyGitHubAuditEvidenceInput,
} from "./reader-summary-weekly-github-audit";
import {
  assertReaderSummaryWeeklySealedInputManifest,
  readerSummaryWeeklyInputManifestSchemaVersion,
  sealReaderSummaryWeeklyInputManifest,
  type ReaderSummaryWeeklyInputDayEvidence,
  type ReaderSummaryWeeklyInputManifestEvidence,
} from "./reader-summary-weekly-input-manifest";

const monday = "2026-07-20";
const weekDays = Array.from({ length: 7 }, (_, index) =>
  new Date(
    Date.parse(`${monday}T00:00:00.000Z`) + index * 86_400_000,
  ).toISOString().slice(0, 10),
);
const sha = (value: number): string => value.toString(16).padStart(64, "0");
const mutable = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

type DayOverrides = Readonly<{
  tenantId?: string;
  workspaceId?: string;
  scope?: ReaderSummaryWeeklyManifestScope;
  publicationId?: string;
  artifactId?: string;
  jobId?: string;
  reportId?: string;
  proofId?: string;
  scanJobId?: string;
}>;

const copyScope = (
  value: ReaderSummaryWeeklyManifestScope = { type: "workspace" },
): ReaderSummaryWeeklyManifestScope =>
  value.type === "workspace"
    ? { type: "workspace" }
    : { type: "interest", interestId: value.interestId };

const githubEvidence = (
  date: string,
  dayIndex: number,
  scanJobId: string,
): ReaderSummaryWeeklyGitHubAuditEvidenceInput => {
  const nextMorning = new Date(
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
    observedAt: nextMorning,
    repositories: Array.from({ length: 10 }, (_, rankIndex) => ({
      requestedUtcDay: date,
      scanJobId,
      providerKey: readerSummaryWeeklyGitHubProviderKey,
      kind: readerSummaryWeeklyGitHubEvidenceKind,
      sourceBindingId: `github-binding-${date}`,
      fetchStartedAt: `${date}T23:50:00.000Z`,
      checkedAt: `${date}T23:59:59.999Z`,
      publishedAt: `${date}T23:${String(50 + rankIndex).padStart(2, "0")}:30.000Z`,
      observedAt: nextMorning,
      rank: rankIndex + 1,
      canonicalUrl: `https://github.com/owner-${dayIndex}/repo-${rankIndex + 1}`,
      sourceEvidence: {
        heading: `owner-${dayIndex}/repo-${rankIndex + 1}`,
        description: `Day ${dayIndex} repository ${rankIndex + 1} evidence`,
        primaryLanguage: rankIndex % 2 === 0 ? "TypeScript" : null,
        starsToday: 100 - rankIndex,
        totalStars: 1_000 + dayIndex * 100 + rankIndex,
        forks: 100 + rankIndex,
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
  overrides: DayOverrides,
): ReaderSummaryWeeklyDailyCertificationEvidenceInput => {
  const authority = {
    requestedUtcDate: date,
    tenantId: overrides.tenantId ?? "tenant-a",
    workspaceId: overrides.workspaceId ?? "workspace-a",
    publicationId: overrides.publicationId ?? `publication-${date}`,
    artifactId: overrides.artifactId ?? `artifact-${date}`,
    jobId: overrides.jobId ?? `job-${date}`,
    reportId: overrides.reportId ?? `report-${date}`,
    proofId: overrides.proofId ?? `proof-${date}`,
  };
  const authorityScope = overrides.scope ?? { type: "workspace" };
  const artifactPayload: ReaderSummaryWeeklyDailyArtifactPayloadInput = {
    schemaVersion: readerSummaryWeeklyDailyArtifactSchemaVersion,
    ...authority,
    scope: copyScope(authorityScope),
    period: readerSummaryWeeklyDailyPeriod(date),
    githubBinding: githubBinding(audit),
    providerEvidence: audit.repositories.map((repository, index) => ({
      evidenceId: `github-${date}-${index + 1}`,
      providerKey: readerSummaryWeeklyGitHubProviderKey,
      sourceBindingId: audit.sourceBindingId,
      repositoryIdentity: repository.repositoryIdentity,
    })),
  };
  const artifactSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactPayload,
  ).sha256;
  const reportPayload: ReaderSummaryWeeklyDailyReportPayloadInput = {
    schemaVersion: readerSummaryWeeklyDailyReportSchemaVersion,
    requestedUtcDate: date,
    tenantId: authority.tenantId,
    workspaceId: authority.workspaceId,
    scope: copyScope(authorityScope),
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
    scope: copyScope(authorityScope),
    period: readerSummaryWeeklyDailyPeriod(date),
    reportSha256: canonicalizeReaderSummaryWeeklyJson(reportPayload).sha256,
    artifactSha256,
    githubBinding: githubBinding(audit),
    providerCounts: providerCounts(),
    blockingGateNames: [...readerSummaryWeeklyRequiredDailyBlockingGateNames],
  };
  return {
    ...authority,
    scope: copyScope(authorityScope),
    reportPayload,
    exactProof,
    artifactPayload,
  };
};

const dayEvidence = (
  date: string,
  dayIndex: number,
  overrides: DayOverrides = {},
): ReaderSummaryWeeklyInputDayEvidence => {
  const scanJobId = overrides.scanJobId ?? `github-scan-${date}`;
  const auditEvidence = githubEvidence(date, dayIndex, scanJobId);
  const audit = certifyReaderSummaryWeeklyGitHubAudit(auditEvidence);
  return {
    githubAuditEvidence: auditEvidence,
    dailyCertificationEvidence: dailyEvidence(date, audit, overrides),
  };
};

const manifestEvidence = (
  secondDayOverrides: DayOverrides = {},
): ReaderSummaryWeeklyInputManifestEvidence => ({
  weekStartedUtcDate: monday,
  tenantId: "tenant-a",
  workspaceId: "workspace-a",
  scope: { type: "workspace" },
  days: weekDays.map((date, index) =>
    dayEvidence(date, index, index === 1 ? secondDayOverrides : {}),
  ),
});

describe("reader summary weekly input manifest", () => {
  it("seals an exact immutable deterministic Monday-Sunday 7/7 manifest", () => {
    const input = manifestEvidence();
    const manifest = sealReaderSummaryWeeklyInputManifest(input);
    const repeated = sealReaderSummaryWeeklyInputManifest(manifestEvidence());

    expect(manifest.canonicalJson).toBe(repeated.canonicalJson);
    expect(manifest.sha256).toBe(repeated.sha256);
    expect(manifest.days).toEqual(repeated.days);
    expect(manifest.schemaVersion).toBe(
      readerSummaryWeeklyInputManifestSchemaVersion,
    );
    expect(manifest.status).toBe("sealed");
    expect(manifest.blockingPassed).toBe(true);
    expect(manifest.weekStartedUtcDate).toBe("2026-07-20");
    expect(manifest.weekEndedUtcDate).toBe("2026-07-26");
    expect(manifest.days.map((entry) => entry.requestedUtcDate)).toEqual(
      weekDays,
    );
    expect(manifest.days).toHaveLength(7);
    expect(manifest.days.every(
      (entry) =>
        entry.githubAudit.observedAt >
        `${entry.requestedUtcDate}T23:59:59.999Z`,
    )).toBe(true);
    expect(readerSummaryWeeklySha256(manifest.toBytes())).toBe(manifest.sha256);
    expect(Buffer.from(manifest.toBytes()).toString("utf8")).toBe(
      manifest.canonicalJson,
    );
    expect(manifest.identity).toBe(
      `${readerSummaryWeeklyInputManifestSchemaVersion}:${manifest.sha256}`,
    );
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.days)).toBe(true);
    expect(Object.isFrozen(manifest.days[0]!.githubAudit.repositories)).toBe(true);
  });

  it("returns defensive bytes and rejects mutation of the sealed graph", () => {
    const input = manifestEvidence();
    const manifest = sealReaderSummaryWeeklyInputManifest(input);
    const sealedHash = manifest.sha256;
    const sealedJson = manifest.canonicalJson;
    const bytes = manifest.toBytes();
    bytes[0] = 0;
    mutable(input).tenantId = "mutated";
    mutable(
      input.days[0]!.githubAuditEvidence.repositories[0]!.sourceEvidence,
    ).description = "Caller mutation";

    expect(manifest.toBytes()[0]).toBe("{".charCodeAt(0));
    expect(manifest.tenantId).toBe("tenant-a");
    expect(
      manifest.days[0]!.githubAudit.repositories[0]!.sourceEvidence.description,
    ).toBe("Day 0 repository 1 evidence");
    expect(() => {
      mutable(manifest.days[0]!.dailyCertification).publicationId = "mutated";
    }).toThrow(TypeError);
    expect(() => {
      mutable(
        manifest.days[0]!.githubAudit.repositories[0]!.sourceEvidence,
      ).description = "Nested post-construction mutation";
    }).toThrow(TypeError);
    expect(manifest.sha256).toBe(sealedHash);
    expect(manifest.canonicalJson).toBe(sealedJson);
    expect(readerSummaryWeeklySha256(manifest.toBytes())).toBe(sealedHash);
  });

  it("rejects non-Monday, incomplete, excessive and out-of-order weeks", () => {
    const nonMonday = manifestEvidence();
    mutable(nonMonday).weekStartedUtcDate = "2026-07-21";
    const incomplete = manifestEvidence();
    mutable(incomplete).days = incomplete.days.slice(0, 6);
    const excessive = manifestEvidence();
    mutable(excessive).days = [
      ...excessive.days,
      dayEvidence("2026-07-27", 7),
    ];
    const outOfOrder = manifestEvidence();
    mutable(outOfOrder).days = [
      outOfOrder.days[1],
      outOfOrder.days[0],
      ...outOfOrder.days.slice(2),
    ];

    for (const input of [nonMonday, incomplete, excessive, outOfOrder]) {
      expect(() => sealReaderSummaryWeeklyInputManifest(input)).toThrow();
    }
  });

  it.each([
    ["publication", { publicationId: "publication-2026-07-20" }],
    ["artifact", { artifactId: "artifact-2026-07-20" }],
    ["job", { jobId: "job-2026-07-20" }],
    ["report", { reportId: "report-2026-07-20" }],
    ["proof", { proofId: "proof-2026-07-20" }],
    ["GitHub scan", { scanJobId: "github-scan-2026-07-20" }],
  ] as const)("rejects duplicate cross-day %s identities", (_label, overrides) => {
    expect(() =>
      sealReaderSummaryWeeklyInputManifest(manifestEvidence(overrides)),
    ).toThrow("duplicate");
  });

  it.each([
    ["tenant", { tenantId: "tenant-b" }],
    ["workspace", { workspaceId: "workspace-b" }],
    ["scope", { scope: { type: "interest", interestId: "interest-b" } }],
  ] as const)("rejects mixed daily %s authority", (_label, overrides) => {
    expect(() =>
      sealReaderSummaryWeeklyInputManifest(manifestEvidence(overrides)),
    ).toThrow("mixed authority");
  });

  it("rejects unknown keys, caller seals, accessors and repeated references", () => {
    const unknown = manifestEvidence();
    mutable(unknown.days[0]).extra = true;
    const forgedStatus = manifestEvidence();
    mutable(forgedStatus).status = "sealed";
    const forgedHash = manifestEvidence();
    mutable(forgedHash).sha256 = sha(9_999);
    const accessor = manifestEvidence();
    Object.defineProperty(accessor.days[0]!, "extra", {
      enumerable: true,
      get: () => "unsafe",
    });
    const repeated = manifestEvidence();
    const sharedScope = { type: "workspace" as const };
    mutable(repeated).scope = sharedScope;
    mutable(repeated.days[0]!.dailyCertificationEvidence).scope = sharedScope;

    for (const input of [
      unknown,
      forgedStatus,
      forgedHash,
      accessor,
      repeated,
    ]) {
      expect(() => sealReaderSummaryWeeklyInputManifest(input)).toThrow();
    }
  });

  it("validates every canonical seal field instead of trusting frozen callers", () => {
    const manifest = sealReaderSummaryWeeklyInputManifest(manifestEvidence());

    expect(() =>
      assertReaderSummaryWeeklySealedInputManifest(manifest),
    ).not.toThrow();

    const forgeries = [
      { ...manifest, canonicalJson: "{}" },
      { ...manifest, sha256: sha(9_001) },
      { ...manifest, identity: `forged:${manifest.sha256}` },
      { ...manifest, byteLength: manifest.byteLength + 1 },
      { ...manifest, toBytes: (): Uint8Array => Uint8Array.of(0) },
    ].map((forgery) => Object.freeze(forgery));

    for (const forgery of forgeries) {
      expect(() =>
        assertReaderSummaryWeeklySealedInputManifest(forgery),
      ).toThrow();
    }
  });

  it("rejects canonically resealed malformed dates, mixed scope and duplicates", () => {
    const manifest = sealReaderSummaryWeeklyInputManifest(manifestEvidence());
    const malformedDate = forgeCanonicalManifest(manifest, (body) => {
      body.weekEndedUtcDate = "2026-07-32";
    });
    const mixedScope = forgeCanonicalManifest(manifest, (body) => {
      const certification = certificationAt(body, 1);
      certification.scope = {
        type: "interest",
        interestId: "forged-interest",
      };
      resealDailyCertification(certification);
    });
    const duplicateAuthority = forgeCanonicalManifest(manifest, (body) => {
      const first = certificationAt(body, 0);
      const second = certificationAt(body, 1);
      second.publicationId = first.publicationId;
      resealDailyCertification(second);
    });

    for (const forgery of [
      malformedDate,
      mixedScope,
      duplicateAuthority,
    ]) {
      expect(() =>
        assertReaderSummaryWeeklySealedInputManifest(forgery),
      ).toThrow();
    }
  });

  it("rejects canonically resealed altered certification and GitHub hashes", () => {
    const manifest = sealReaderSummaryWeeklyInputManifest(manifestEvidence());
    const certificationHash = forgeCanonicalManifest(manifest, (body) => {
      certificationAt(body, 2).sha256 = sha(8_001);
    });
    const githubHash = forgeCanonicalManifest(manifest, (body) => {
      githubAuditAt(body, 3).sha256 = sha(8_002);
    });
    const brokenBinding = forgeCanonicalManifest(manifest, (body) => {
      const certification = certificationAt(body, 4);
      certification.githubAuditSha256 = sha(8_003);
      resealDailyCertification(certification);
    });

    for (const forgery of [certificationHash, githubHash, brokenBinding]) {
      expect(() =>
        assertReaderSummaryWeeklySealedInputManifest(forgery),
      ).toThrow();
    }
  });
});

const forgeCanonicalManifest = (
  manifest: ReturnType<typeof sealReaderSummaryWeeklyInputManifest>,
  mutateBody: (body: Record<string, unknown>) => void,
): unknown => {
  const body = JSON.parse(manifest.canonicalJson) as Record<string, unknown>;
  mutateBody(body);
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "forged canonical manifest",
  );
  return Object.freeze({
    ...body,
    identity:
      `${readerSummaryWeeklyInputManifestSchemaVersion}:${canonical.sha256}`,
    sha256: canonical.sha256,
    canonicalJson: canonical.json,
    byteLength: canonical.byteLength,
    toBytes: (): Uint8Array => canonical.toBytes(),
  });
};

const certificationAt = (
  body: Record<string, unknown>,
  index: number,
): Record<string, unknown> => {
  const days = body.days as Record<string, unknown>[];
  return days[index]!.dailyCertification as Record<string, unknown>;
};

const githubAuditAt = (
  body: Record<string, unknown>,
  index: number,
): Record<string, unknown> => {
  const days = body.days as Record<string, unknown>[];
  return days[index]!.githubAudit as Record<string, unknown>;
};

const resealDailyCertification = (
  certification: Record<string, unknown>,
): void => {
  const body = Object.fromEntries(
    Object.entries(certification).filter(
      ([key]) => key !== "identity" && key !== "sha256",
    ),
  );
  const canonical = canonicalizeReaderSummaryWeeklyJson(
    body,
    "forged daily certification",
  );
  certification.sha256 = canonical.sha256;
  certification.identity =
    `${readerSummaryWeeklyDailyCertificationSchemaVersion}:${canonical.sha256}`;
};
