# Release compatibility evidence for the 767 delta

The production API and intelligence worker were observed at revision
`5370589edec58f00826d7e0f532d27783143c8d2`, image
`sha256:6544efd2d3a7944018a5d8fdac04df63faf094a42a78cc23813b71456842e969`.
The reviewed candidate is `a9d5ab1115f10a93f4b6e56030e4fed5dc2f02a8`.
The complete recursive-tree delta contains 25 paths and hashes to
`sha256:72be6e61b147b72c6bfd338992fa0811a32795b5a913afb8113a48a37a899cc1`
using the release operator's canonical tree-entry format. The entries are
retained in `ops/release/hetzner/fixtures/review_767_delta.json`.

The backend Dockerfile only adds `scripts/lib/x-late-window.ts` to its existing
COPY list. Its Git blob changes from `ec1487f1442ddd7a965f924bc3a3f889eb857239`
to `cba26666aced8bc63f5f69a1a60cb5bb4990742c`. The package change adjusts an
architecture-check script. The release operator independently compares the
package documents, validates the unchanged build commands and hooks, and binds
this exact Dockerfile pair to the reviewed delta. It still rejects unreviewed
runtime or build changes in any continuation.

A separate reviewer found no migration, public API, frontend, or API/worker
runtime-module change in this delta. A read-only production check observed 112
completed migrations and no unrolled unfinished migration. These observations
are not a mixed-version runtime test. The X collector runs separately and its
short-window adapter behavior changes for requests below 24 hours; this cohort
does not replace that service. A separate X-collector rollout needs its own
compatibility evidence.

The failed release run `43703874547` retained the staged candidate but no
admission or activation receipt. Its public diagnostic hid the precise host
reason. The old package guard necessarily rejects the candidate's changed
Dockerfile when it reaches package validation; the retained record does not
establish whether that was the original failure's first rejected check.
