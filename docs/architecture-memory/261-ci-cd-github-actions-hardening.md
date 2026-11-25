# 261 - CI/CD GitHub Actions Hardening

## Decision

GitHub Actions can be used for CI/CD, but workflows must be treated as privileged production infrastructure.

Every workflow gets minimum permissions, pinned actions, controlled secrets and branch protection gates.

## Sources

- GitHub Actions security hardening: https://docs.github.com/en/actions/security-for-github-actions
- GitHub Actions OIDC: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect
- GitHub encrypted secrets: https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
- SLSA build levels: https://slsa.dev/spec/v1.0/levels

## Workflow Permissions

Default:

```yaml
permissions: read-all
```

Grant write permissions only per job.

Typical release job permissions:

```yaml
permissions:
  contents: read
  packages: write
  id-token: write
```

Avoid broad `contents: write` unless the job actually creates tags/releases/commits.

## Action Pinning

Third-party actions must be pinned by full commit SHA for security-sensitive workflows.

Version tags are acceptable only for low-risk workflows or internal actions with review.

Reusable internal workflows are preferred for repeated patterns.

## Secrets Policy

Prefer OIDC federation over long-lived cloud credentials.

Secrets are allowed only when:

- no OIDC alternative exists
- scope is minimal
- rotation owner exists
- environment protection is configured
- usage is logged

Never expose secrets to workflows triggered from untrusted forks.

## Pull Request Safety

Avoid `pull_request_target` unless the workflow is explicitly designed for untrusted code.

Do not checkout or run untrusted PR code with elevated repository tokens.

Code generation, tests and builds for PRs should run with read-only tokens.

## Required Checks

Protected branches require:

- lint/typecheck
- unit tests
- integration tests where applicable
- OpenAPI/protobuf compatibility
- security scanning
- generated-code freshness
- architecture boundary lint
- container build smoke where deployable changed

## Environments

Deployments use GitHub Environments:

- development
- staging
- production

Production requires:

- protected branch
- required reviewers
- deployment concurrency control
- rollback path
- release artifact provenance

## Runner Policy

Hosted runners are acceptable for normal CI.

Self-hosted runners require:

- isolation
- patching owner
- no persistent secrets on disk
- network restrictions
- cleanup between jobs
- no untrusted fork code

## Architecture Rule

CI/CD is part of the trusted computing base.

If a workflow can publish an artifact or deploy code, it must be reviewed like production code.
