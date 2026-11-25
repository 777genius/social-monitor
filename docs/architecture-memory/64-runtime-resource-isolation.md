# Runtime Resource Isolation

Date: 2026-05-31
Status: baseline runtime isolation memory

## Decision

Runtime isolation must limit blast radius by namespace, workload type, resource quotas and network policy.

This is especially important for connectors, workers and provider SDKs.

References:

- Kubernetes Pod Security Standards: https://kubernetes.io/docs/concepts/security/pod-security-standards/
- Kubernetes ResourceQuota: https://kubernetes.io/docs/concepts/policy/resource-quotas/
- Kubernetes LimitRange: https://kubernetes.io/docs/concepts/policy/limit-range/
- Kubernetes NetworkPolicy: https://kubernetes.io/docs/reference/kubernetes-api/networking/network-policy-v1/

## Namespace Model

Suggested namespaces:

```text
api
workers
connectors
data
observability
platform
```

Connectors should be isolated from core API/data-plane workloads.

## Resource Controls

Use:

- ResourceQuota per namespace;
- LimitRange defaults/min/max;
- resource requests/limits for all pods;
- separate worker pools for expensive workloads;
- max concurrency at application level.

## Pod Security

Baseline:

- no privileged pods;
- no host networking by default;
- run as non-root where possible;
- read-only root filesystem where possible;
- drop Linux capabilities unless required;
- seccomp/AppArmor where available.

Connectors should target restricted posture where feasible.

## Network Policy

Default-deny where practical.

Allow only:

- required broker/database endpoints;
- required provider/source egress;
- observability endpoints;
- secret delivery path.

## Locked Decisions

1. Connectors run isolated from core API workloads.
2. ResourceQuota and LimitRange are production requirements.
3. All pods have requests/limits.
4. NetworkPolicy controls connector egress.
5. Provider SDK risk is mitigated partly by runtime isolation.

