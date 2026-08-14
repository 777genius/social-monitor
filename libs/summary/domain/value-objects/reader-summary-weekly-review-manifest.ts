import {
  assertReaderSummaryWeeklyDenseArray, assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson, canonicalReaderSummaryWeeklyScope,
  deepFreezeReaderSummaryWeekly, exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256, exactReaderSummaryWeeklyUtcDay,
  exactReaderSummaryWeeklyUtcTimestamp, readerSummaryWeeklyScopeKey,
  type ReaderSummaryWeeklyManifestScope,
} from "./reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyCanonicalProviderKeys,
  type ReaderSummaryWeeklyCanonicalProviderKey,
} from "./reader-summary-weekly-daily-certification";
import {
  deriveReaderSummaryWeeklyStoryIdentity,
  readerSummaryWeeklyStoryIdentitySchemaVersion,
} from "./reader-summary-weekly-story-identity";

export const readerSummaryWeeklyReviewManifestSchemaVersion = "reader_summary.weekly_review_manifest.v1" as const;
export const readerSummaryWeeklyReviewAuthoritySchemaVersion = "reader_summary.weekly_review_authority.v1" as const;
export const readerSummaryWeeklyReviewResponseSchemaVersion = "reader_summary.weekly_review_response.v1" as const;
export type ReaderSummaryWeeklyReviewLabel = "observation" | "evolution" | "resolution";
export type ReaderSummaryWeeklyReviewAuthorityEvidence = Readonly<{
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey; citationId: string; feedItemId: string;
  sourceItemId: string; sourceBindingId: string; providerItemId: string; canonicalUrl: string;
  sourceContentHash: string; publishedAt: string; observedAt: string; title: string; sourceText: string;
}>;
export type ReaderSummaryWeeklyReviewAuthorityDay = Readonly<{
  requestedUtcDate: string; publicationId: string; publicationEvidenceIdentity: string;
  publicationEvidenceSha256: string; providerEvidenceSha256: string; githubEvidenceSha256: string;
  semanticStatus: "COMPLETED" | "NO_SIGNAL";
  githubMode: "verified" | "ordinary_not_required" | "historical_unavailable";
  providerEvidence: readonly ReaderSummaryWeeklyReviewAuthorityEvidence[];
}>;
export type ReaderSummaryWeeklyReviewAuthority = Readonly<{
  sealId: string; sealSha256: string; tenantId: string; workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope; weekStartedOn: string; weekEndedOn: string;
  days: readonly ReaderSummaryWeeklyReviewAuthorityDay[];
}>;
export type ReaderSummaryWeeklyReviewCitationCandidate = Readonly<{
  selector: string; requestedUtcDate: string; publicationId: string; publicationEvidenceIdentity: string;
  publicationEvidenceSha256: string; providerKey: ReaderSummaryWeeklyCanonicalProviderKey;
  citationId: string; sourceItemId: string; sourceContentHash: string; title: string; sourceText: string;
}>;
export type ReaderSummaryWeeklyReviewCitationSelectorInput = Readonly<{
  requestedUtcDate: string; publicationId: string; publicationEvidenceSha256: string;
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey; citationId: string; sourceItemId: string;
  sourceContentHash: string;
}>;
export type ReaderSummaryWeeklyReviewStoryCandidate = Readonly<{
  storyId: string; story: string; citations: readonly ReaderSummaryWeeklyReviewCitationCandidate[];
}>;
export type ReaderSummaryWeeklyReviewSelection = Readonly<{
  story: string; label: ReaderSummaryWeeklyReviewLabel; citationSelectors: readonly string[];
  beforeCitationSelector?: string; afterCitationSelector?: string; terminalCitationSelector?: string;
}>;
export type ReaderSummaryWeeklyReviewExecutionAttestation = Readonly<{
  schemaVersion: 1; requestId: string; purpose: "social_monitor.reader_summary.weekly.review";
  canonicalRequestSha256: string; provider: "codex"; model: "gpt-5.6-sol"; reasoningEffort: "xhigh";
  runtimeEngine: "subscription-runtime-cli"; runtimePackageVersion: string; launcherSha256: string;
  selectedOutputKind: "structured_output"; selectedOutputSha256: string;
}>;
type ReaderSummaryWeeklyReviewAuthorityBinding = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyReviewAuthoritySchemaVersion;
  sealId: string; sealSha256: string; tenantId: string; workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope; scopeKey: string; weekStartedOn: string; weekEndedOn: string;
  days: readonly Readonly<{
    requestedUtcDate: string; publicationId: string; publicationEvidenceIdentity: string;
    publicationEvidenceSha256: string; providerEvidenceSha256: string; githubEvidenceSha256: string;
    semanticStatus: "COMPLETED" | "NO_SIGNAL";
    githubMode: "verified" | "ordinary_not_required" | "historical_unavailable";
  }>[];
}>;
export type ReaderSummaryWeeklyReviewedCitation = Readonly<{
  selector: string; storyId: string; requestedUtcDate: string; publicationId: string;
  publicationEvidenceIdentity: string; publicationEvidenceSha256: string;
  providerKey: ReaderSummaryWeeklyCanonicalProviderKey; citationId: string; sourceItemId: string;
  sourceContentHash: string;
}>;
export type ReaderSummaryWeeklyReviewedObservation = Readonly<{
  storyId: string; story: string; label: ReaderSummaryWeeklyReviewLabel; citationSelectors: readonly string[];
  beforeCitationSelector?: string; afterCitationSelector?: string; terminalCitationSelector?: string;
}>;
export type ReaderSummaryWeeklyReviewManifest = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyReviewManifestSchemaVersion; manifestId: string; manifestSha256: string;
  tenantId: string; workspaceId: string; scope: ReaderSummaryWeeklyManifestScope; scopeKey: string;
  weekStartedOn: string; weekEndedOn: string; sealId: string; sealSha256: string;
  reviewAuthority: ReaderSummaryWeeklyReviewAuthorityBinding; reviewAuthoritySha256: string;
  observations: readonly ReaderSummaryWeeklyReviewedObservation[]; citations: readonly ReaderSummaryWeeklyReviewedCitation[];
  modelResponseSha256: string; executionAttestation: ReaderSummaryWeeklyReviewExecutionAttestation;
  executionAttestationSha256: string; canonicalRecord: Readonly<Record<string, unknown>>;
  canonicalJson: string; byteLength: number; toBytes(): Uint8Array;
}>;
export type CreateReaderSummaryWeeklyReviewManifestInput = Readonly<{
  authority: ReaderSummaryWeeklyReviewAuthority; selections: readonly ReaderSummaryWeeklyReviewSelection[];
  modelResponseSha256: string; executionAttestation: ReaderSummaryWeeklyReviewExecutionAttestation;
}>;

