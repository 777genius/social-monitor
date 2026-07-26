import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcTimestamp,
} from "./reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCanonicalProviderKeys,
  type ReaderSummaryWeeklyCanonicalProviderCount,
} from "./reader-summary-weekly-daily-certification";
import type { ReaderSummaryWeeklyPublicationGitHubEvidence } from "./reader-summary-weekly-publication-github-evidence";
import type { ReaderSummaryWeeklyPublicationProviderEvidence } from "./reader-summary-weekly-publication-evidence";

const providerEvidenceKeys = [
  "citationId",
  "citationField",
  "feedItemId",
  "sourceItemId",
  "sourceBindingId",
  "providerKey",
  "providerItemId",
  "canonicalUrl",
  "title",
  "sourceText",
  "publishedAt",
  "observedAt",
  "sourceContentHash",
] as const;

export const assertPublicationEvidenceSemantics = (
  semanticStatus: unknown,
  providerEvidence: readonly ReaderSummaryWeeklyPublicationProviderEvidence[],
  providerCounts: readonly ReaderSummaryWeeklyCanonicalProviderCount[],
  githubEvidence: ReaderSummaryWeeklyPublicationGitHubEvidence,
): void => {
  assertReaderSummaryWeeklyDenseArray(
    providerCounts,
    "publication provider counts",
  );
  if (providerCounts.length !== readerSummaryWeeklyCanonicalProviderKeys.length) {
    throw new Error(
      "Reader summary weekly publication provider counts are not canonical",
    );
  }
  let total = 0;
  providerCounts.forEach((providerCount, index) => {
    assertReaderSummaryWeeklyExactObject(
      providerCount,
      ["providerKey", "count"],
      "publication provider count",
    );
    if (
      providerCount.providerKey !==
        readerSummaryWeeklyCanonicalProviderKeys[index] ||
      !Number.isSafeInteger(providerCount.count) ||
      providerCount.count < 0 ||
      providerCount.count !==
        providerEvidence.filter(
          (evidence) => evidence.providerKey === providerCount.providerKey,
        ).length
    ) {
      throw new Error(
        "Reader summary weekly publication provider counts are not canonical",
      );
    }
    total += providerCount.count;
  });
  const githubCount = providerCounts[0]?.count;
  if (githubCount !== githubEvidence.evidenceCount) {
    throw new Error(
      "Reader summary weekly publication GitHub provider count is invalid",
    );
  }
  if (
    semanticStatus === "NO_SIGNAL" &&
    (total !== 0 ||
      githubEvidence.mode === "verified" ||
      githubEvidence.evidenceCount !== 0 ||
      githubEvidence.repositories.length !== 0)
  ) {
    throw new Error(
      "Reader summary weekly NO_SIGNAL publication requires empty provider citations and repositories",
    );
  }
  if (
    semanticStatus === "COMPLETED" &&
    total > 0 &&
    githubEvidence.mode !== "ordinary_not_required"
  ) {
    return;
  }
  if (semanticStatus === "COMPLETED" && total === 0) {
    throw new Error(
      "Reader summary weekly COMPLETED publication requires provider evidence",
    );
  }
  if (semanticStatus === "COMPLETED") {
    throw new Error(
      "Reader summary weekly ordinary GitHub mode requires a NO_SIGNAL publication",
    );
  }
};

