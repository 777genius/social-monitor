# 268 - Kubernetes Ingress TLS Edge Policy

## Decision

Public traffic enters through a controlled edge layer with TLS, host/path routing and explicit service exposure.

Internal gRPC and worker services are not exposed through public ingress by default.

## Sources

- Kubernetes Ingress: https://kubernetes.io/docs/concepts/services-networking/ingress/
- Kubernetes Ingress API: https://kubernetes.io/docs/reference/kubernetes-api/networking/ingress-v1/
- Ingress-NGINX TLS: https://kubernetes.github.io/ingress-nginx/user-guide/tls/
- Kubernetes Services: https://kubernetes.io/docs/concepts/services-networking/service/

## Public Endpoints

Public ingress exposes:

- REST API
- WebSocket endpoint
- OAuth callback routes
- webhook receiver routes where needed
- health/status endpoint only if safe and intentionally public

Not public:

- worker services
- internal gRPC services
- database/broker/admin ports
- metrics endpoints unless behind auth/network controls

## TLS Policy

Production requires:

- TLS on public ingress
- HTTP to HTTPS redirect
- modern TLS configuration at ingress/controller/load balancer
- certificate automation
- cert expiry alerts
- HSTS where appropriate after rollout confidence

Ingress controller TLS behavior varies; controller-specific docs must be reviewed for production.

## Hostnames

Use distinct hostnames:

```text
api.example.com
ws.example.com or api.example.com/ws
hooks.example.com
status.example.com
```

Keep tenant custom domains as a future feature with separate certificate automation and isolation review.

## WebSocket Edge

WebSocket ingress must support:

- upgrade headers
- idle timeout tuned for expected connections
- connection limits
- auth enforcement upstream
- observability for connection counts

## Webhook Edge

Provider webhook routes need:

- body size limits
- signature/secret validation
- idempotency
- tenant/source lookup
- separate rate limits

Do not put provider webhook processing directly in business controllers without inbox persistence.

## Internal Traffic

Internal services communicate through ClusterIP services and service identity.

Service mesh is optional later; do not require it for MVP.

## Architecture Rule

Expose only what users/providers must reach.

Everything else stays private by default.
