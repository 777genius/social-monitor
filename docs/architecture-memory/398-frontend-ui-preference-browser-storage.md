# 398 - Frontend UI Preference Browser Storage

## Status

Accepted, 2026-10-31. First and only approved exception to the frontend rule
"cache is in-memory by default; persistence requires an ADR and an
architecture-test exception" (`.claude/rules/flutter-frontend-quality.md`,
`apps/frontend/AGENTS.md`).

## Problem

The daily reader summary gets a "By model" / "By likes" order switch for the
Top posts block. The reader expects the choice to survive a page reload. The
frontend had no approved persistent storage: no UI preference was persisted
(the theme mode controller is in-memory too), and the architecture test only
blocked persistent cache packages, not raw browser storage.

## Decision

1. **One value, one key.** The browser remembers exactly one UI preference:
   the Top posts sort order, under the per-origin key
   `social_monitor.summaries.top_posts_sort_order.v1` with the code
   `model_rank` or `engagement`. Any other value reads as "nothing saved" and
   falls back to the model order.
2. **Narrow port.** `TopPostsSortPreferenceStore`
   (`features/summaries/lib/src/application/contracts/`) is the only contract.
   It is synchronous so the first frame after a reload already shows the saved
   order, and best effort: missing, blocked or full storage means `load()`
   returns `null` and `save()` does nothing; neither throws.
3. **Implementation.** `BrowserTopPostsSortPreferenceStore`
   (`features/summaries/lib/src/infrastructure/storage/`) encodes the value.
   Raw access lives in one file,
   `infrastructure/storage/browser_preference_storage_web.dart`, through the
   SDK `dart:js_interop` binding to `localStorage`, selected by a conditional
   export; the VM/native stub remembers nothing.
4. **No new dependency.** `dart:js_interop` is an SDK library already used by
   the app bootstrap (`early_app_bootstrap_web.dart`). Rejected options:
   - `shared_preferences`: async init (one frame in the default order, or
     bootstrap plumbing), a platform plugin for one enum, and it is the package
     the architecture test treats as "persistent cache by default".
   - `package:web` (latest stable 1.1.2, 2026-10-23; 1.1.1 is already resolved
     transitively): fine, but a new direct dependency for two methods.
5. **Not workspace scoped, deliberately.** The value is a reader UI
   preference, not tenant data: the same reader expects the same order on the
   workspace page and on the guest daily summary, and nothing of a workspace
   can leak through an enum code.

## Data Classification

Allowed by `apps/frontend/docs/frontend-security-privacy-policy.md` (Local
Storage Policy: UI preferences). Stored: one enum code. Never stored: tenant,
workspace or user ids, provider content, metrics, tokens or credentials.

## Enforcement

`apps/frontend/app/test/architecture/support/frontend_browser_storage_architecture_test_cases.dart`:

- `localStorage`, `sessionStorage` or `indexedDB` in any frontend `lib/` file
  outside `_approvedBrowserStorageFiles` fails;
- `dart:html`, `dart:js`, `dart:js_util`, `dart:js_interop`,
  `dart:js_interop_unsafe` or `package:web` imports in feature `lib/` files
  outside the allowlist fail;
- only `features/summaries/lib/src/infrastructure/storage/` may import the
  browser storage data source;
- every allowlisted file must exist and cite an existing ADR.

The existing persistent cache package gate (`shared_preferences`, `hive`,
`drift`, ...) stays unchanged.

## Growth Trigger

A second persisted UI preference (for example theme mode or the dense list
view) does not get a second ad hoc file. Extract a shared
`UiPreferenceStorage` contract with the browser data source into a shared
package with one owner, amend this ADR and the allowlist, and migrate this key
behind it. Native (iOS/Android) persistence needs its own decision; until then
native builds remember nothing, which is safe.

## Rollback

Remove the switch and the allowlist entry; the stale key is ignored by
everyone. A new value format gets a new `.v2` key instead of a migration.
