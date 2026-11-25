# Log Redaction & Secrets Scanning

Date: 2026-05-31
Status: baseline log/secrets memory

## Decision

Logs, traces and error reports must be redacted by design. Secret scanning is mandatory in CI and repository hosting.

References:

- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- NIST SP 800-92 Log Management: https://csrc.nist.gov/pubs/sp/800/92/final
- GitHub Secret Scanning: https://docs.github.com/en/code-security/concepts/secret-security/about-secret-scanning

## Never Log

```text
OAuth access tokens
refresh tokens
Telegram bot tokens
provider API keys
cookies
raw auth headers
connector credentials
webhook signing secrets
full source raw payloads by default
full prompts by default
payment details
```

## Sensitive Fields

Redact/mask:

```text
email
phone
IP address where policy requires
user agent if too identifying
source author identifiers where policy requires
raw source text in normal logs
```

## Logging Rules

Logs should include:

```text
correlation_id
tenant_id
user_id hash/opaque where appropriate
scan_run_id
connector_run_id
source_type
provider
error_class
```

Logs should not include unbounded payloads.

## Secret Scanning

Required:

- pre-commit or local scan where practical;
- CI secret scan;
- repository provider secret scanning;
- block known secret patterns;
- incident workflow for leaked secrets;
- rotation playbook.

## AI-Agent Risk

AI-assisted coding increases risk of accidentally writing credentials into code/config/docs. Do not put real provider credentials in prompts, examples or local config committed to repo.

## Locked Decisions

1. Logs are redacted by default.
2. Secret scanning is required in CI/repository hosting.
3. Real credentials never appear in examples/docs.
4. Leaked secrets trigger rotation workflow.
5. Full prompts/raw payloads are not logged by default.

