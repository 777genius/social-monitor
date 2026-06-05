# 337 - WhatsApp Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- WhatsApp Business Platform docs: https://developers.facebook.com/docs/whatsapp
- WhatsApp Cloud API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
- WhatsApp pricing docs: https://developers.facebook.com/docs/whatsapp/pricing
- WhatsApp webhooks docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

## Current Reality

WhatsApp is not a public social listening source.

It is a tenant-authorized customer messaging channel through WhatsApp Business Platform / Cloud API or a Business Solution Provider.

## Option A - Meta WhatsApp Cloud API Direct

Pros:

- official Meta path
- webhooks for inbound messages/status
- no self-hosted WhatsApp Business API server required
- direct control over data flow and storage

Cons:

- business verification/setup friction
- templates/pricing/conversation rules
- phone number/API routing constraints
- not public monitoring
- operational burden for webhooks, retries and dashboards

Use for:

- tenant-owned customer support inbox monitoring
- inbound customer-message summarization after consent/policy review

## Option B - Business Solution Provider

Pros:

- easier onboarding and support
- managed reliability/logging/dashboard
- may simplify template and number setup

Cons:

- vendor lock-in
- extra cost/markup
- data processor/subprocessor review required
- export/storage terms vary

Use when:

- direct Meta setup is too slow
- reliability/support matters more than control

## Option C - WhatsApp Business App Manual Workflow

Pros:

- simple for very small teams
- no API implementation

Cons:

- no reliable automated ingestion
- manual export limitations
- not scalable

Use only as non-integrated MVP workaround.

## Option D - WhatsApp Web Automation / Unofficial Senders

Pros:

- appears easy

Cons:

- number-ban risk
- terms violation risk
- brittle
- not secure/compliant

Decision:

- rejected for production

## Recommended Path

Defer WhatsApp until customer-support workflows are in scope.

Then use:

```text
Cloud API direct or reviewed BSP -> webhook inbox -> consent-aware message normalization
```

## Architecture Rule

WhatsApp is private customer conversation data.

Treat it stricter than public social posts.
