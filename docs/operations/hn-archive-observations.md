# Hacker News archive observations

The archive tools prepare missing-only packets; they do not write to the database or
authorize an import. Run them with Node 22 or newer from a private working directory.
The snapshot and every output can contain workspace identifiers or provider content:
keep the directory mode `0700` and input files mode `0600`.

The snapshot is one read-only, repeatable-read database observation with this shape:

```json
{"schemaVersion":1,"observedAt":"2026-01-01T00:00:00Z","scope":{"tenantId":"<uuid>","workspaceId":"<uuid>","interestId":"<uuid>","sourceBindingId":"<uuid>","scanPolicyId":"<uuid>"},"config":{},"existingIds":["hn:123"]}
```

Select the enabled HN binding, its enabled interest and scan policy, and all HN
`source_items.provider_item_id` values for the same tenant and workspace in that
transaction. More than 100,000 IDs is refused: do not silently truncate. The
snapshot hash and binding-config hash are retained in the reconciliation; the hash
does not independently authenticate how the snapshot was obtained. A snapshot can
become stale, so admission must recheck current source identities, feed keys and
the bound configuration immediately before any write.

For one closed UTC day, run:

```sh
npm run run:hn-archive-discovery -- /absolute/private/snapshot.json 2026-01-01 /absolute/private/reconciliation.json
npm run run:hn-archive-manifest -- /absolute/private/reconciliation.json /absolute/private/manifest.json
```

Strict discovery refuses a provider response that cannot establish coverage. If
best-effort observations are useful, append `--observed` to the discovery command.
That mode records `PARTIAL_ARCHIVED_OBSERVATIONS`, counts incomplete searches and
does not establish completeness, including when it finds no missing IDs. It uses
the configured search lanes and fetches comment content separately. A manifest
retains at most 200 comments per story and records omitted comments. It is only
published after all selected stories pass identity, timestamp and association checks.

Use the existing missing-only packet planner and production admission workflow for
any subsequent import. Their exact scope, source pins, collision checks, lock,
claim and receipt requirements remain authoritative; do not bypass them or replay
an attempt whose effects are uncertain.
