# 230 - Provider Cost And Capability Planning

## Decision

Every external provider has a versioned capability and cost profile before tenants can use it.

This applies to social sources, AI providers, email/push providers and storage/search vendors.

## Why This Matters

Provider capabilities, limits and pricing change more often than domain concepts.

The architecture must absorb provider changes through configuration, adapters and entitlement gates instead of code rewrites.

## Capability Profile

Each provider profile records:

```text
provider
adapter_version
supported_operations
required_auth_type
rate_limit_model
quota_scope
pricing_unit
latency_class
data_retention_constraints
terms_review_status
fallback_options
last_verified_at
```

## Cost Profile

Cost estimates must support:

- per request
- per item read
- per token
- per GB stored
- per delivery
- per search query
- per tenant/month
- per scan policy/month

Costs are estimates, not accounting truth. Billing uses the metering ledger.

## Planning Flow

Before enabling a tenant source binding:

1. compile provider-neutral query
2. check provider capabilities
3. estimate scan frequency and item volume
4. estimate monthly cost
5. compare tenant budget/plan
6. select fallback/degradation behavior
7. persist capability snapshot

## Runtime Guardrails

Workers enforce:

- max calls per scan
- max pages per scan
- max items per scan
- max tokens per summary
- max monthly budget per tenant/source
- emergency provider kill switch

Schedulers use budget state before dispatching jobs.

## Capability Degradation

If a provider loses capability:

- disable affected source bindings
- mark status `capability_unavailable`
- preserve existing normalized data
- stop scheduled scans
- notify tenant/admin
- keep topic and summary configuration intact

Do not delete tenant configuration because a provider changes.

## Forecasting

Admin should be able to simulate:

- scan interval change
- adding a source
- changing summary frequency
- switching model tier
- enabling comment ingestion
- enabling historical backfill

Simulation output:

- expected calls
- expected item volume
- expected AI tokens
- estimated monthly cost
- risk flags

## Source-Specific Examples

X:

- high cost volatility
- access-tier dependent capabilities
- must be disabled by default until budget accepted

Reddit:

- official API and terms gate
- query/comment volume must be bounded

RSS/Atom:

- low provider cost
- operational cost mainly bandwidth, storage and parsing

OpenAI:

- token and request limits
- batch option for non-urgent workloads
- prompt caching can reduce repeated prompt cost/latency

## Architecture Rule

No provider is "free" in architecture.

Even free APIs have quota, policy, reliability and operational cost.