const authorityKeys = ["sealId", "sealSha256", "tenantId", "workspaceId", "scope", "weekStartedOn", "weekEndedOn", "days"] as const;
const authorityDayKeys = ["requestedUtcDate", "publicationId", "publicationEvidenceIdentity", "publicationEvidenceSha256", "providerEvidenceSha256", "githubEvidenceSha256", "semanticStatus", "githubMode", "providerEvidence"] as const;
const authorityEvidenceKeys = ["providerKey", "citationId", "feedItemId", "sourceItemId", "sourceBindingId", "providerItemId", "canonicalUrl", "sourceContentHash", "publishedAt", "observedAt", "title", "sourceText"] as const;
const citationSelectorInputKeys = ["requestedUtcDate", "publicationId", "publicationEvidenceSha256", "providerKey", "citationId", "sourceItemId", "sourceContentHash"] as const;
const selectionBaseKeys = ["story", "label", "citationSelectors"] as const;

export const deriveReaderSummaryWeeklyReviewCitationSelector = (
  input: ReaderSummaryWeeklyReviewCitationSelectorInput,
): string => {
  assertReaderSummaryWeeklyExactObject(
    input,
    citationSelectorInputKeys,
    "weekly review citation selector input",
    { allowAuthoritativeHashes: true },
  );
  if (!readerSummaryWeeklyCanonicalProviderKeys.includes(input.providerKey)) {
    throw new Error("Reader summary weekly review selector provider is invalid");
  }
  return `citation:${canonicalizeReaderSummaryWeeklyJson({
    requestedUtcDate: exactReaderSummaryWeeklyUtcDay(input.requestedUtcDate),
    publicationId: exactReaderSummaryWeeklyIdentity(input.publicationId, "weekly review selector publication id"),
    publicationEvidenceSha256: exactReaderSummaryWeeklySha256(input.publicationEvidenceSha256, "weekly review selector publication evidence hash"),
    providerKey: input.providerKey,
    citationId: exactReaderSummaryWeeklyIdentity(input.citationId, "weekly review selector local citation id"),
    sourceItemId: exactReaderSummaryWeeklyIdentity(input.sourceItemId, "weekly review selector source item id"),
    sourceContentHash: exactReaderSummaryWeeklySha256(input.sourceContentHash, "weekly review selector source content hash"),
  }).sha256}`;
};

