# 299 - Event Metadata CloudEvents Policy

## Decision

Use a CloudEvents-inspired envelope for domain/integration events.

The platform does not need to expose every event as CloudEvents externally on day one, but event metadata should be compatible with the model.

## Sources

- CloudEvents specification: https://github.com/cloudevents/spec
- CNCF CloudEvents project: https://www.cncf.io/projects/cloudevents/
- CNCF CloudEvents graduation announcement: https://www.cncf.io/announcements/2024/01/25/cloud-native-computing-foundation-announces-the-graduation-of-cloudevents/

## Event Envelope

Required fields:

```text
id
source
type
specversion
subject
time
datacontenttype
dataschema
tenant_id
correlation_id
causation_id
trace_context
data
```

Use CloudEvents naming where practical:

- `id`
- `source`
- `type`
- `specversion`
- `subject`
- `time`
- `datacontenttype`
- `dataschema`

## Event Type Naming

Use reverse-domain or product-domain style consistently:

```text
social_monitor.source.item.normalized.v1
social_monitor.summary.completed.v1
social_monitor.digest.assembled.v1
```

Version event contracts explicitly.

## Source Field

`source` identifies the producer bounded context/service, not the social media source provider.

Example:

```text
/services/ingestion
/services/summary
/services/billing
```

Social provider is event data or extension metadata.

## Data Schema

`dataschema` points to schema registry/OpenAPI/AsyncAPI artifact.

Consumers must not infer schema only from event type string.

## Compatibility

Safe event changes:

- add optional field
- add new event type
- add enum value only with unknown handling

Breaking:

- remove required field
- change field type
- change semantics of existing field
- reuse event type for different meaning

## Architecture Rule

Events are APIs.

Their metadata must support routing, tracing, schema validation and replay.
