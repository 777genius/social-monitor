# 171. Container Image Hardening

## Status

Locked for runtime security baseline.

## Research Anchors

- Docker multi-stage builds: https://docs.docker.com/get-started/docker-concepts/building-images/multi-stage-builds/
- Dockerfile best practices: https://docs.docker.com/engine/userguide/eng-image/dockerfile_best-practices/
- Docker build checks: https://docs.docker.com/reference/build-checks/

## Decision

Production images must be minimal, reproducible enough for release evidence, scanned and run as non-root.

## Rules

- Use multi-stage builds.
- Keep build tools out of runtime image.
- Use `.dockerignore`.
- Pin base image family and track updates.
- Run as non-root user.
- Drop unnecessary Linux capabilities.
- Prefer read-only root filesystem where practical.
- Write temp files only to declared writable paths.
- Include healthcheck only when it matches orchestrator strategy.
- Do not bake secrets into images.

## Node/NestJS Specifics

- Install production dependencies only in runtime stage.
- Avoid shipping full monorepo source when built artifacts are enough.
- Keep source maps policy explicit; production source maps can leak internals if exposed.
- Separate API and worker image profiles only when dependencies/runtime differ materially.

## Verification

CI should run:

- Docker build checks/lint;
- vulnerability scan;
- SBOM generation;
- image size/report;
- signature/provenance generation for release candidates.

## Best-Fact Choice

Container hardening is cheapest when baked into the first Dockerfiles. Retrofitting non-root, read-only filesystems and slim images later usually exposes hidden runtime assumptions.

