# External beta runtime plan smoke refactor — 2026-11-10

## Exact scope and acceptance
Move the **201 distinct original nonblank implementation lines** of four cohesive runtime-plan and Docker-bundle smoke functions into one dependency-injected adapter, with no behavior change. Bodies preserve original branching, child args, invocation-time PATH, 30-second bound, error redaction, file mode 0600, fixture order and guaranteed cleanup. This is moved original LOC, **not net lines deleted**. Ratchet legacy CLI cap **1376 -> 1175** without weakening other static checks.

## Three critique lenses
1. **Architecture/SOLID:** the checker owns orchestration and violations; the adapter owns only runtime plan / handoff smoke commands, no duplicated persistence or security gate, and exposes the two existing validation operations.
2. **Security/behavior:** keep identical source bodies after two-space nesting. Inject current fs, runner, formatter and preflight helpers; no extra IO, globals, networking, auth, release actions or environmental lookup timing changes.
3. **Testing:** eight focused deterministic positive/negative tests in the existing architecture gate cover readiness, five jobs, env allowlist, CLI switches, redacted errors, 0600 fixture permissions, handoff and cleanup. Require independent structural review, original Draft checks, real exact-head Ready 20/20 and safe merge, then postmerge current main 20/20 before accepting LOC.

Out of scope: #665 summary model owner, #709 CI impact tiers, #620 production deploy, #714 collector qualification, SSH and any production deployment. Do not claim external reviewer availability or deploy acceptance from synthetic checks.