export const deriveReaderSummaryWeeklyReviewStoryCandidates = (authority: ReaderSummaryWeeklyReviewAuthority): readonly ReaderSummaryWeeklyReviewStoryCandidate[] => {
  canonicalReviewAuthority(authority);
  const candidates = new Map<string, { storyId: string; story: string; citations: ReaderSummaryWeeklyReviewCitationCandidate[] }>();
  for (const day of authority.days) {
    if (day.semanticStatus !== "COMPLETED") continue;
    for (const evidence of day.providerEvidence) {
      const storyIdentity = deriveReaderSummaryWeeklyStoryIdentity({
        subjectKey: `provider:${evidence.providerKey}`, actionKey: "action:tracked",
        objectKeys: [`resource:${canonicalizeReaderSummaryWeeklyJson({ canonicalUrl: evidence.canonicalUrl }).sha256}`],
        qualifierKeys: ["review:aggregate"],
      });
      const storyId = storyIdentity.identity;
      const story = `story:${storyIdentity.sha256}`;
      const selector = deriveReaderSummaryWeeklyReviewCitationSelector({
        requestedUtcDate: day.requestedUtcDate, publicationId: day.publicationId,
        publicationEvidenceSha256: day.publicationEvidenceSha256, providerKey: evidence.providerKey,
        citationId: evidence.citationId, sourceItemId: evidence.sourceItemId,
        sourceContentHash: evidence.sourceContentHash,
      });
      const citation = deepFreezeReaderSummaryWeekly({
        selector, requestedUtcDate: day.requestedUtcDate, publicationId: day.publicationId,
        publicationEvidenceIdentity: day.publicationEvidenceIdentity, publicationEvidenceSha256: day.publicationEvidenceSha256,
        providerKey: evidence.providerKey, citationId: evidence.citationId, sourceItemId: evidence.sourceItemId,
        sourceContentHash: evidence.sourceContentHash, title: evidence.title, sourceText: evidence.sourceText,
      });
      const candidate = candidates.get(story);
      if (candidate === undefined) candidates.set(story, { storyId, story, citations: [citation] });
      else candidate.citations.push(citation);
    }
  }
  return deepFreezeReaderSummaryWeekly([...candidates.values()].map((candidate) => deepFreezeReaderSummaryWeekly({
    storyId: candidate.storyId, story: candidate.story, citations: candidate.citations.sort(compareCandidateCitation),
  })).sort((left, right) => lexicalCompare(left.story, right.story)));
};

