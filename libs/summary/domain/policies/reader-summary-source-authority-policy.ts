import type {
  SummaryEvidenceContentQuality,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

const firstPartyOfficialFlags = ["official_account", "trusted_author"] as const;

export const hasFirstPartyOfficialEvidence = (
  evidence: readonly SummaryEvidenceItem[],
): boolean =>
  evidence.some((item) => isFirstPartyOfficialQuality(item.contentQuality));

export const isPrimaryDocumentQuality = (
  quality: SummaryEvidenceContentQuality | undefined,
): boolean =>
  quality?.eligibleForTopRead === true &&
  quality.flags.some((flag) =>
    ["court_filing", "primary_document"].includes(
      flag.toLocaleLowerCase("en-US"),
    ),
  );

export const hasPrimaryLegalAuthority = (
  evidence: SummaryEvidenceItem,
): boolean =>
  isFirstPartyOfficialQuality(evidence.contentQuality) ||
  isPrimaryDocumentQuality(evidence.contentQuality) ||
  isOfficialLegalDocumentEvidence(evidence);

export const isHighRiskLegalEvidence = (
  evidence: SummaryEvidenceItem,
): boolean =>
  /\b(?:lawsuits?|legal (?:actions?|claims?|complaints?|disputes?|proceedings?)|court (?:cases?|filings?|complaints?|orders?|rulings?)|(?:files?|filed|filing) (?:a |an )?(?:lawsuit|complaint|legal action)|accus(?:e|es|ed|ing|ations?)|alleg(?:e|es|ed|ing|ations?)|indict(?:ed|ments?)?|charg(?:e|es|ed|ing) with|antitrust (?:cases?|actions?|complaints?|lawsuits?)|(?:copyright|patent|trademark|trade[ -]secret) (?:infringement|misappropriation|theft|cases?|claims?|disputes?|lawsuits?)|sue|sues|sued|suing|settlements?)\b/iu.test(
    [evidence.title, evidence.bodyPreview, ...evidence.whyImportant].join(" "),
  );

const isOfficialLegalDocumentEvidence = (
  evidence: SummaryEvidenceItem,
): boolean => {
  try {
    const url = new URL(evidence.sourceOriginUrl ?? evidence.canonicalUrl);
    const officialHost =
      url.hostname.toLocaleLowerCase("en-US").endsWith(".gov") ||
      url.hostname.toLocaleLowerCase("en-US") === "gov";
    const documentSignal =
      /\b(?:case no\.?|civil action|complaint|court filing|docket|indictment|memorandum opinion|order|petition)\b/iu.test(
        [evidence.title, evidence.bodyPreview].join(" "),
      );

    return (
      officialHost &&
      documentSignal &&
      evidence.contentQuality?.eligibleForTopRead === true
    );
  } catch {
    return false;
  }
};

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
