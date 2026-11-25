# 125. Production Debugging Tooling

## Status

Locked for production baseline.

## Research Anchors

- Kubernetes ephemeral containers: https://kubernetes.io/docs/concepts/workloads/pods/ephemeral-containers/
- Kubernetes debug running pods: https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod
- kubectl debug reference: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_debug/

## Decision

Production images should stay minimal, but debugging must be planned through controlled tooling and audited access.

## Debug Methods

Allowed:

- logs, metrics and traces first;
- read-only admin dashboards;
- `kubectl debug` ephemeral containers for approved production incidents;
- runbook-guided broker/database diagnostic commands;
- replay in staging with copied sanitized fixtures where possible.

Restricted:

- shelling into production containers without incident/change record;
- installing tools into running app containers;
- dumping raw source payloads or secrets;
- ad hoc database writes;
- bypassing audit trails for support/admin operations.

## Requirements

- Debug access is role-based and time-bound.
- Every production debug session has incident/change reference.
- Ephemeral debug containers use approved images.
- Sensitive commands and data export are logged.
- Runbooks include exact safe commands for common cases.

## Best-Fact Choice

Minimal containers and strong access controls are compatible with practical debugging only if ephemeral containers, runbooks and observability are prepared before incidents.