export const createReaderSummaryWeeklyReviewManifest = (input: CreateReaderSummaryWeeklyReviewManifestInput): ReaderSummaryWeeklyReviewManifest => {
  assertReaderSummaryWeeklyExactObject(input, ["authority", "selections", "modelResponseSha256", "executionAttestation"], "weekly review manifest input");
  const reviewAuthority = canonicalReviewAuthority(input.authority);
  const candidates = deriveReaderSummaryWeeklyReviewStoryCandidates(input.authority);
  const selections = canonicalSelections(input.selections, candidates);
  const citations = reviewedCitations(selections, candidates);
  assertUniqueStoryDates(citations);
  const observations = reviewedObservations(selections, citations, candidates);
  const modelResponseSha256 = exactReaderSummaryWeeklySha256(input.modelResponseSha256, "weekly review model response hash");
  const executionAttestation = canonicalExecutionAttestation(input.executionAttestation, modelResponseSha256);
  const body = deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyReviewManifestSchemaVersion, tenantId: reviewAuthority.tenantId,
    workspaceId: reviewAuthority.workspaceId, scope: cloneReviewScope(reviewAuthority.scope), scopeKey: reviewAuthority.scopeKey,
    weekStartedOn: reviewAuthority.weekStartedOn, weekEndedOn: reviewAuthority.weekEndedOn,
    sealId: reviewAuthority.sealId, sealSha256: reviewAuthority.sealSha256, reviewAuthority,
    reviewAuthoritySha256: canonicalizeReaderSummaryWeeklyJson(reviewAuthority, "weekly review authority").sha256,
    observations, citations, modelResponseSha256, executionAttestation,
    executionAttestationSha256: canonicalizeReaderSummaryWeeklyJson(executionAttestation, "weekly review execution attestation").sha256,
  });
  const canonical = canonicalizeReaderSummaryWeeklyJson(body, "weekly review manifest");
  const manifestId = `${readerSummaryWeeklyReviewManifestSchemaVersion}:${canonical.sha256}`;
  const canonicalRecord = deepFreezeReaderSummaryWeekly({ ...body, manifestId, manifestSha256: canonical.sha256 });
  return deepFreezeReaderSummaryWeekly({
    ...body, manifestId, manifestSha256: canonical.sha256, canonicalRecord,
    canonicalJson: canonical.json, byteLength: canonical.byteLength, toBytes: (): Uint8Array => canonical.toBytes(),
  });
};

const canonicalReviewAuthority = (input: ReaderSummaryWeeklyReviewAuthority): ReaderSummaryWeeklyReviewAuthorityBinding => {
  assertReaderSummaryWeeklyExactObject(input, authorityKeys, "weekly review authority");
  const tenantId = exactReaderSummaryWeeklyIdentity(input.tenantId, "weekly review tenant id");
  const workspaceId = exactReaderSummaryWeeklyIdentity(input.workspaceId, "weekly review workspace id");
  const scope = canonicalReaderSummaryWeeklyScope(input.scope);
  const scopeKey = readerSummaryWeeklyScopeKey(scope);
  const weekStartedOn = exactReaderSummaryWeeklyUtcDay(input.weekStartedOn);
  const weekEndedOn = exactReaderSummaryWeeklyUtcDay(input.weekEndedOn);
  if (new Date(`${weekStartedOn}T00:00:00.000Z`).getUTCDay() !== 1 || utcDateAfter(weekStartedOn, 6) !== weekEndedOn) {
    throw new Error("Reader summary weekly review authority must be Monday-Sunday");
  }
  const sealSha256 = exactReaderSummaryWeeklySha256(input.sealSha256, "weekly review seal hash");
  const sealId = exactReaderSummaryWeeklyIdentity(input.sealId, "weekly review seal id");
  if (sealId !== `reader_summary.weekly_certification_seal.v1:${sealSha256}`) throw new Error("Reader summary weekly review authority seal is invalid");
  assertReaderSummaryWeeklyDenseArray(input.days, "weekly review authority days");
  if (input.days.length !== 7) throw new Error("Reader summary weekly review authority requires exact 7/7 days");
  const days = input.days.map((day, index) => canonicalReviewAuthorityDay(day, utcDateAfter(weekStartedOn, index)));
  if (new Set(days.map((day) => day.publicationId)).size !== days.length) throw new Error("Reader summary weekly review authority publications are ambiguous");
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyReviewAuthoritySchemaVersion, sealId, sealSha256, tenantId, workspaceId,
    scope, scopeKey, weekStartedOn, weekEndedOn, days: days.map((day) => {
      const { providerEvidence, ...reviewAuthorityDay } = day;
      void providerEvidence;
      return reviewAuthorityDay;
    }),
  });
};

