# Durable backend E2E frontend environment writer — scoped extraction

Base `3b6527b2fe851cd05da7c60829558e41553dd75c`. This slice relocates the original frontend environment writer, private out-of-workspace path validation and shell-quote formatter into `scripts/lib/durable-backend-e2e-frontend-env.ts`. It is **original implementation relocated**, not net source deletion.

## Independent structural review
1. One owner for private frontend credential file writing; keep the backend E2E orchestration and JWT acquisition in the existing runner.
2. Preserve the path check timing, `process.cwd()` semantics, env variable order, exact shell quoting, output logging and 0600 permission reapplication.
3. Do not change credential semantics, private-file naming, SSH behavior or deploy behavior; do not claim protection against symlink aliasing that the original check did not provide.
4. Verify source-body reconstruction after reversing only explicit export and narrow TypeScript argument contracts; retain original runner invocation. Add deterministic tests for disabled output, path rejection, single-quote escaping, exact env layout, 0600, existing-file replacement and runner delegation.

## Acceptance gate
Local focused tests are only preliminary. Require Draft static/security/Flutter and nonpublishing image, independent review, Ready exact-head 20/20, SHA-guarded merge, then native post-merge main 20/20 before unique relocated LOC credit. Coordinate with pending #759 and avoid #665/#750, production #620 and SSH.
