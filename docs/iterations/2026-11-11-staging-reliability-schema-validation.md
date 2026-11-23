# Staging reliability schema validation SRP extraction — 2026-11-11

## Scope
Behavior-preserving relocation of **149 original nonblank legacy LOC**, not net deleted LOC: the three exact original function definitions `validatePassedArtifactContentSchema`, `validateProvenanceRequirements`, `validateEnvArtifactValidation` and the immutable `requiredSignalResultRequirementTexts` set. Baseline main `231421b6b2ffe06a5cce9fa4af079e33ad8a7cdf`; legacy file blob `20b73b60b24b964ed0d25bdb9b92003872d3aa6a` and line count 1079.

## Architectural boundary
The CLI remains sole orchestration and IO owner. The extracted module is a synchronous schema-policy factory receiving the current evidence snapshot, violation collector, required environment mapping, and existing format/evidence constants; the original validation call stays at the same point in the CLI. No duplicate state owner, production logic, extra IO, auth, deploy, SSH, feature flag, schema alteration or provider changes. Existing provenance helper remains shared, imported by the extracted module. The global 1000 LOC limit becomes applicable to the source checker (new count **933**); remove its grandfathered line-cap entry rather than raising limits. Preserve every original assertion and error string.

## Critique and validation passes
1. **Behavior:** compare the exact original source bodies after reversing only two-space factory indentation; validate both positive tracked schema and negative malformed/absent format, redaction, signal, fixture and environment cases.
2. **Architecture:** verify the extracted factory has no import-time IO, the original CLI call remains in place, no legacy function duplicates remain, package test gate still invokes the original script, and all other security gates remain intact.
3. **Security:** keep provenance/fixture checks, no permissive fallbacks, strict environment requirements and no change to real-evidence handling. Verify source cap can no longer expand above 1000. Review overlap with separately owned #665 and #740 before writes.

## E2E acceptance
Draft original static/security/Flutter + non-publishing image must succeed at exact HEAD. Independently review source and reviewer threads, Ready 20/20 on exact tested HEAD, expected-SHA merge and natural postmerge main 20/20. No LOC are accepted before those gates. Avoid production deploy and duplicate CI dispatches.
