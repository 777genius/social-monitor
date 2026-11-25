# 150. Security Logging and Evidence

## Status

Locked for security baseline.

## Research Anchors

- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP Top 10 A09 Security Logging and Monitoring Failures: https://owasp.org/Top10/en/A09_2021-Security_Logging_and_Monitoring_Failures/
- NIST SP 800-92 Guide to Computer Security Log Management: https://csrc.nist.gov/pubs/sp/800/92/final
- OpenTelemetry logs: https://opentelemetry.io/docs/concepts/signals/logs/

## Decision

Security logs are evidence. They must be structured, protected, searchable and free of secrets/raw sensitive payloads.

## Events to Log

Mandatory security events:

- login/logout/session refresh;
- MFA enrollment/change where applicable;
- failed authentication bursts;
- tenant membership/role changes;
- API key create/revoke/use anomaly;
- source credential connect/disconnect/refresh failure;
- admin/support access;
- export/delete/privacy request;
- entitlement override;
- webhook signature failure;
- rate-limit/abuse blocks;
- authorization denial for sensitive resources;
- secret rotation and key lifecycle events.

## Log Shape

Every security log includes:

- timestamp;
- event type;
- actor id or service identity;
- tenant id where applicable;
- action;
- resource type/id where safe;
- outcome;
- request id;
- trace id/span id;
- source IP/device metadata where policy allows;
- reason code.

## Controls

- no passwords, tokens, secrets or raw source payloads;
- redact user/source text by default;
- protect logs from tampering;
- restrict access to security logs;
- define retention by data class;
- alert on high-risk patterns.

## Best-Fact Choice

Security logging must be designed before incidents. Missing evidence cannot be reconstructed after compromise or tenant dispute.