const canonicalReviewAuthorityDay = (input: ReaderSummaryWeeklyReviewAuthorityDay, expectedDate: string): ReaderSummaryWeeklyReviewAuthorityDay => {
  assertReaderSummaryWeeklyExactObject(input, authorityDayKeys, "weekly review authority day");
  const requestedUtcDate = exactReaderSummaryWeeklyUtcDay(input.requestedUtcDate);
  if (requestedUtcDate !== expectedDate) throw new Error("Reader summary weekly review authority day escaped the sealed window");
  const semanticStatus = exactSemanticStatus(input.semanticStatus);
  const githubMode = exactGithubMode(input.githubMode);
  assertReaderSummaryWeeklyDenseArray(input.providerEvidence, "weekly review provider evidence");
  const providerEvidence = input.providerEvidence.map((evidence) => canonicalAuthorityEvidence(evidence, requestedUtcDate)).sort(compareAuthorityEvidence);
  if (new Set(providerEvidence.map((evidence) => evidence.citationId)).size !== providerEvidence.length) throw new Error("Reader summary weekly review authority citations are ambiguous");
  if ((semanticStatus === "NO_SIGNAL" && providerEvidence.length !== 0) ||
      (semanticStatus === "COMPLETED" && providerEvidence.length === 0) ||
      (githubMode === "historical_unavailable" && providerEvidence.some((evidence) => evidence.providerKey === "github-trending-page"))) {
    throw new Error("Reader summary weekly review authority is not honest about provider evidence");
  }
  return deepFreezeReaderSummaryWeekly({
    requestedUtcDate, publicationId: exactReaderSummaryWeeklyIdentity(input.publicationId, "weekly review publication id"),
    publicationEvidenceIdentity: exactReaderSummaryWeeklyIdentity(input.publicationEvidenceIdentity, "weekly review publication evidence identity"),
    publicationEvidenceSha256: exactReaderSummaryWeeklySha256(input.publicationEvidenceSha256, "weekly review publication evidence hash"),
    providerEvidenceSha256: exactReaderSummaryWeeklySha256(input.providerEvidenceSha256, "weekly review provider evidence hash"),
    githubEvidenceSha256: exactReaderSummaryWeeklySha256(input.githubEvidenceSha256, "weekly review GitHub evidence hash"),
    semanticStatus, githubMode, providerEvidence,
  });
};

const canonicalAuthorityEvidence = (input: ReaderSummaryWeeklyReviewAuthorityEvidence, expectedDate: string): ReaderSummaryWeeklyReviewAuthorityEvidence => {
  assertReaderSummaryWeeklyExactObject(input, authorityEvidenceKeys, "weekly review provider evidence");
  if (!readerSummaryWeeklyCanonicalProviderKeys.includes(input.providerKey)) throw new Error("Reader summary weekly review provider is invalid");
  const publishedAt = exactReaderSummaryWeeklyUtcTimestamp(input.publishedAt, "weekly review provider publishedAt");
  const observedAt = exactReaderSummaryWeeklyUtcTimestamp(input.observedAt, "weekly review provider observedAt");
  if (observedAt.slice(0, 10) !== expectedDate || Date.parse(publishedAt) > Date.parse(observedAt)) {
    throw new Error("Reader summary weekly review provider evidence is outside its sealed day");
  }
  return deepFreezeReaderSummaryWeekly({
    providerKey: input.providerKey, citationId: exactReaderSummaryWeeklyIdentity(input.citationId, "weekly review citation id"),
    feedItemId: exactReaderSummaryWeeklyIdentity(input.feedItemId, "weekly review feed item id"),
    sourceItemId: exactReaderSummaryWeeklyIdentity(input.sourceItemId, "weekly review source item id"),
    sourceBindingId: exactReaderSummaryWeeklyIdentity(input.sourceBindingId, "weekly review source binding id"),
    providerItemId: exactReaderSummaryWeeklyIdentity(input.providerItemId, "weekly review provider item id"),
    canonicalUrl: exactHttpsUrl(input.canonicalUrl),
    sourceContentHash: exactReaderSummaryWeeklySha256(input.sourceContentHash, "weekly review source content hash"),
    publishedAt, observedAt, title: exactText(input.title, "weekly review title", 1_000),
    sourceText: exactText(input.sourceText, "weekly review source text", 20_000),
  });
};

