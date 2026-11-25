# API release with collection running and compact summary inputs

Status: implementation plan; no implementation, deployment or model execution is claimed.

## Scope and acceptance

Implement two bounded changes:

1. Keep automatic collection and the summary credential watchdog running during the existing migration-free, API-only Hetzner release.
2. Remove a duplicated preview from a model request only when the exact preview string already occurs in the actual source content sent in that request.

Do not run or enqueue a real summary, change model/account availability, change ranking/input selection, remove source information, introduce dependencies, or extend this controller to frontend/pipeline deployment. Deployment must report separately which executable components received the fix. The existing authorization to deploy does not permit bypassing independent compatibility/schema gates.

## Verified starting points

- `ops/release/hetzner/host.py:Host.snapshot` currently inventories every container in the configured Compose project plus `required_non_targets`, and requires every `fenced_units` entry to be inactive and disabled/masked.
- `contract.py` and installer validation in `install.py` both reject an empty `fenced_units` list.
- The controller deploys only API, never runs Prisma migration, and retains exact migration/schema/shared-worker compatibility checks.
- On Hetzner, `social-monitor-posts-auto-current` creates a temporary Compose `collection` one-off in project `platform-social-monitor`. Its lifecycle changes the current snapshot even though the API release does not own it.
- `social-monitor-summary-credential-reconcile` enforces expiry/revocation of the finite summary role; it does not modify release Compose/env files or recreate Docker containers. Keep this watchdog enabled.
- `openai-responses-reader-summary-adaptive-evidence.ts:promptEvidenceItem` can send both `bodyPreview` and `sourceContent`. The editor derives its sources from the same ordinary evidence representation as the writer.
- The installed release Python modules/config and the separately installed summary image are deployment surfaces. Merging the repository alone changes neither.

## 1. Remove the unnecessary release fence

In `contract.py` and `install.py`, accept `fenced_units: []` while preserving type/name validation for nonempty lists. Keep the existing enforcement for any units explicitly configured in other installations. Do not remove this field or add new modes.

Remove only the four proven irrelevant entries from the production root configuration: posts-auto timer/service and credential-reconcile timer/service. Preserve every other config value, file permission and trust check. Do not stop, disable or mask any of these tasks.

In `Host.snapshot`, omit only the transient one-off matching all three labels:

