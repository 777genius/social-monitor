# Open Source License Compliance

Date: 2026-05-31
Status: baseline OSS compliance memory

## Decision

Open-source license compliance must be part of dependency governance before production and especially before SaaS/commercial distribution.

Reference:

- OpenChain ISO/IEC 5230: https://openchainproject.org/license-compliance

## Required

- dependency inventory/SBOM;
- license scan;
- allowed/blocked license policy;
- notice generation where required;
- review process for copyleft/unknown licenses;
- dependency approval for new runtime packages;
- generated attribution bundle later if needed.

## License Policy

Allowed by default, subject to review:

```text
MIT
Apache-2.0
BSD-2-Clause
BSD-3-Clause
ISC
```

Review required:

```text
MPL
LGPL
GPL/AGPL
SSPL
BUSL
unknown/custom licenses
```

## Why This Matters

The product depends on:

- NestJS/Node packages;
- Flutter packages;
- provider SDKs;
- scraping/source libraries if ever used;
- infra tooling;
- generated code.

License issues become harder to unwind after architecture depends on a package.

## Locked Decisions

1. SBOM/license scanning is required before production.
2. New runtime dependencies need license visibility.
3. Copyleft/unknown licenses require review.
4. Provider/source SDK license changes can block upgrades.
5. OSS compliance is part of supply-chain governance.

