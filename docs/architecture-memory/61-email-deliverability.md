# Email Deliverability

Date: 2026-05-31
Status: baseline email deliverability memory

## Decision

Email delivery must be treated as a production subsystem with domain authentication, suppression handling and provider event feedback.

Do not send product email from an unprepared/root domain without SPF, DKIM and DMARC.

References:

- SPF RFC 7208: https://www.rfc-editor.org/info/rfc7208
- DKIM RFC 6376: https://www.rfc-editor.org/rfc/rfc6376
- DMARC RFC 9989: https://www.rfc-editor.org/info/rfc9989/
- DMARC Aggregate Reporting RFC 9990: https://www.rfc-editor.org/info/rfc9990/
- DMARC Failure Reporting RFC 9991: https://www.rfc-editor.org/info/rfc9991/

## Sending Domains

Use separate sending domains/subdomains:

```text
transactional email
digest email
marketing email later
```

Reasons:

- isolate reputation;
- separate unsubscribe/suppression policies;
- reduce risk of marketing affecting transactional mail;
- simplify DMARC monitoring.

## Required Before Production Email

- SPF configured;
- DKIM signing enabled;
- DMARC policy configured;
- bounce/complaint webhook configured;
- suppression list integrated;
- unsubscribe behavior for non-critical emails;
- dedicated return-path/bounce domain where provider supports it.

## DMARC Notes

As of 2026, DMARC has newer RFCs:

- RFC 9989: core DMARC;
- RFC 9990: aggregate reporting;
- RFC 9991: failure reporting.

Do not build new tooling assuming RFC 7489 is the latest source.

## Email Event Handling

Track:

```text
delivered
bounced
deferred
spam_complaint
unsubscribe
dropped
opened/clicked where enabled and privacy-appropriate
```

Provider webhooks are untrusted external inputs:

- verify signature where available;
- process idempotently;
- store delivery provider event id;
- do not block product pipeline on provider webhook failure.

## Locked Decisions

1. SPF, DKIM and DMARC are required before production email.
2. Digest/transactional/marketing reputation should be separated.
3. DMARC RFC 9989/9990/9991 are the current baseline references.
4. Provider email events feed delivery state and suppression logic.
5. Email provider webhooks are verified and idempotent.

