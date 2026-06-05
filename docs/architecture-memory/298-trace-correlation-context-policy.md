# 298 - Trace Correlation Context Policy

## Decision

Use W3C Trace Context for distributed trace propagation across HTTP and service calls.

Use explicit correlation ids for business workflows that span async boundaries and long-running jobs.

## Sources

- W3C Trace Context: https://www.w3.org/TR/trace-context/
- OpenTelemetry context propagation: https://opentelemetry.io/docs/concepts/context-propagation/
- OpenTelemetry semantic conventions: https://opentelemetry.io/docs/specs/semconv/

## Trace Context

Propagate:

- `traceparent`
- `tracestate`

Across:

- REST requests
- gRPC calls
- outgoing provider calls where safe
- internal service calls

Do not forward internal tracing headers to third-party providers if doing so leaks tenant/resource-sensitive information.

## Correlation IDs

Use correlation ids for:

- source scan workflow
- summary generation workflow
- digest delivery workflow
- tenant export workflow
- DSAR workflow
- billing reconciliation
- support/admin action chain

Correlation id persists longer than one trace.

## Async Propagation

Messages/jobs include:

```text
trace_context
correlation_id
causation_id
tenant_id
initiator_type
initiator_id
```

Worker spans link to the producing span when supported.

## Logging

Structured logs include:

- trace id
- span id where available
- correlation id
- tenant id if safe and policy permits
- job id
- source binding id where relevant

Never log raw tokens, prompts or source credentials.

## UI Support

Admin/support views can expose safe trace/correlation references for debugging.

Tenant-facing error responses include `trace_id` or support reference, not internal span details.

## Architecture Rule

Traces explain execution.

Correlation ids explain business workflow continuity.
