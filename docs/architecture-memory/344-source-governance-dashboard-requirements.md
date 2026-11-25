# 344 - Source Governance Dashboard Requirements

## Purpose

Internal admins need one place to see source health, coverage, cost and risk.

Without this, source acquisition decisions become hidden operational debt.

## Dashboard Sections

### Source Catalog

Show:

- source type
- acquisition mode
- adapter version
- enabled environments
- terms review status
- data classes
- AI summary allowed

### Capability Matrix

Show:

- public search
- owned profile
- comments/replies
- media
- historical backfill
- realtime/webhook/stream
- rate limits
- cost unit

### Health

Show:

- provider uptime status
- auth failure rate
- rate-limit rate
- scan success/failure
- queue depth
- last successful scan
- tenant-visible degraded states

### Cost

Show:

- requests/items/tokens per provider
- cost per tenant
- cost per source binding
- budget utilization
- overage risk

### Risk

Show:

- unsupported scraping flag
- vendor DPA status
- subprocessor status
- policy review date
- kill switch state
- known limitations

## Actions

Admins can:

- disable source globally
- pause tenant source binding
- lower concurrency
- update capability profile
- trigger health recheck
- view adapter version rollout

All actions audited.

## Architecture Rule

Source governance is required before broad connector expansion.

If we cannot see a source's risk and cost, we should not scale it.
