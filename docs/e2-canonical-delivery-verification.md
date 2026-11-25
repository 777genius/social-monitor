# PR333 exact-base correction verification

Ordinary Jest verifies the immutable fa6 baseline JSON seal, reconstructed Git
ls-tree seal, counts, shape and unique paths. The same spec continues exercising
actual canonical-coordinate, bounds, collision, ordering and amendment behavior.
It does not hash current application files against historical main. Later main
edits therefore require no baseline refresh. Earlier byte/mode claims about
ordinary tests in the fixture README and e2-canonical-proposed-compiler.md are
superseded here; those checks now belong to the dedicated delivery gate.

Historical delivery ownership has a separate, mandatory handoff command:

```sh
node scripts/check-e2-canonical-delivery.mjs /path/to/correction-checkout
node --test scripts/check-e2-canonical-delivery.test.mjs
```

Run the verifier from the independently reviewed correction source. Do not trust
a verifier substituted by the checkout being inspected. The checkout must have
Git objects for exact fdf2fc3efdcc69fcd6912a760ce66cccea7b60ea, its a519 parent
and fa6 historical main. Missing history fails; there is no environment bypass,
base override or skip-success path. Ordinary Jest still works without Git history.

The gate pins both historical parent edges, checks all 6318 historical tuples
against the exact Git tree and seals, and proves their preservation in fdf.
It compares the candidate tree and raw workspace bytes/modes against all 6377
fdf paths outside the four explicitly named correction files. This includes
original E2 delivery additions, compiler, SDK evidence and all main files.
Missing files, symlink/executable drift, blob drift, staged deletions/additions
and nonignored untracked additions outside ownership fail. Ignored local outputs
(such as node_modules and .cache/handoff) are not delivery inputs.

Only fdf with a reviewable working patch, or one direct mechanical correction
commit on fdf, is accepted. Extra commits, merges and unrelated history fail even
when their final trees look identical. All four correction files must exist as
regular non-executable files; after commit they must also exist in the Git tree.
Their content is the explicit review surface, not automatically approved by this
ownership gate. Parent owns content review, exact SHA verification and CI; rerun
this gate at that SHA. This bounded gate intentionally rejects future main and
is not wired into ordinary Jest or general future-main CI.

The Node test uses only its own temporary clone and existing dependencies. It
runs real ordinary Jest before/after an unrelated README edit, rejects corrupted
baseline representation, unauthorized E2 edits, missing/mode/symlink drift,
extra staged/untracked paths and unreviewed ancestry. It performs no provider,
auth, SDK installation, native database, GitHub or deployment operations.
