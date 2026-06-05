# 264 - Dependency Update Governance

## Decision

Use automated dependency update tooling, but govern it with grouping, risk tiers and test gates.

Renovate is preferred for flexible multi-ecosystem update policy. Dependabot security updates are acceptable where GitHub-native simplicity is enough.

## Sources

- Renovate documentation: https://docs.renovatebot.com/
- Renovate automerge: https://docs.renovatebot.com/key-concepts/automerge/
- Renovate configuration options: https://docs.renovatebot.com/configuration-options/
- GitHub Dependabot security updates: https://docs.github.com/en/code-security/dependabot/dependabot-security-updates
- OWASP Dependency-Check: https://devguide.owasp.org/en/05-implementation/02-dependencies/01-dependency-check/

## Ecosystems

Track:

- npm/pnpm packages
- Flutter/Dart packages
- Docker base images
- GitHub Actions
- Terraform/providers if used
- Helm charts if used

## Grouping Policy

Group low-risk updates:

- dev dependencies patch/minor
- lint/test tooling
- GitHub Actions patch/minor
- related monorepo packages

Separate high-risk updates:

- major framework upgrades
- ORM/database client
- auth libraries
- crypto/security libraries
- mobile build tooling
- AI provider SDK major changes
- source provider SDKs

## Automerge Policy

Allowed automerge:

- patch/minor dev dependencies
- documentation tooling
- low-risk GitHub Actions updates
- lockfile maintenance

Only if:

- CI passes
- no vulnerability exception exists
- no generated code drift
- branch is up to date

Manual review required:

- production dependencies
- major versions
- auth/security/crypto packages
- database/broker clients
- Flutter runtime/UI packages

## Security Updates

Security updates get priority but still run tests.

Critical vulnerabilities:

- create emergency issue
- assess exploitability
- patch or mitigate
- document exception if not immediately fixed

## Noise Control

Dependency bots must not flood the team.

Use:

- schedules
- grouping
- dependency dashboard
- minimum release age for non-security updates
- labels/owners

## SCA Scanning

Use SCA scanning in CI and release gates.

OWASP Dependency-Check can be one tool, but package ecosystem-native advisories and GitHub alerts should also be used.

## Architecture Rule

Dependency freshness is operational work.

Automated PRs are useful only when backed by tests, owners and clear merge policy.
