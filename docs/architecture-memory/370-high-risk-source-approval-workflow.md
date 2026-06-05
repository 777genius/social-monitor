# 370 - High-Risk Source Approval Workflow

## Purpose

Some sources are commercially valuable but operationally, legally or reputationally risky.

Examples:

- alt-tech political platforms
- restricted regional social networks
- private/community chat systems
- scraping-dependent vendor sources
- sources with unclear AI summarization rights

## Approval States

```text
discovered -> researched -> legal_review -> security_review -> vendor_review
-> limited_internal_test -> customer_beta -> approved -> suspended/rejected
```

## Required Checks

Before enabling a high-risk source:

- source option document exists
- evidence grade is assigned
- terms/rights review completed
- vendor due diligence completed if applicable
- data retention policy defined
- safety/moderation workflow defined
- support/admin access restrictions defined
- kill switch implemented
- tenant-visible limitations documented
- cost profile approved

## Tenant Eligibility

High-risk sources should not be enabled globally.

Enablement options:

- internal research only
- specific tenant allowlist
- enterprise contract only
- jurisdiction-specific availability
- purpose-limited access

## User-Facing Claim Rule

Never market high-risk sources as generic full coverage.

Use precise wording:

```text
Available for approved enterprise workspaces through reviewed provider integrations.
Coverage, freshness and retention vary by provider and source policy.
```

## Architecture Rule

High-risk source enablement must be controlled by entitlements and feature flags, not by deploying connector code alone.

