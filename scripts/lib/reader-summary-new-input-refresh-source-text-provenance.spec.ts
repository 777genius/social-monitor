import { reconciliationFixture } from "./reader-summary-refresh-reconciliation.spec-support";
import { FeedItem, type FeedItemProps } from "@social-monitor/feed/domain";
import { buildReaderPostPromotionTitle, readerPostAvailableSourceText } from "@social-monitor/summary/domain/services/reader-post-promotion-title";
import { publicationProbe } from "./reader-summary-new-input-refresh-model-composition.spec-support";
import { sourceContentAssessmentPurpose as purpose } from "./reader-summary-new-input-refresh-assessment-runtime";

const providers = ["x-twitter", "github-repo-radar", "github-trending-page"];
afterEach(() => jest.restoreAllMocks());

// Reused from the independent integrated-review probe, with rejection required.
it.each(providers)("rejects the independent sourceText-only bypass for %s", async (providerKey) => {
  canonicalProvider(providerKey);
  const test = await reconciliationFixture();
  const selection = await test.reconciliationSelection();
  const original = selection.selectedEvidence.find((item) => item.providerKey === providerKey)!;
  expect(original).toBeDefined();
  const replacement = "Unreviewed replacement: the compiler vendor removed all sandbox isolation guarantees.";
  const forgedItem = { ...original, sourceText: replacement };
  const forged = { ...selection,
    selectedEvidence: selection.selectedEvidence.map((item) => item === original ? forgedItem : item) };
  expect(() => test.assessment.assertComplete(test.preflight.assessmentCandidateCount, forged))
    .toThrow(/reconciliation/u);
  expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  expect(readerPostAvailableSourceText(forgedItem)).toContain(replacement);
  if (providerKey === "x-twitter") expect(buildReaderPostPromotionTitle({ lead: forgedItem })).toContain(replacement);
  const publication = publicationProbe(test.runtime, forged);
  await expect(publication.attempt()).rejects.toThrow(/reconciliation/u);
  expect(publication.publish).not.toHaveBeenCalled();
});

it.each(providers.flatMap((provider) => ["canonical", "sanitized", "truncated"].map((kind) => [provider, kind])))("accepts canonical %s %s source representation", async (providerKey, kind) => {
    canonicalProvider(providerKey, kind);
    const test = await reconciliationFixture();
    const selection = await test.reconciliationSelection();
    const item = selection.selectedEvidence.find((evidence) => evidence.providerKey === providerKey)!;
    const trusted = test.preflight.canonicalEvidence.find((evidence) => evidence.feedItemId === item.feedItemId)!;
    expect(item.sourceText).toBe(trusted.sourceText);
    expect(item.sourceText).toBeTruthy();
    if (kind === "sanitized") {
      expect(item.sourceText).not.toContain("synthetic-redaction-fixture");
      expect(item.sourceText).toContain("password=[REDACTED]");
    }
    const candidates = test.commands.filter((command) => command.purpose === purpose)
      .flatMap((command) => JSON.parse(command.prompt).candidates);
    if (providerKey === "x-twitter") {
      const assessed = candidates.find((candidate) => candidate.candidateId === item.feedItemId);
      expect(assessed.untrustedSource.bodyPreview).toBe(item.bodyPreview!.slice(0, 12_000));
      if (kind === "truncated") {
        expect(item.sourceText!.length).toBeGreaterThan(12_000);
        expect(assessed.evidenceAvailability).toBe("truncated");
      }
    } else expect(candidates.some((candidate) => candidate.candidateId === item.feedItemId)).toBe(false);
    const publication = publicationProbe(test.runtime, selection);
    await publication.attempt();
    expect(publication.publish).toHaveBeenCalledTimes(1);
    expect(() => test.runtime.assertUsable()).not.toThrow();
  });

it.each(providers.flatMap((provider) => ["tail", "removed", "snapshot mutation"].map((kind) => [provider, kind])))("rejects %s sourceText %s drift against the immutable snapshot", async (providerKey, kind) => {
    canonicalProvider(providerKey, "truncated");
    const test = await reconciliationFixture();
    const selection = await test.reconciliationSelection();
    const original = selection.selectedEvidence.find((item) => item.providerKey === providerKey)!;
    expect(original.sourceText!.length).toBeGreaterThan(12_000);
    const sourceText = kind === "removed" ? undefined : `${original.sourceText} Unreviewed tail claim.`;
    if (kind === "snapshot mutation") {
      const trusted = test.preflight.canonicalEvidence.find((item) => item.feedItemId === original.feedItemId)!;
      Object.assign(trusted, { sourceText });
      // Mutation cannot revoke acceptance of the original immutable representation.
      expect(() => test.assessment.assertComplete(test.preflight.assessmentCandidateCount, selection)).not.toThrow();
    }
    const forged = { ...selection, selectedEvidence: [{ ...original, sourceText }] };
    expect(() => test.assessment.assertComplete(test.preflight.assessmentCandidateCount, forged))
      .toThrow(/reconciliation/u);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
    const publication = publicationProbe(test.runtime, forged);
    await expect(publication.attempt()).rejects.toThrow(/reconciliation/u);
    expect(publication.publish).not.toHaveBeenCalled();
  });

function canonicalProvider(providerKey: string, kind = "canonical") {
  const publish = FeedItem.publish.bind(FeedItem);
  const providerInput = (input: FeedItemProps): FeedItemProps => input.id !== "synthetic-reddit" || providerKey === "x-twitter"
    ? input : { ...input, id: "synthetic-github", sourceItemId: "source-github", sourceBindingId: "binding-github",
      providerKey, canonicalUrl: "https://github.com/synthetic/compiler-tools",
      title: "Synthetic compiler tools for AI coding agents",
      bodyPreview: "A TypeScript compiler toolkit with documented interfaces for AI developer tools.",
      providerMetadata: providerKey === "github-repo-radar"
        ? { kind: "github_repository_trend", contentKind: "repository",
            repository: { fullName: "synthetic/compiler-tools", forksCount: 500 },
            trend: { primaryWindow: "24h", checkedAt: "2026-09-05T21:55:00.000Z",
              totalStars: 20_000, stars24h: 2_000, forks24h: 200 } }
        : { kind: "github_trending_page_repository",
            repository: { fullName: "synthetic/compiler-tools", totalStars: 20_000, forksCount: 500 },
            trending: { rank: 1, starsGained: 2_000, window: "daily" } },
    };

  jest.spyOn(FeedItem, "publish").mockImplementation((input) => {
    const canonical = providerInput(input);
    return publish(input.id.startsWith("synthetic-extra-") ? input : { ...canonical,
      bodyPreview: kind === "sanitized" ? `${canonical.bodyPreview}\n password=synthetic-redaction-fixture`
        : kind === "truncated" ? `${canonical.bodyPreview} `.repeat(160) : canonical.bodyPreview,
    });
  });
}
