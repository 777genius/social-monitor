import { ReaderSummaryWeeklyArtifact } from "../entities/reader-summary-weekly-artifact";
import type {
  ReaderSummaryWeeklyArtifactSnapshot,
  ReaderSummaryWeeklyArtifactProps,
} from "../entities/reader-summary-weekly-artifact";
import type { ReaderSummaryWeeklyStoryAuthorityBinding } from "../value-objects/reader-summary-weekly-story-authority";
import type { ReaderSummaryWeeklySealedInputManifest } from "../value-objects/reader-summary-weekly-input-manifest";
import {
  canonicalizeReaderSummaryWeeklyJson,
  canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly,
  readerSummaryWeeklyScopeKey,
} from "../value-objects/reader-summary-weekly-canonical-json";

export const verifiedArtifact = (
  artifact: ReaderSummaryWeeklyArtifact,
  modelInput: ReaderSummaryWeeklyArtifactProps["input"],
): ReaderSummaryWeeklyArtifactSnapshot => {
  if (
    typeof artifact !== "object" ||
    artifact === null ||
    typeof artifact.toSnapshot !== "function"
  ) {
    throw new Error("Reader summary weekly publication requires a truthful weekly artifact");
  }
  const supplied = artifact.toSnapshot();
  const verified = ReaderSummaryWeeklyArtifact.create({
    input: modelInput,
    output: supplied.output,
  }).toSnapshot();
  if (
    canonicalizeReaderSummaryWeeklyJson(supplied).json !==
    canonicalizeReaderSummaryWeeklyJson(verified).json ||
    verified.editorialQuality.blockingPassed !== true ||
    verified.editorialQuality.publicationDecision !== "allow"
  ) {
    throw new Error("Reader summary weekly publication requires truthful editorial quality");
  }
  return verified;
};

export const assertManifestBinding = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
  modelInput: ReaderSummaryWeeklyArtifactProps["input"],
  artifact: ReaderSummaryWeeklyArtifactSnapshot,
): void => {
  const scope = canonicalReaderSummaryWeeklyScope(modelInput.scope);
  if (
    modelInput.manifestSealId !== manifest.identity ||
    modelInput.manifestSealSha !== manifest.sha256 ||
    modelInput.tenantId !== manifest.tenantId ||
    modelInput.workspaceId !== manifest.workspaceId ||
    readerSummaryWeeklyScopeKey(scope) !==
      readerSummaryWeeklyScopeKey(manifest.scope) ||
    modelInput.weekStartedOn !== manifest.weekStartedUtcDate ||
    modelInput.weekEndedOn !== manifest.weekEndedUtcDate ||
    artifact.output.sealId !== modelInput.sealId ||
    artifact.output.sealSha !== modelInput.sealSha
  ) {
    throw new Error("Reader summary weekly publication has a mismatched sealed manifest");
  }
  assertModelDayBindings(manifest, modelInput);
};

const assertModelDayBindings = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
  modelInput: ReaderSummaryWeeklyArtifactProps["input"],
): void => {
  if (modelInput.days.length !== manifest.days.length) {
    throw new Error(
      "Reader summary weekly publication model days do not match the manifest",
    );
  }
  manifest.days.forEach((manifestDay, index) => {
    const modelDay = modelInput.days[index];
    const expected = {
      date: manifestDay.requestedUtcDate,
      dailyCertificationId: manifestDay.dailyCertification.identity,
      dailyCertificationSha: manifestDay.dailyCertification.sha256,
      dailyCertificationStatus: manifestDay.dailyCertification.status,
      githubBoardId: manifestDay.githubAudit.identity,
      githubBoardSha: manifestDay.githubAudit.sha256,
      githubBoardStatus: manifestDay.githubAudit.status,
      ...(manifestDay.githubAudit.status === "historical_unavailable"
        ? {
            githubAuthorizationIdentity:
              manifestDay.githubAudit.authorizationIdentity,
          }
        : {}),
      providerCounts: manifestDay.dailyCertification.providerCounts,
    };
    if (
      modelDay === undefined ||
      canonicalizeReaderSummaryWeeklyJson(modelDay).json !==
        canonicalizeReaderSummaryWeeklyJson(expected).json
    ) {
      throw new Error(
        `Reader summary weekly publication model day does not match the manifest for ${manifestDay.requestedUtcDate}`,
      );
    }
  });
};