const canonicalSelections = (input: readonly ReaderSummaryWeeklyReviewSelection[], candidates: readonly ReaderSummaryWeeklyReviewStoryCandidate[]): readonly ReaderSummaryWeeklyReviewSelection[] => {
  assertReaderSummaryWeeklyDenseArray(input, "weekly review selections");
  if ((candidates.length === 0 && input.length !== 0) || (candidates.length > 0 && input.length === 0)) throw new Error("Reader summary weekly review selections do not match sealed candidates");
  if (input.length > 64) throw new Error("Reader summary weekly review selections are not bounded");
  const candidateByStory = new Map(candidates.map((candidate) => [candidate.story, candidate]));
  const selections = input.map((selection) => {
    const label = exactReviewLabel(selection.label);
    const expectedKeys = label === "evolution" ? [...selectionBaseKeys, "beforeCitationSelector", "afterCitationSelector"] : label === "resolution" ? [...selectionBaseKeys, "terminalCitationSelector"] : selectionBaseKeys;
    assertReaderSummaryWeeklyExactObject(selection, expectedKeys, "weekly review selection");
    const story = exactStorySelector(selection.story);
    const candidate = candidateByStory.get(story);
    if (candidate === undefined) throw new Error("Reader summary weekly review selected an unknown story");
    assertReaderSummaryWeeklyDenseArray(selection.citationSelectors, "weekly review citation selectors");
    const citationSelectors = selection.citationSelectors.map(exactCitationSelector).sort(lexicalCompare);
    if (citationSelectors.length === 0 || citationSelectors.length > 7 || new Set(citationSelectors).size !== citationSelectors.length || citationSelectors.some((selector) => !candidate.citations.some((citation) => citation.selector === selector))) {
      throw new Error("Reader summary weekly review selected an invalid citation");
    }
    const common = { story, label, citationSelectors };
    if (label === "evolution") {
      const beforeCitationSelector = exactCitationSelector(selection.beforeCitationSelector);
      const afterCitationSelector = exactCitationSelector(selection.afterCitationSelector);
      const before = citationForSelector(candidate, beforeCitationSelector);
      const after = citationForSelector(candidate, afterCitationSelector);
      if (!citationSelectors.includes(beforeCitationSelector) || !citationSelectors.includes(afterCitationSelector) || before.requestedUtcDate >= after.requestedUtcDate) throw new Error("Reader summary weekly review evolution requires before and after citations on different dates");
      return deepFreezeReaderSummaryWeekly({ ...common, beforeCitationSelector, afterCitationSelector });
    }
    if (label === "resolution") {
      const terminalCitationSelector = exactCitationSelector(selection.terminalCitationSelector);
      const terminal = citationForSelector(candidate, terminalCitationSelector);
      if (!citationSelectors.includes(terminalCitationSelector) || citationSelectors.some((selector) => citationForSelector(candidate, selector).requestedUtcDate > terminal.requestedUtcDate)) throw new Error("Reader summary weekly review resolution requires its latest terminal citation");
      return deepFreezeReaderSummaryWeekly({ ...common, terminalCitationSelector });
    }
    return deepFreezeReaderSummaryWeekly(common);
  });
  if (new Set(selections.map((selection) => selection.story)).size !== selections.length) throw new Error("Reader summary weekly review cannot duplicate a story selection");
  return deepFreezeReaderSummaryWeekly(selections.sort((left, right) => lexicalCompare(left.story, right.story)));
};

const reviewedCitations = (selections: readonly ReaderSummaryWeeklyReviewSelection[], candidates: readonly ReaderSummaryWeeklyReviewStoryCandidate[]): readonly ReaderSummaryWeeklyReviewedCitation[] => {
  const candidateByStory = new Map(candidates.map((candidate) => [candidate.story, candidate]));
  const citations = selections.flatMap((selection) => {
    const candidate = candidateByStory.get(selection.story);
    if (candidate === undefined) throw new Error("Reader summary weekly review story candidate disappeared");
    return selection.citationSelectors.map((selector) => {
      const citation = citationForSelector(candidate, selector);
      return deepFreezeReaderSummaryWeekly({
        selector, storyId: candidate.storyId, requestedUtcDate: citation.requestedUtcDate, publicationId: citation.publicationId,
        publicationEvidenceIdentity: citation.publicationEvidenceIdentity, publicationEvidenceSha256: citation.publicationEvidenceSha256,
        providerKey: citation.providerKey, citationId: citation.citationId, sourceItemId: citation.sourceItemId, sourceContentHash: citation.sourceContentHash,
      });
    });
  });
  return deepFreezeReaderSummaryWeekly(citations.sort(compareReviewedCitation));
};

