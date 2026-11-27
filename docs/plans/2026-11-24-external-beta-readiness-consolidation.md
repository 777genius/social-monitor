# External beta readiness and evidence refactor

## Goal and scope

Continue in Draft PR #783, integrating #782 with both histories and all existing
tests preserved. Improve the evidence tooling boundaries and fix verified
admission gaps. Keep deployment, live provider calls, dependencies, production
data and the separately owned #793 runtime/TypeScript and #665 model work outside
this change. No original-LOC quota is claimed by this continuation.

## Priorities

| Priority | Work | Reason and boundary |
| --- | --- | --- |
| P0 | Integrate #782 into #783 | One review surface; retain main's #776/#781 tests and both PRs' policy checks. |
| P1 | Evidence path admission | Separate filesystem/Git/env admission from CLI output and job execution. Reject prohibited final symlink targets before loading env or invoking a producer. |
| P2 | Dry-run job admission | Reject duplicate plan/handoff identities and missing, non-string or blank operator actions. Keep policy validation independent of runner I/O. |
| P2 | Durable artifact smoke ownership | Move fixture construction and positive/negative durable runtime smokes out of the over-cap checker, then remove its exact legacy allowance. |

Estimated additional scope beyond the two existing PRs: 600–850 existing source
lines touched, including responsibility moves; approximately 400–700 test/support
lines added or moved. These estimates are not accepted legacy-refactor credit.
Complexity 5/10; initial regression risk 5/10; plan confidence 8/10. Reassess after
real subprocess tests and independent diff review.

## Boundaries and invariants

- CLI composition owns arguments, process environment, output and dispatch.
- Evidence path admission receives the live environment and contract plus explicit
  filesystem/Git operations and lazy cwd. It never launches an evidence job.
- Preflight permits a missing future output file; live admission checks the output
  destination before dispatch; artifact validation requires existing evidence and
  its content. Keep those three methods explicit rather than adding a mode engine.
- Existing valid output, violation order, run-live confirmation, no-credential
  blocking, manual-job restrictions and private fixture cleanup stay covered.
- Existing final symlinks must not hide workspace/fixture targets. Ordinary parent
  aliases such as macOS temporary directories remain valid. Missing destinations
  and dangling final symlinks are distinct cases.
- Dry-run plan/handoff checks must reject duplicate raw IDs before lookup Maps can
  conceal an earlier entry. Every raw plan job still receives its existing checks.
- Source markers follow the authoritative implementation module and retain a
  real caller-binding check. No marker-only comments or removed safety gates.
- No source/test cap increase, additional dependency or public API change.

## Critique decisions before implementation

1. Architecture review: the readiness and imported dry-run entrypoints are already
   thin; further small extractions there have little value. Prioritize the runner's
   filesystem admission seam and the remaining 1,022-line checker instead.
2. Independent safety review: reproduced missing operatorAction acceptance and
   duplicate handoff overwrite. Separately reproduced the live-output final-target
   realpath omission. Preserve valid behavior but fix these concrete fail-open
   conditions; do not add speculative generic argument guards.
3. Test review: retain the existing 997-line dry-run suite's assertions, sharing its
   isolated CLI fixture if needed. Exercise new failures through the real checker
   entrypoint, not only helper calls. Check cleanup on failed child execution and
   relocation of source ownership markers.

## Evidence and completion

The consolidation baseline passed 65 focused policy and CLI subprocess tests on
Node 24.22.3. It preserves 28 architecture command segments and adds #782's test
segment; baseline green results do not qualify subsequent changes.

Required final local evidence: affected policy and filesystem tests; actual
readiness, dry-run and evidence-runner commands; architecture, code-quality and
source-line-cap checks. Use deterministic disposable fixtures only. Run canonical
nonpublishing CI on the final source revision where supported, and report actual
results separately from local checks. Queued, skipped or cancelled jobs are never
PASS. Draft status remains as requested; no merge or production deployment is part
of this continuation. Existing security exceptions/holds are not widened here.

Independent final review must check the integrated diff, all new admissions,
module wiring, duplicate diagnostics, missing-path behavior, symlink cases and
test registration. Resolve every confirmed issue before the final report.
