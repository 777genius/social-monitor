# 121. Kubernetes Runtime Baseline

## Status

Locked for production baseline.

## Research Anchors

- Kubernetes probes: https://kubernetes.io/docs/concepts/workloads/pods/probes/
- Kubernetes disruptions and PDBs: https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
- Kubernetes PodDisruptionBudget: https://kubernetes.io/docs/tasks/run-application/configure-pdb/

## Decision

Every deployable gets explicit runtime contracts: probes, resource requests/limits, graceful shutdown, disruption budget and rollout policy.

## Probes

API/realtime services:

- startup probe waits for config validation and module boot;
- readiness probe checks ability to serve traffic and required local dependencies;
- liveness probe checks process health only, not every downstream dependency.

Workers:

- startup probe checks boot/config;
- readiness probe checks worker can accept jobs and broker connection is usable;
- liveness probe checks event loop/process health;
- external dependency degradation should usually make worker not ready, not dead.

## Resources

All pods require:

- CPU/memory requests;
- memory limits;
- ephemeral storage limits where payload/temp files exist;
- separate profiles for API, workers and AI-heavy workers.

Do not run LLM/media-heavy tasks in the same pod class as API traffic.

## Disruption and Shutdown

- Use PodDisruptionBudgets for production replicas.
- Workers must stop accepting new jobs on shutdown and finish/return current jobs safely.
- HTTP services must drain connections before termination.
- Kafka/Rabbit consumers must commit offsets only after successful processing.

## Best-Fact Choice

Kubernetes is not reliability by itself. The app must expose correct lifecycle semantics or the orchestrator will amplify failures during rollouts and node maintenance.