const reviewedObservations = (selections: readonly ReaderSummaryWeeklyReviewSelection[], citations: readonly ReaderSummaryWeeklyReviewedCitation[], candidates: readonly ReaderSummaryWeeklyReviewStoryCandidate[]): readonly ReaderSummaryWeeklyReviewedObservation[] => {
  const candidateByStory = new Map(candidates.map((candidate) => [candidate.story, candidate]));
  const citationSelectors = new Set(citations.map((citation) => citation.selector));
  const observations = selections.map((selection) => {
    const candidate = candidateByStory.get(selection.story);
    if (candidate === undefined || selection.citationSelectors.some((selector) => !citationSelectors.has(selector))) throw new Error("Reader summary weekly review observation citation binding is invalid");
    return deepFreezeReaderSummaryWeekly({
      storyId: candidate.storyId, story: selection.story, label: selection.label, citationSelectors: selection.citationSelectors,
      ...(selection.beforeCitationSelector === undefined ? {} : { beforeCitationSelector: selection.beforeCitationSelector }),
      ...(selection.afterCitationSelector === undefined ? {} : { afterCitationSelector: selection.afterCitationSelector }),
      ...(selection.terminalCitationSelector === undefined ? {} : { terminalCitationSelector: selection.terminalCitationSelector }),
    });
  });
  return deepFreezeReaderSummaryWeekly(observations);
};

const canonicalExecutionAttestation = (input: ReaderSummaryWeeklyReviewExecutionAttestation, modelResponseSha256: string): ReaderSummaryWeeklyReviewExecutionAttestation => {
  assertReaderSummaryWeeklyExactObject(input, ["schemaVersion", "requestId", "purpose", "canonicalRequestSha256", "provider", "model", "reasoningEffort", "runtimeEngine", "runtimePackageVersion", "launcherSha256", "selectedOutputKind", "selectedOutputSha256"], "weekly review execution attestation", { allowAuthoritativeHashes: true });
  if (input.schemaVersion !== 1 || input.purpose !== "social_monitor.reader_summary.weekly.review" || input.provider !== "codex" || input.model !== "gpt-5.6-sol" || input.reasoningEffort !== "xhigh" || input.runtimeEngine !== "subscription-runtime-cli" || input.selectedOutputKind !== "structured_output" || exactReaderSummaryWeeklySha256(input.selectedOutputSha256, "weekly review selected output hash") !== modelResponseSha256) {
    throw new Error("Reader summary weekly review execution attestation is invalid");
  }
  return deepFreezeReaderSummaryWeekly({
    schemaVersion: 1, requestId: exactReaderSummaryWeeklyIdentity(input.requestId, "weekly review request id"), purpose: input.purpose,
    canonicalRequestSha256: exactReaderSummaryWeeklySha256(input.canonicalRequestSha256, "weekly review canonical request hash"),
    provider: input.provider, model: input.model, reasoningEffort: input.reasoningEffort, runtimeEngine: input.runtimeEngine,
    runtimePackageVersion: exactText(input.runtimePackageVersion, "weekly review runtime package version", 256),
    launcherSha256: exactReaderSummaryWeeklySha256(input.launcherSha256, "weekly review launcher hash"),
    selectedOutputKind: input.selectedOutputKind, selectedOutputSha256: modelResponseSha256,
  });
};