export const exactAuthorities = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
  authorities: readonly ReaderSummaryWeeklyStoryAuthorityBinding[],
): readonly ReaderSummaryWeeklyStoryAuthorityBinding[] => {
  const byDate = new Map<string, ReaderSummaryWeeklyStoryAuthorityBinding>();
  for (const authority of authorities) {
    if (byDate.has(authority.requestedUtcDate)) {
      throw new Error(
        "Reader summary weekly publication has duplicate daily authorities",
      );
    }
    byDate.set(authority.requestedUtcDate, authority);
  }
  const ordered = manifest.days.map((day) => {
    const authority = byDate.get(day.requestedUtcDate);
    if (authority === undefined) {
      throw new Error(
        `Reader summary weekly publication is missing DB authority for ${day.requestedUtcDate}`,
      );
    }
    assertAuthorityBinding(manifest, day, authority);
    return authority;
  });
  if (byDate.size !== ordered.length) {
    throw new Error(
      "Reader summary weekly publication contains an out-of-week authority",
    );
  }
  return deepFreezeReaderSummaryWeekly(ordered);
};

const assertAuthorityBinding = (
  manifest: ReaderSummaryWeeklySealedInputManifest,
  day: ReaderSummaryWeeklySealedInputManifest["days"][number],
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
): void => {
  const certification = day.dailyCertification;
  if (
    authority.tenantId !== manifest.tenantId ||
    authority.workspaceId !== manifest.workspaceId ||
    readerSummaryWeeklyScopeKey(authority.scope) !==
      readerSummaryWeeklyScopeKey(manifest.scope) ||
    authority.requestedUtcDate !== day.requestedUtcDate ||
    authority.publicationId !== certification.publicationId ||
    authority.artifactId !== certification.artifactId ||
    authority.jobId !== certification.jobId ||
    authority.reportId !== certification.reportId ||
    authority.proofId !== certification.proofId ||
    authority.reportSha256 !== certification.reportSha256 ||
    authority.proofSha256 !== certification.exactProofSha256 ||
    authority.artifactPayloadSha256 !==
      certification.artifactPayloadSha256
  ) {
    throw new Error(
      `Reader summary weekly publication DB authority does not match the sealed manifest for ${day.requestedUtcDate}`,
    );
  }
  if (
    "historicalAuthority" in day &&
    (authority.publicationEvidenceIdentity !==
      day.historicalAuthority.identity ||
      authority.publicationEvidenceSha256 !==
        day.historicalAuthority.sha256 ||
      authority.providerEvidenceSha256 !==
        day.historicalAuthority.providerEvidenceSha256)
  ) {
    throw new Error(
      `Reader summary weekly publication historical authority does not match ${day.requestedUtcDate}`,
    );
  }
  const actualCounts = certification.providerCounts.map((entry) => ({
    providerKey: entry.providerKey,
    count: authority.evidence.filter(
      (evidence) => evidence.providerKey === entry.providerKey,
    ).length,
  }));
  if (
    canonicalizeReaderSummaryWeeklyJson(actualCounts).json !==
    canonicalizeReaderSummaryWeeklyJson(certification.providerCounts).json
  ) {
    throw new Error(
      `Reader summary weekly publication authority citation counts do not match ${day.requestedUtcDate}`,
    );
  }
  assertStrictGitHubBoard(day, authority);
};

const assertStrictGitHubBoard = (
  day: ReaderSummaryWeeklySealedInputManifest["days"][number],
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
): void => {
  const board = day.githubAudit;
  const github = authority.evidence.filter(
    (item) => item.providerKey === "github-trending-page",
  );
  if (board.status === "historical_unavailable") {
    if (
      !("historicalAuthority" in day) ||
      github.length !== 0 ||
      board.mode !== "historical_unavailable" ||
      board.evidenceCount !== 0 ||
      board.repositories.length !== 0 ||
      board.scanJobId !== null ||
      board.sourceBindingId !== null ||
      authority.githubEvidenceSha256 !== board.sha256
    ) {
      throw new Error(
        `Reader summary weekly publication has invalid historical GitHub authority for ${day.requestedUtcDate}`,
      );
    }
    return;
  }
  const repositories = board.repositories.map((repository) => {
    const matching = github.filter(
      (item) =>
        item.canonicalUrl === repository.canonicalUrl &&
        item.sourceContentHash === repository.sourceContentHash,
    );
    if (matching.length !== 1) {
      throw new Error(
        `Reader summary weekly publication is missing the strict GitHub board for ${day.requestedUtcDate}`,
      );
    }
    const evidence = matching[0]!;
    return {
      rank: repository.rank,
      citationId: evidence.citationId,
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      repositoryIdentity: repository.repositoryIdentity,
      canonicalUrl: repository.canonicalUrl,
      sourceContentHash: repository.sourceContentHash,
      sourceProviderContentHash: repository.sourceProviderContentHash,
    };
  });
  const githubBody = {
    schemaVersion:
      "reader_summary.weekly_publication_github_evidence.v1" as const,
    mode: "verified" as const,
    requestedUtcDay: board.requestedUtcDay,
    providerKey: "github-trending-page" as const,
    scanJobId: board.scanJobId,
    sourceBindingId: board.sourceBindingId,
    evidenceCount: repositories.length,
    historicalUnavailableReason: null,
    authorizedAt: null,
    sourceProviderContentHash: board.sourceProviderContentHash,
    repositories,
  };
  if (
    github.length !== 10 ||
    repositories.length !== 10 ||
    canonicalizeReaderSummaryWeeklyJson(githubBody).sha256 !==
      authority.githubEvidenceSha256
  ) {
    throw new Error(
      `Reader summary weekly publication is missing the strict GitHub board for ${day.requestedUtcDate}`,
    );
  }
};

