# Egress & Network Governance

Date: 2026-05-31
Status: baseline egress governance memory

## Decision

Network egress must be controlled, especially for connectors, webhooks and user-provided URLs.

References:

- Kubernetes NetworkPolicy: https://kubernetes.io/docs/reference/kubernetes-api/networking/network-policy-v1/
- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

## Egress Classes

```text
source_api_egress
provider_api_egress
webhook_delivery_egress
email_provider_egress
llm_provider_egress
observability_egress
package_registry_egress
```

## Connector Egress

Connector workloads should only reach:

- required source/provider APIs;
- messaging broker;
- metrics/tracing endpoint;
- secret delivery path where needed.

They should not reach:

- internal metadata services;
- arbitrary private networks;
- core DB directly;
- unrelated internal services.

## Egress Proxy Later

Evaluate an egress proxy when:

- provider allowlists are complex;
- audit of outbound requests is required;
- SSRF controls need centralized enforcement;
- enterprise compliance requires egress logs.

## Webhook Egress

Webhook delivery must:

- reject private/internal IP targets;
- revalidate DNS/redirect targets;
- have timeout/size limits;
- record destination host/IP metadata;
- never run from privileged/internal network context.

## Locked Decisions

1. Connector egress is restricted.
2. Core DB is not directly reachable from connector runtime.
3. User-provided URL egress has SSRF controls.
4. Webhook delivery egress is isolated and bounded.
5. Egress proxy is later if centralized control becomes necessary.