const assertUniqueStoryDates = (citations: readonly ReaderSummaryWeeklyReviewedCitation[]): void => {
  const keys = citations.map((citation) => `${citation.storyId}\u0000${citation.requestedUtcDate}`);
  if (new Set(keys).size !== keys.length) throw new Error("Reader summary weekly review cannot duplicate a story on one date");
};
const citationForSelector = (candidate: ReaderSummaryWeeklyReviewStoryCandidate, selector: string): ReaderSummaryWeeklyReviewCitationCandidate => {
  const matches = candidate.citations.filter((citation) => citation.selector === selector);
  if (matches.length !== 1 || matches[0] === undefined) throw new Error("Reader summary weekly review citation selector is not unique");
  return matches[0];
};
const exactReviewLabel = (input: unknown): ReaderSummaryWeeklyReviewLabel => {
  if (input === "observation" || input === "evolution" || input === "resolution") return input;
  throw new Error("Reader summary weekly review label is invalid");
};
const exactStorySelector = (input: unknown): string => exactSelector(input, /^story:[0-9a-f]{64}$/u, "story");
const exactCitationSelector = (input: unknown): string => exactSelector(input, /^citation:[0-9a-f]{64}$/u, "citation");
const exactSelector = (input: unknown, expression: RegExp, kind: string): string => {
  const value = exactReaderSummaryWeeklyIdentity(input, `weekly review ${kind} selector`);
  if (!expression.test(value)) throw new Error(`Reader summary weekly review ${kind} selector is invalid`);
  return value;
};
const exactSemanticStatus = (input: unknown): "COMPLETED" | "NO_SIGNAL" => {
  if (input === "COMPLETED" || input === "NO_SIGNAL") return input;
  throw new Error("Reader summary weekly review status is invalid");
};
const exactGithubMode = (input: unknown): ReaderSummaryWeeklyReviewAuthorityDay["githubMode"] => {
  if (input === "verified" || input === "ordinary_not_required" || input === "historical_unavailable") return input;
  throw new Error("Reader summary weekly review GitHub mode is invalid");
};
const exactHttpsUrl = (input: unknown): string => {
  const value = exactReaderSummaryWeeklyIdentity(input, "weekly review canonical URL");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Reader summary weekly review canonical URL is invalid"); }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "" || parsed.hostname.length === 0 || parsed.href !== value) throw new Error("Reader summary weekly review canonical URL is invalid");
  return value;
};
const exactText = (input: unknown, label: string, maxLength: number): string => {
  if (typeof input !== "string" || input.trim().length === 0 || input.length > maxLength) throw new Error(`Reader summary ${label} is invalid`);
  return input;
};
const utcDateAfter = (date: string, offset: number): string => new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const cloneReviewScope = (scope: ReaderSummaryWeeklyManifestScope): ReaderSummaryWeeklyManifestScope => scope.type === "workspace" ? { type: "workspace" } : { type: "interest", interestId: scope.interestId };
const compareAuthorityEvidence = (left: ReaderSummaryWeeklyReviewAuthorityEvidence, right: ReaderSummaryWeeklyReviewAuthorityEvidence): number => readerSummaryWeeklyCanonicalProviderKeys.indexOf(left.providerKey) - readerSummaryWeeklyCanonicalProviderKeys.indexOf(right.providerKey) || lexicalCompare(left.sourceItemId, right.sourceItemId) || lexicalCompare(left.citationId, right.citationId);
const compareCandidateCitation = (left: ReaderSummaryWeeklyReviewCitationCandidate, right: ReaderSummaryWeeklyReviewCitationCandidate): number => lexicalCompare(left.requestedUtcDate, right.requestedUtcDate) || readerSummaryWeeklyCanonicalProviderKeys.indexOf(left.providerKey) - readerSummaryWeeklyCanonicalProviderKeys.indexOf(right.providerKey) || lexicalCompare(left.selector, right.selector);
const compareReviewedCitation = (left: ReaderSummaryWeeklyReviewedCitation, right: ReaderSummaryWeeklyReviewedCitation): number => lexicalCompare(left.storyId, right.storyId) || lexicalCompare(left.requestedUtcDate, right.requestedUtcDate) || lexicalCompare(left.selector, right.selector);
const lexicalCompare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
export const readerSummaryWeeklyReviewStoryIdentityPrefix = `${readerSummaryWeeklyStoryIdentitySchemaVersion}:` as const;
