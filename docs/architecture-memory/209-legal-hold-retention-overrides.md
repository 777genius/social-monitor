# 209. Legal Hold and Retention Overrides

## Status

Locked for compliance/data baseline.

## Research Anchors

- S3 Object Lock legal hold: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-configure.html
- Microsoft Purview eDiscovery holds: https://learn.microsoft.com/en-us/purview/edisc-hold-create
- GDPR restriction of processing: https://www.dataprotection.ie/en/individuals/know-your-rights/right-restriction-article-18-gdpr

## Decision

Support retention overrides and legal holds as explicit compliance workflows, not ad hoc flags. Early product can defer full legal-hold automation, but data model must not make holds impossible.

## Hold Record

Fields:

- hold id;
- tenant id;
- scope;
- reason;
- requester/approver;
- data classes affected;
- start time;
- release time;
- legal basis/note;
- status;
- audit references.

## Effects

When a hold applies:

- retention reaper skips affected records/artifacts;
- deletion workflow records exception;
- exports can include held data only with approved scope;
- object storage may use Object Lock/legal hold where required;
- UI/admin shows restricted compliance state.

## Rules

- Holds require privileged approval.
- Holds are auditable.
- Holds must be releasable and reviewed.
- Legal hold does not grant broader support access.

## Best-Fact Choice

Retention is not always "delete on schedule". Legal holds and restriction-of-processing workflows need explicit state so compliance does not become manual database work.

