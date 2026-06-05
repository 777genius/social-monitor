# Abuse & Fraud Controls

Date: 2026-05-31
Status: baseline abuse/fraud memory

## Decision

Abuse prevention is budget/quota/idempotency-first. CAPTCHA is secondary.

## Threats

```text
signup abuse
credential stuffing
scan spam
summary preview abuse
webhook endpoint abuse
expensive X/OpenAI budget draining
public API scraping
trial abuse
tenant invite abuse
```

## Controls

Required:

- per-IP anonymous rate limits;
- per-user authenticated rate limits;
- per-tenant expensive-operation budgets;
- command idempotency;
- email verification before expensive features;
- anomaly detection;
- admin kill switch per tenant/source/provider;
- trial limits;
- webhook endpoint validation.

CAPTCHA/Turnstile only on suspicious flows.

References:

- OWASP Automated Threats: https://owasp.org/www-project-automated-threats-to-web-applications/
- OWASP API Security: https://owasp.org/API-Security/
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/

## Trial Abuse

Trial tenants should have:

- low scan budgets;
- limited sources;
- no high-cost X/provider fallback by default;
- low summary preview limits;
- no large backfills;
- webhook limits.

## Cost Abuse

Preflight every expensive operation:

- source/provider scan;
- summary generation;
- embedding;
- backfill;
- replay;
- webhook bulk retry.

## Locked Decisions

1. Budgets/quotas are primary abuse controls.
2. CAPTCHA is secondary and risk-triggered.
3. Trial tenants cannot run high-cost workflows by default.
4. Expensive operations require preflight.
5. Abuse controls are product architecture, not only edge security.

