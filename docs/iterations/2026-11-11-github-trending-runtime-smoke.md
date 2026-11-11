# GitHub Trending runtime smoke SRP extraction — 2026-11-11

## Pinned original scope
Base `main` commit `81eca6a156ca890545a3c7219a7d9e6788476731`; original checker Git blob `138032b9ff7fcbd896eeced4c6649312c87452b4`, 1049 physical lines.
Move only `verifyGitHubTrendingPageRuntime` (original body 3455 characters, 106 nonblank original body LOC) into a single isolated smoke helper. Unique original implementation LOC count is **106**, never net deleted LOC. No new store, service container, feature flag, production behavior, networking, auth, deployment, or SSH.

## Architecture and safety
Preserve CLI as sole orchestrator: contract validation → Reddit → Issues → repo radar → Trending → RSS → Hacker News. Inject existing mocked HTTP, provider-failure assertion, context factory and assertion function; preserve original function-body text and invocation timing. The extracted module owns only GitHub Trending client/provider constructors and metadata parsing. Keep strict host/path/language/headers, source metadata, HTTP error classifications, and fail-closed mock restoration. Remove legacy line-cap debt for the checker only once it is below the global 1000-line cap; never raise any other cap or skip existing gates.

## Review passes
1. **Behavioral:** compare original function body verbatim after removal of only the dependency adapter line; verify all request and metadata cases, runtime contract CLI and fake HTTP.
2. **Structural:** reject missing, dead, nested, duplicate, out-of-order and wrongly injected calls using TypeScript AST, not regex-only search; ensure helper is the sole implementation and no import-time effects.
3. **Security & concurrency:** preserve live mock interception, error-kind checks and real source-test gates. Keep #665 model adapter ownership and independent release PRs untouched, recheck main/PR HEAD and review markers before any write or merge.

## Acceptance gate
Original Draft Static/Security/Flutter + nonpublishing image, independent review, then Ready exact-head **20/20** jobs, expected-head-SHA squash merge and naturally triggered main **20/20**. Fix real defects and requalify any changed HEAD. No claim of success from queued or skipped jobs.
