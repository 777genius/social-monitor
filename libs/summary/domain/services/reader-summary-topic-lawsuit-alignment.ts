import type { ReaderSummaryTopicSemanticLabel } from "./reader-summary-topic-claim-label-policy";

export const alignAllegationSemanticToEvidence = (
  semantic: ReaderSummaryTopicSemanticLabel,
  subject: string,
  evidenceTexts: readonly string[],
): ReaderSummaryTopicSemanticLabel => {
  const groundedLawsuit = evidenceTexts.some((text) =>
    lawsuitEvidenceMarker.test(text),
  );
  const allegationSubject = normalizePart(
    subject.replace(/\blawsuits?\b/giu, " "),
  );
  const alignedSubject = groundedLawsuit
    ? alignLawsuitSubject(allegationSubject, evidenceTexts)
    : allegationSubject;
  const qualifier = normalizePart(semantic.qualifier);
  const alignedQualifier = groundedLawsuit
    ? "Lawsuit"
    : lawsuitQualifierMarker.test(qualifier)
      ? ""
      : qualifier;

  return {
    subject: alignedSubject.length > 0 ? alignedSubject : subject,
    ...(semantic.parentSubject === undefined
      ? {}
      : { parentSubject: semantic.parentSubject }),
    claimType: semantic.claimType,
    ...(alignedQualifier.length > 0 ? { qualifier: alignedQualifier } : {}),
    confidenceScore: semantic.confidenceScore,
  };
};

const alignLawsuitSubject = (
  subject: string,
  evidenceTexts: readonly string[],
): string => {
  const relation = explicitLawsuitRelation(evidenceTexts);
  if (relation === undefined) {
    return subject;
  }
  const subjectTokens = normalizedTokens(subject);
  const relationTokens = relation.flatMap(normalizedTokens);
  const containsAllParties = relationTokens.every((token) =>
    subjectTokens.includes(token),
  );
  const mentionsKnownParty = relationTokens.some((token) =>
    subjectTokens.includes(token),
  );

  return containsAllParties ||
    mentionsKnownParty ||
    /\b(?:sued|sues)\b/iu.test(subject)
    ? compactLawsuitSubject(relation)
    : subject;
};

const compactLawsuitSubject = (relation: readonly [string, string]): string => {
  const combined = relation.join(" ");
  if (combined.split(/\s+/u).length <= maxLawsuitSubjectWords) {
    return combined;
  }

  const preferredParty = relation
    .map((party) => party.split(/\s+/u))
    .sort((left, right) => right.length - left.length)[0];

  return (preferredParty ?? relation[0].split(/\s+/u))
    .slice(0, maxLawsuitSubjectWords)
    .join(" ");
};

const explicitLawsuitRelation = (
  evidenceTexts: readonly string[],
): readonly [string, string] | undefined => {
  for (const evidenceText of evidenceTexts) {
    const verbRelation = verbLawsuitRelation.exec(evidenceText);
    if (verbRelation?.[1] !== undefined && verbRelation[2] !== undefined) {
      return normalizedRelation(verbRelation[1], verbRelation[2]);
    }
    const possessiveRelation = possessiveLawsuitRelation.exec(evidenceText);
    if (
      possessiveRelation?.[1] !== undefined &&
      possessiveRelation[2] !== undefined
    ) {
      return normalizedRelation(possessiveRelation[1], possessiveRelation[2]);
    }
  }

  return undefined;
};

const normalizedRelation = (
  claimant: string,
  defendant: string,
): readonly [string, string] => [
  normalizeEntityPhrase(claimant),
  normalizeEntityPhrase(defendant),
];

const normalizeEntityPhrase = (value: string): string => {
  const normalized = normalizePart(value).replace(/[.,:;]+$/u, "");

  return normalized.split(/\s+/u).length > 1
    ? normalized.replace(/^The\s+/u, "")
    : normalized;
};

const normalizedTokens = (value: string): readonly string[] =>
  normalizePart(value).toLocaleLowerCase("en-US").split(/\s+/u).filter(Boolean);

const normalizePart = (value: string | undefined): string =>
  value?.replace(/\s+/gu, " ").trim() ?? "";

const entityToken = String.raw`\p{Lu}[\p{Letter}\p{Number}.+#\-]*`;
const entityPhrase = String.raw`${entityToken}(?:\s+${entityToken}){0,3}`;
const verbLawsuitRelation = new RegExp(
  String.raw`\b(${entityPhrase})\s+(?:has\s+|reportedly\s+)?(?:sues|sued)\s+(${entityPhrase})\b`,
  "u",
);
const possessiveLawsuitRelation = new RegExp(
  String.raw`\b(${entityPhrase})(?:['’]s)?\s+lawsuit\s+against\s+(${entityPhrase})\b`,
  "u",
);
const lawsuitEvidenceMarker = /\b(?:lawsuits?|sued|sues)\b/iu;
const lawsuitQualifierMarker = /\blawsuits?\b/iu;
const maxLawsuitSubjectWords = 3;
