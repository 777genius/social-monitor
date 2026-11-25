# Sep24 private input publication and trusted admission

The operator entrypoint is `ts-node -P tsconfig.build.json -r tsconfig-paths/register scripts/materialize-social-sep24-private-inputs.ts --output-root NEW_ABSOLUTE_DIRECTORY`.
It uses `SOCIAL_SEP24_PRIVATE_INPUT_DATABASE_URL` through the existing pg scoped-reader composition.
This document is a contract, not permission to run it against a real database.
Only tenant `00000000-0000-7000-8000-000000006101`, workspace `00000000-0000-7000-8000-000000006102`, Reddit/RSS and September 24, 2026 UTC are supported.

One bounded readonly REPEATABLE READ transaction checks nondeleted tenant/workspace ownership,
ENABLED nondeleted scoped interests/bindings, exact catalog providers, exactly one matching policy
and the binding's exact capability profile version. It uses transaction-local scope, system access false
and bounded connection/query/statement/lock/idle timeouts. No credential tables/resolvers, provider calls,
tenant sysadmin scope or mutations are reachable. Checked-out client and idle pool connection errors
are absorbed and refuse publication without raw diagnostics. Policy pins include the actual ID, interval,
freshness, retry budget and full stored `nextRunAt` text, preserving submillisecond precision.
Capability config is pinned unchanged; known boolean capability declarations such as
`requiresCredentials` are metadata, while credential values/references/envelopes are refused.

Stored JSON values, query whitespace and array ordering survive unchanged. The DB returns JSON text;
numeric source tokens must retain their exact decimal value when serialized by JavaScript. Unsupported
precision, unsafe integers, negative zero and unavailable JSON source-token support fail closed.
Reddit uses exactly one
`{sourceBindingId,config}` entry and 1–48 supported passes. RSS uses `{scope,bindings}`, five actual
scope IDs and one ENABLED binding with the consumer's exact six config fields. It preserves 24 extra
URLs and 25 distinct originals, checks the consumer's bounded historical expansion (at most 36),
and refuses requests exceeding 16384 UTF8 bytes. Requests use pretty JSON plus one newline.
Unsupported/protected, credential-bearing, unsafe URL or unbounded configuration is refused,
never sanitized, default-filled or rewritten into another private request.

Linux `/proc/self/fd` directory anchors, O_DIRECTORY/O_NOFOLLOW/O_EXCL and inode/device/owner/mode
checks protect traversal, exclusive publication and reopening. Ancestry must be owned by root or
the process owner without group/other writes; root-owned sticky temporary directories are allowed.
The new directory is outside the worktree, owned 0700; regular single-link files are 0400.
Files, directory and parent are synced; `manifest.json` is created last and exclusively, pinning
the private full snapshot and exact request file hashes/inodes. No overwrite, reuse or cleanup occurs.
Failures retain data. The marker's original writable descriptor stays open through sync/close checks
so failures can invalidate it without changing file permissions. Persistent filesystem failure can
prevent invalidation; a marker alone is therefore **never** publication/admission authority.

`materializeSocialSep24PrivateInputs` returns a private, process-local successful commit capability
only after all writes, reopens, syncs and closes succeed. `admitSocialSep24PrivateInputs` requires
that exact capability, reopens committed files through verified descriptors/exact hashes, compares
the unchanged request to its snapshot, then repeats scoped DB eligibility and every config/query/
policy/capability pin. Any drift, including `nextRunAt`, rejects. Repeating it after capture leaves
already retained results ineligible if scope changed. Receipt copies, copied manifests and restarted
processes cannot manufacture a successful commit capability.

An accepted capture composition must hold an **external approved scope fence** throughout admission,
reservation, every provider request and the postcapture drift check. Snapshot/recheck does not prevent
concurrent scope edits or ABA changes; proc-fd checks do not exclude malicious root/same-UID actors.
Actual exporter ONCE reservation must precede its first provider request in that separate composition.
This CLI invokes neither exporter and provides no capture/reservation/import authority. Its public
receipt contains only opaque identity, provider/pass/feed counts and materialized true, collected false,
imported false. It intentionally emits neither private pins nor a transferable admission capability.

**Missing bounded integration:** existing exporters do not invoke this admission API or enforce the
external fence/ONCE reservation. The separate capture producer must compose the typed materializer
and admission in one trusted process; cross-process admission would need a separately approved trusted
publication handoff. Exporters, collectors, Prisma, runtime, packages, summary/cutoff/capture code are untouched.
The Dockerfile explicitly copies this CLI, both source exporters, diagnostic and their complete script
closure. Recipe staging/module-load/invalid-CLI checks use existing pinned dependencies and network/DB
fakes; they prove source packaging only. No image build or actual Docker/network-none image proof was run;
existing image 999f does not qualify this code. No actual private input materialization, capture or import
was performed. Original UTC16 UNKNOWN remains permanently consumed; do not replay it or infer no effects.