- project equals the configured production Compose project;
- service equals `collection`;
- Compose one-off label denotes true (handle Docker Compose's actual `True` spelling).

Explicit `required_non_targets` take precedence over this omission. API and every other non-target retain the exact existing ID/image/StartedAt/running checks. A normal long-lived `collection` container, a different project/service, a missing/false one-off label, or a protected selector must not become invisible.

Handle the actual `--rm` race: classify project/service/one-off from the bounded Docker `ps` listing before inspecting retained IDs, so an omitted collection container can disappear between listing and inspection. Do not swallow a general `docker inspect` failure; a disappeared protected container must still fail the snapshot. Explicit required selectors are inspected and validated regardless of listing classification. Adapt the current Docker fake/fixtures to the actual command shape rather than adding a generic retry layer.

Keep migration inventory, shared-worker compatibility, backup, Compose/private input identity, release authority, latch, rollback and readiness gates intact. The change permits an independently owned temporary collection container; it does not permit arbitrary environment drift.

## 2. Remove duplicated preview bytes

Inside the existing adaptive evidence serializer, compute the current preview and the final hydrated `sourceContent` once. Omit `bodyPreview` only if its nonempty exact string is contained in `sourceContent.text`, or wholly inside one of the transmitted fragments. Use literal matching on strings actually sent; no whitespace/case normalization, substring approximation or source-before-truncation checks.

Retain preview when sourceContent is absent, preview is absent from the transmitted text, only part is included, or its characters span separate fragments. Preserve sourceContent, title, source references, metrics, qualification/context fields, hydration/truncation limits and source snapshots. No changes to source counts or the editor/writer split.

Use the same serializer for editor and writer. Actual request/payload hashes must continue to bind the changed prompt bytes. Do not clear persisted Jev assessments or introduce another cache. Report removed serialized bytes from synthetic examples, not a claimed token percentage or subscription saving.

## 3. Focused checks

Run checks in a TEST/disposable environment, without real project model requests:

- Release configuration: empty fence accepted by runtime and installer; malformed entries still denied; nonempty fence still enforces its state.
- Snapshot: temporary collection present/absent or removed between list/inspect is allowed; wrong/missing labels remain tracked; explicit protected selectors cannot be omitted; Jev/X/API replacement or restart still has the previous semantics. Listing/inspection failure for retained containers remains a failure.
- Existing controller tests retain unchanged-scope, migration/schema, backup, rollback and readiness rejection cases.
- Prompt: full short text containing preview drops only preview; fragments containing it do likewise; partial/different/absent text preserves it; Unicode, whitespace and truncated text examples lose no unique source characters. Editor and writer receive the resulting evidence and receipt/hash tests bind their actual bytes.
- Run affected Jest prompt/editor/source-hydration specs and the existing Python entrypoint: `node_modules/.cicd-tools/release-python/bin/python3 -B -m unittest discover -s ops/release/hetzner -p '*_test.py' -v`. Add the transient-container scenario to the existing disposable Docker release fixture if its current coverage does not exercise the actual listing labels/lifecycle. Do not create a new E2E framework. Run applicable architecture/code-quality/source-line-cap gates from CLAUDE.md and mandatory exact-commit CI before merge. The existing CI covers unchanged TypeScript release/workflow checks; repeat them locally only when implementation touches those surfaces or a failure warrants it.

## 4. Delivery and verification without summary generation

1. Review the bounded diff and pass focused checks; merge through the existing PR/CI process.
2. Verify current host identity and trusted installation/config. `install.py:install` is bootstrap-only: it refuses an existing account/code/state and must not be rerun or worked around by deleting them. For the existing installation prepare one finite, reviewed operator update of the affected Python modules and the four-entry root config edit: verify expected old hashes and no unfinished release transaction/latch, retain rollback copies, stage exact new bytes under root ownership, and replace only those files. Preserve private config fields, file trust/modes, existing state, admissions and receipts. The C executor and Python environment do not change; do not rebuild/reinstall them. If a state record is incompatible with the new snapshot semantics, retain it and use a fresh admitted release; never erase old evidence to make a retry pass.
3. Verify both timer enablement/activity states remain as before. Observe live collection lifecycle read-only where available; never start a duplicate collector merely to demonstrate this release behavior.
4. Run the normal GitHub preflight once and retain its run/result. A failure on a different existing gate is a distinct blocker, not permission to bypass it or claim rollout success.
5. The release-fence fix executes in the host operator, so installing it and passing preflight do not themselves require an API restart. If an API rollout is needed for an actual changed consumer and compatible, use the existing release workflow and verify image revision, readiness and terminal receipt. Do not force an unrelated larger API rollout solely to demonstrate the operator fix. No frontend changes are needed for this scope; do not claim a frontend rollout.
6. Deliver the prompt code to the separately used summary execution image/path using its supported procedure. Verify installed source/image revision and deterministic prompt fixture behavior with the same built artifact. Do not invoke `summary-run.sh`, request/enqueue a summary, or run a fixture that uses real gateway/model transport. Preserve all data/artifacts/credentials and current account states.
7. If the existing controller rejects the current API delta or the summary execution image lacks a supported safe update path, stop that component's rollout and state the exact blocker; report code merged, release operator updated, API deployed and summary executable updated as separate facts. Do not widen scope into a new deployment platform to make this small fix pass.

Completion requires both fixes verified in code and installed on their relevant execution paths, with collection/watchdog still enabled. A real generated summary is intentionally unverified until the owner requests one; do not label synthetic model output as live E2E.

## Review record

### Round 1: correctness and operational risk

Completed against `host.py`, runtime/installer validation, controller tests, adaptive evidence serializer and bootstrap installer. Corrected two implementation hazards in the draft:

- Filtering only after `inspect` would still fail when an auto-removed collection container vanished after `ps`. The plan now requires pre-inspection classification and keeps failures for protected containers.
- The existing installer is bootstrap-only, not an update command. The plan now specifies a finite update of exact reviewed files with old-hash/state checks and rollback copies, without recreation of the account, interpreter or durable state.

Also made explicit that source metadata/hashes remain authoritative, actual prompt receipts change with request bytes, and no live summary is part of verification.

### Round 2: simplicity and scope

Completed by rereading the whole plan against the actual changed execution boundaries and existing test entrypoints. Removed unconditional local reruns of unchanged TypeScript workflow suites; mandatory CI still covers them. Clarified that the host-operator fix does not require restarting API and that a larger incompatible API delta must not be dragged into this small task. Prompt deployment remains a separate relevant execution surface, rather than pretending an API/operator update also changes the summary image.

Kept the implementation local: one exact collection exception, existing fence config allowed empty, one literal preview-coverage condition, existing test fixtures and one finite operator update. No feature flag, model fallback, new cache, new dependency, scheduler, stop/resume protocol or permanent updater is needed. No unresolved design choice requires user confirmation before implementation; deployment may still expose existing external compatibility constraints, which must be reported precisely.
