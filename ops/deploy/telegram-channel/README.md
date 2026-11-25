# hiaimediaen production collection

The public homepage reads the shared AI Developer Signal scope: tenant6101,
workspace6102, interest6105 (full UUIDs are in the typed runner contract).
The persisted `source_bindings` and `scan_policies` select what is collected;
the catalog alone does not enable collection. This runner accepts only that
scope and the public `hiaimediaen` channel. No Telegram account, bot or API token
is used. Collection writes the normal source/feed rows, cursor and scan history.

`npm run run:telegram-channel-collection` inspects existing configuration without
creating it. `--bootstrap` idempotently registers the canonical Telegram catalog
and capability profile and uses the normal binding/policy use cases. It refuses
an incompatible existing binding or policy. Bootstrap requires the existing
source-config encryption interface even though this fixed public config has no
secret fields. `--collect` performs one bounded live scan and exits.

The desired policy is hourly, with a 24-hour initial window, up to five pages
and50 accepted items per invocation. Pending pagination is retained in the
normal durable cursor. The result distinguishes incomplete collection/content
from operational execution failure. A provider fetch failure before any items
return is recorded as deferred only after durable failure reporting and an
unchanged cursor; the native terminal proof also requires unchanged row counts.
Failures after fetching or uncertain database/cleanup effects remain blocking
and require native reconciliation. Repeated scans preserve existing item IDs
and do not insert duplicate feed entries.

`complete` describes traversal of the requested ID/time range. Scan execution
metadata separately records `contentComplete`; each retained post also carries
native-content completeness. Captions do not imply that media bytes were captured.
Captionless posts retain their identity and canonical link with an empty body,
without invented text. Content warnings from posts outside the range or at the
saved watermark do not degrade the current scan.

## Deployment boundary

These files are preparation, not evidence that production is enabled. Follow
the native admission contract before installing anything. The complete reviewed
change includes router/history dispatch and every dependent source pin. An
OPEN-only patch must never be installed.

Use one CI-built immutable backend image for both the one-time binding bootstrap
and recurring collection. No API/frontend rollout or schema migration is needed.
Bind the image ID, reviewed source commit/tree and bootstrap-returned binding and
policy IDs into the fixed root-owned release manifest. Do not create another
database writer role or change the existing source/feed guard.

The finite Type=exec service invokes the existing native router. Its timer runs
at minute17 each hour, avoiding the four-hour slot boundary. The same global
nonblocking lock serializes it with imports and other source scans. A busy lock
skips that invocation; no parallel catch-up loop is started. Native admission
also requires the main auto-current owner to be quiet and no pending systemd
jobs. The independent native watchdog closes the existing generation role and
removes the exact per-attempt container if the launcher disappears.

`prepare-native-bundle.ts` produces the fixed source bundle offline from exact
retained preimages. `install-native-bundle.py` takes that reviewed root-private
bundle, obtains the existing global lock and native admission, verifies every
preimage, installs the complete cascade with rollback, and verifies the resulting
native admission. It checks that the new units are inactive and not enabled.
It does not start collection. The one-time `bootstrap-binding.sh IMAGE COMMIT TREE`
uses the verified image and existing PostgreSQL peer socket with no network or
password copies; its independent container watchdog survives the SSH session.
The image/commit/tree arguments must come from the verified CI artifact and Git
tree comparison. This command writes the validated release manifest from normal
bootstrap output and preserves an existing matching manifest.

Install the full pin cascade only after the current import batch releases the
global lock. Recheck retained source hashes under that lock, stage and fsync all
outputs, retain exact preimages, and restore the entire cascade on failure.
Never publish partially updated pins. Keep the Telegram timer disabled until
one actual production canary proves native admission, cleanup, persisted cursor,
feed scope and repeat collection. Verify the existing five-provider route still
admits its own next run before enabling the Telegram timer.

## Isolated runtime proof

The existing collection role also needs column SELECT on the six public
`capability_profiles` fields used by normal catalog validation. The fixed
`qualify-catalog-read-profile.py` qualifies that read-only ACL delta once under
the native lock, with an expired/closed collector role and quiet services.
It preserves table-wide rights, writer admission, memberships and database
defaults. Its durable intent prevents automatic retry after an uncertain commit.
Require its successful receipt before the production canary; an intent alone
does not qualify access. Do not replay the older materializer read profile.
The optional `test_catalog_read_profile.py` PG18 suite requires a fresh disposable
cluster and a `telegram_catalog_read_profile_test_<suffix>` database. Its fixture
roles are cluster-global and retained for inspection; discard the entire test
cluster after the run. It proves atomic grants and rollback without production
credentials.

`scripts/check-telegram-channel-collection-postgres.ts` accepts only an explicit
literal-loopback PostgreSQL18 URL with database name
`telegram_collection_test_<suffix>`. The caller creates a fresh database and
applies the canonical Prisma schema there. The helper refuses a nonempty
fixture, seeds only the shared scope, then runs real inspect/bootstrap twice
and anonymous live Telegram collection twice. It checks cursor reuse, source/feed
identities, count deltas and persisted completeness. It reports
`nativeAuthorityQualified:false`: an isolated application test does not qualify
the production writer fence or pin installation.