export const canonicalProviderEvidence = (
  input: readonly ReaderSummaryWeeklyPublicationProviderEvidence[],
): readonly ReaderSummaryWeeklyPublicationProviderEvidence[] => {
  assertReaderSummaryWeeklyDenseArray(input, "publication provider evidence");
  const evidence = input.map((item) => {
    assertReaderSummaryWeeklyExactObject(
      item,
      providerEvidenceKeys,
      "publication provider evidence item",
      { allowAuthoritativeHashes: true },
    );
    if (!readerSummaryWeeklyCanonicalProviderKeys.includes(item.providerKey)) {
      throw new Error(
        "Reader summary weekly publication provider is not canonical",
      );
    }
    return deepFreezeReaderSummaryWeekly({
      citationId: exactReaderSummaryWeeklyIdentity(
        item.citationId,
        "provider citation id",
      ),
      citationField: exactCitationField(item.citationField),
      feedItemId: exactReaderSummaryWeeklyIdentity(
        item.feedItemId,
        "provider feed item id",
      ),
      sourceItemId: exactReaderSummaryWeeklyIdentity(
        item.sourceItemId,
        "provider source item id",
      ),
      sourceBindingId: exactReaderSummaryWeeklyIdentity(
        item.sourceBindingId,
        "provider source binding id",
      ),
      providerKey: item.providerKey,
      providerItemId: exactReaderSummaryWeeklyIdentity(
        item.providerItemId,
        "provider item id",
      ),
      canonicalUrl: exactReaderSummaryWeeklyIdentity(
        item.canonicalUrl,
        "provider canonical URL",
      ),
      title: exactPublicationText(item.title, "provider title"),
      sourceText: exactPublicationText(
        item.sourceText,
        "provider source text",
      ),
      publishedAt: exactReaderSummaryWeeklyUtcTimestamp(
        item.publishedAt,
        "provider publishedAt",
      ),
      observedAt: exactReaderSummaryWeeklyUtcTimestamp(
        item.observedAt,
        "provider observedAt",
      ),
      sourceContentHash: exactReaderSummaryWeeklySha256(
        item.sourceContentHash,
        "provider source content hash",
      ),
    });
  });
  const ordered = [...evidence].sort((left, right) => {
    const provider =
      readerSummaryWeeklyCanonicalProviderKeys.indexOf(left.providerKey) -
      readerSummaryWeeklyCanonicalProviderKeys.indexOf(right.providerKey);
    return (
      provider ||
      lexicalCompare(left.sourceItemId, right.sourceItemId) ||
      lexicalCompare(left.citationId, right.citationId)
    );
  });
  if (
    new Set(ordered.map((item) => item.citationId)).size !== ordered.length ||
    new Set(ordered.map((item) => item.feedItemId)).size !== ordered.length ||
    new Set(ordered.map((item) => item.sourceItemId)).size !== ordered.length
  ) {
    throw new Error(
      "Reader summary weekly publication provider identities are duplicated",
    );
  }
  return deepFreezeReaderSummaryWeekly(ordered);
};

export const exactPublicationSemanticStatus = (
  status: unknown,
  artifactPayload: unknown,
): "COMPLETED" | "NO_SIGNAL" => {
  assertReaderSummaryWeeklyExactObject(
    artifactPayload,
    Object.keys(artifactPayload as object),
    "publication artifact payload",
    { allowAuthoritativeHashes: true },
  );
  const artifact = artifactPayload as Record<string, unknown>;
  const flags = artifact.qualityFlags;
  assertReaderSummaryWeeklyDenseArray(flags, "publication quality flags");
  const noSignal = flags.includes("no_signal");
  const reason = artifact.noSignalReason;
  if (
    (status === "NO_SIGNAL" &&
      noSignal &&
      typeof reason === "string" &&
      reason.trim().length > 0) ||
    (status === "COMPLETED" && !noSignal && reason === undefined)
  ) {
    return status;
  }
  throw new Error(
    "Reader summary weekly publication semantic status is not real",
  );
};

export const assertGitHubProviderBinding = (
  providerEvidence: readonly ReaderSummaryWeeklyPublicationProviderEvidence[],
  githubEvidence: ReaderSummaryWeeklyPublicationGitHubEvidence,
): void => {
  const github = providerEvidence.filter(
    (item) => item.providerKey === "github-trending-page",
  );
  const byCitation = new Map(
    github.map((item) => [item.citationId, item] as const),
  );
  if (
    github.length !== githubEvidence.evidenceCount ||
    githubEvidence.repositories.some((repository) => {
      const item = byCitation.get(repository.citationId);
      return (
        item === undefined ||
        item.feedItemId !== repository.feedItemId ||
        item.sourceItemId !== repository.sourceItemId ||
        item.canonicalUrl !== repository.canonicalUrl ||
        item.sourceContentHash !== repository.sourceContentHash
      );
    })
  ) {
    throw new Error(
      "Reader summary weekly publication GitHub provider evidence is invalid",
    );
  }
};

const lexicalCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const exactCitationField = (
  value: unknown,
): "title" | "bodyPreview" | "canonicalUrl" => {
  if (
    value !== "title" &&
    value !== "bodyPreview" &&
    value !== "canonicalUrl"
  ) {
    throw new Error(
      "Reader summary weekly provider citation field is invalid",
    );
  }
  return value;
};

const exactPublicationText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length > 16_384) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};
