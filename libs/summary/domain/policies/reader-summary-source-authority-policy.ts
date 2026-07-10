import type {
  SummaryEvidenceContentQuality,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

const firstPartyOfficialFlags = ["official_account", "trusted_author"] as const;

export const hasFirstPartyOfficialEvidence = (
  evidence: readonly SummaryEvidenceItem[],
): boolean =>
  evidence.some((item) => isFirstPartyOfficialQuality(item.contentQuality));

export const isFirstPartyOfficialQuality = (
  quality: SummaryEvidenceContentQuality | undefined,
): boolean =>
  quality?.eligibleForTopRead === true &&
  firstPartyOfficialFlags.every((flag) => quality.flags.includes(flag));

export const firstPartyPublicationBurstKey = (
  evidence: SummaryEvidenceItem,
): string | undefined => {
  const authorHandle = evidence.authorHandle?.trim().toLowerCase();
  if (
    authorHandle === undefined ||
    authorHandle.length === 0 ||
    !hasFirstPartyOfficialEvidence([evidence])
  ) {
    return undefined;
  }

  const publishedSecond = Math.floor(evidence.publishedAt.getTime() / 1_000);
  if (!Number.isFinite(publishedSecond)) {
    return undefined;
  }

  return [
    evidence.providerKey.trim().toLowerCase(),
    authorHandle,
    publishedSecond,
    officialPublicationSubject(evidence.title),
  ].join(":");
};

const officialPublicationSubject = (title: string): string => {
  const tokens = title
    .trim()
    .replace(/^X post by @[^:]+:\s*/iu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}.-]{2,}/gu);
  const meaningfulTokens = (tokens ?? []).filter(
    (token) => !officialPublicationSubjectStopWords.has(token),
  );

  return meaningfulTokens.slice(0, 2).join("-") || "generic";
};

const officialPublicationSubjectStopWords = new Set([
  "announcement",
  "announces",
  "details",
  "introduces",
  "introducing",
  "intro",
  "model",
  "models",
  "new",
  "official",
  "openai",
  "post",
  "release",
  "releases",
  "update",
]);