export const exactCitationCoverage = (
  modelInput: ReaderSummaryWeeklyArtifactProps["input"],
  output: ReaderSummaryWeeklyArtifactSnapshot["output"],
  manifest: ReaderSummaryWeeklySealedInputManifest,
  authorities: readonly ReaderSummaryWeeklyStoryAuthorityBinding[],
) => {
  const cited = new Set([
    ...output.headlineCitationIds,
    ...output.takeawayCitationIds,
    ...output.synthesisCitationIds,
    ...output.stories.flatMap((story) => story.citationIds),
    ...output.sections.flatMap((section) => section.citationIds),
  ]);
  if (
    cited.size !== modelInput.citations.length ||
    modelInput.citations.some((citation) => !cited.has(citation.citationId))
  ) {
    throw new Error(
      "Reader summary weekly publication requires 1:1 citation coverage",
    );
  }
  const proof = modelInput.citations.map((citation) => {
    const dayIndex = manifest.days.findIndex(
      (day) => day.requestedUtcDate === citation.observedOn,
    );
    const day = manifest.days[dayIndex];
    const authority = authorities[dayIndex];
    if (
      day === undefined ||
      authority === undefined ||
      citation.dailyCertificationId !== day.dailyCertification.identity ||
      citation.dailyCertificationSha !== day.dailyCertification.sha256 ||
      (citation.providerKey === "github-trending-page" &&
        day.githubAudit.status === "historical_unavailable")
    ) {
      throw new Error(
        `Reader summary weekly citation ${citation.citationId} is outside the sealed week`,
      );
    }
    const matching = authority.evidence.filter(
      (evidence) =>
        evidence.citationId === citation.citationId &&
        evidence.providerKey === citation.providerKey &&
        evidence.canonicalUrl === citation.canonicalUrl &&
        evidence.sourceContentHash === citation.sourceSha256,
    );
    if (matching.length !== 1) {
      throw new Error(
        `Reader summary weekly citation ${citation.citationId} lacks 1:1 DB authority`,
      );
    }
    const evidence = matching[0]!;
    return {
      citationId: citation.citationId,
      requestedUtcDate: citation.observedOn,
      publicationId: authority.publicationId,
      publicationEvidenceIdentity: authority.publicationEvidenceIdentity,
      providerKey: evidence.providerKey,
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      sourceBindingId: evidence.sourceBindingId,
      providerItemId: evidence.providerItemId,
      canonicalUrl: evidence.canonicalUrl,
      sourceContentHash: evidence.sourceContentHash,
    };
  });
  return deepFreezeReaderSummaryWeekly(proof);
};

export const authorityProof = (
  authority: ReaderSummaryWeeklyStoryAuthorityBinding,
  day: ReaderSummaryWeeklySealedInputManifest["days"][number],
) => ({
  requestedUtcDate: authority.requestedUtcDate,
  publicationId: authority.publicationId,
  publicationEvidenceIdentity: authority.publicationEvidenceIdentity,
  publicationEvidenceSha256: authority.publicationEvidenceSha256,
  storyAuthorityIdentity: authority.identity,
  storyAuthoritySha256: authority.sha256,
  githubBoardIdentity: day.githubAudit.identity,
  githubBoardSha256: day.githubAudit.sha256,
});

export const invalidAuthorization = (): Error => new Error(
  "Reader summary weekly publication authorization is forged or unavailable");
