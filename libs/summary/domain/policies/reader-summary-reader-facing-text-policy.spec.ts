import {
  isConversationalOrTruncatedReaderTitle,
  isFallbackReaderReason,
  isReaderTitleReasonDuplicate,
  isUnpolishedReaderTitle,
  readerFacingEvidenceExcerpt,
} from "./reader-summary-reader-facing-text-policy";

describe("reader summary reader-facing text policy", () => {
  it("rejects low-information teaser titles", () => {
    expect(isUnpolishedReaderTitle("Check this out")).toBe(true);
    expect(isUnpolishedReaderTitle("Take a look!")).toBe(true);
    expect(
      isUnpolishedReaderTitle("Codex powers OpenAI's new work product"),
    ).toBe(false);
  });
  it("detects copied social hooks and truncated titles", () => {
    expect(
      isConversationalOrTruncatedReaderTitle(
        "X post by @builder: what happens when Fable spends all credits...",
      ),
    ).toBe(true);
    expect(
      isConversationalOrTruncatedReaderTitle(
        "OpenAI releases GPT-5.6 across ChatGPT and Codex",
      ),
    ).toBe(false);
    expect(
      isUnpolishedReaderTitle(
        "X post by @OpenAI: GPT-5.6 rolls out across ChatGPT and Codex",
      ),
    ).toBe(true);
    expect(isUnpolishedReaderTitle("Strong source engagement signal")).toBe(
      true,
    );
    expect(isUnpolishedReaderTitle("Current AI product discussion")).toBe(true);
    expect(
      isUnpolishedReaderTitle("Superhuman competitive programming AI is here"),
    ).toBe(true);
    expect(
      isUnpolishedReaderTitle(
        "Claude Sci just dropped, and it's got me thinking about Anthropic",
      ),
    ).toBe(true);
    expect(isUnpolishedReaderTitle("Keep going. No matter what.")).toBe(true);
  });

  it("detects technical and generated fallback reasons", () => {
    expect(isFallbackReaderReason("Source-reported: raw post text")).toBe(true);
    expect(
      isFallbackReaderReason(
        "Reddit discussion is a current signal for monitored AI developer topics; its claims remain source-reported until independently confirmed.",
      ),
    ).toBe(true);
    expect(
      isFallbackReaderReason(
        "Developers report that the update reduces repetitive setup work.",
      ),
    ).toBe(false);
    expect(isFallbackReaderReason("Appears across 2 monitored interests")).toBe(
      true,
    );
    expect(
      isFallbackReaderReason(
        "The discussion with 611 score, 86 comments, 91% upvoted adds user-experience and operational context that may not appear in the original announcement.",
      ),
    ).toBe(true);
    expect(
      isFallbackReaderReason(
        "The post with 9,171 likes is drawing enough attention to shape current discussion around monitored AI products and developer workflows.",
      ),
    ).toBe(true);
  });

  it("extracts only complete concrete evidence excerpts", () => {
    expect(
      readerFacingEvidenceExcerpt(
        "The release adds project-level memory for coding agents. Teams can keep context between sessions. https://example.com/source",
      ),
    ).toBe(
      "The release adds project-level memory for coding agents. Teams can keep context between sessions.",
    );
    expect(
      readerFacingEvidenceExcerpt(
        "The release adds project-level memory but this preview is cut off...",
      ),
    ).toBeUndefined();
    expect(readerFacingEvidenceExcerpt("Short source note.")).toBeUndefined();
    expect(
      readerFacingEvidenceExcerpt(
        "A source post discusses Claude Code tracking and current AI workflows.",
      ),
    ).toBeUndefined();
    expect(
      readerFacingEvidenceExcerpt(
        "AtCoder gathered top competitive programmers. Humans got completely cooked by AI.",
      ),
    ).toBeUndefined();
    expect(
      readerFacingEvidenceExcerpt(
        "Coding on the train, judged by strangers, locked tf in. Nothing else like public productivity.",
      ),
    ).toBeUndefined();
    expect(
      readerFacingEvidenceExcerpt(
        "The update records file, network and local-tool access before production permissions are granted.",
        "MCP server audit adds agent security telemetry",
      ),
    ).toBe(
      "The update records file, network and local-tool access before production permissions are granted.",
    );
    expect(
      readerFacingEvidenceExcerpt(
        "I built Context.dev (https://context.dev) to make structured web data easier for AI agents.",
      ),
    ).toBe(
      "I built Context.dev to make structured web data easier for AI agents.",
    );
  });

  it("detects duplicated title and reason text", () => {
    expect(
      isReaderTitleReasonDuplicate(
        "OpenAI starts rolling out GPT-5.6",
        "OpenAI starts rolling out GPT-5.6.",
      ),
    ).toBe(true);
    expect(
      isReaderTitleReasonDuplicate(
        "OpenAI starts rolling out GPT-5.6",
        "The rollout matters for long-running coding agents.",
      ),
    ).toBe(false);
    expect(
      isReaderTitleReasonDuplicate(
        "Half of Claude Code subscriptions could be wiped out tonight",
        "The X post reports: Half of Claude Code subscriptions could be wiped out tonight.",
      ),
    ).toBe(true);
    expect(
      isReaderTitleReasonDuplicate(
        "Claude Code sends 33k tokens before reading the prompt",
        "The Hacker News source says: Claude Code sends 33k tokens before reading the prompt.",
      ),
    ).toBe(true);
    expect(
      isReaderTitleReasonDuplicate(
        "Developers compare Claude and Codex on the same task",
        "The Reddit post states: Developers compare Claude and Codex on the same task.",
      ),
    ).toBe(true);
    expect(
      isReaderTitleReasonDuplicate(
        "Anthropic extends Fable access",
        "The report states: Anthropic extends Fable access. This matters because the access window changes team planning.",
      ),
    ).toBe(false);
  });
});
