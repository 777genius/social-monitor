# External beta duplicate evidence paths — bounded refactor

Base 3b6527b2fe851cd05da7c60829558e41553dd75c. Relocate 52 original nonblank implementation LOC; not net-deleted LOC.

## Structural review rounds
1. Keep CLI plan/execute and env-file loading as sole owners; a single adapter owns duplicate-path checking.
2. Preserve existing-file and future-file canonicalization, failed-realpath fallback, duplicate ordering, redacted messages and literal policy flag.
3. Regression-test enabled/disabled, missing values, same-job duplicates, symlinks, missing target beneath aliased parent and live env references.
4. Retain all runner enforcement call sites, unchanged CI/security gates; ratchet only runner source cap 1158 to 1103.

## Acceptance
Six local policy tests are a prototype, not hosted E2E. Draft Static/Security/Flutter, independent review, exact-head Ready 20/20, SHA-guarded merge and native main 20/20 remain required. Do not merge ahead of #758 postmerge acceptance. No production or SSH.
