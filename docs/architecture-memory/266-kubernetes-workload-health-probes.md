# 266 - Kubernetes Workload Health Probes

## Decision

Every Kubernetes workload has explicit startup, readiness and liveness behavior appropriate to its role.

Probe design must avoid restarting healthy-but-busy services or routing traffic to pods that cannot serve correctly.

## Sources

- Kubernetes probes: https://kubernetes.io/docs/concepts/workloads/pods/probes/
- Kubernetes Deployments: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- Kubernetes graceful termination: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/

## Probe Roles

Startup probe:

- protects slow-starting apps from premature liveness/readiness checks
- used for services with migrations, warmup or slow dependency initialization

Readiness probe:

- controls whether pod receives traffic/jobs
- should fail when the pod cannot serve new work safely

Liveness probe:

- restarts a process that is deadlocked or irrecoverably broken
- must not fail just because an external dependency is briefly unavailable

## API Service Probes

API service:

- startup: application boot complete
- readiness: HTTP server ready, critical local dependencies initialized, DB connectivity when necessary for request correctness
- liveness: process event loop/http endpoint responds locally

Avoid putting provider API checks in liveness.

## Worker Probes

Worker service:

- startup: worker boot complete
- readiness: can accept/claim new jobs
- liveness: process not deadlocked

If provider quotas are exhausted, readiness may remain true but scheduler/backpressure should stop dispatching provider jobs. Do not restart workers for quota exhaustion.

## Graceful Shutdown

All services handle SIGTERM.

API pods:

- stop accepting traffic through readiness fail/drain
- finish in-flight requests within grace period
- close DB/broker connections

Worker pods:

- stop claiming new jobs
- finish or safely release current job
- ack only after durable side effects
- respect termination grace period

## Rollout Strategy

Production deployments require:

- rolling update
- maxUnavailable low/zero for APIs
- maxSurge configured
- readiness gates before traffic
- rollback on failed health

Long-running jobs should not be tied to API pod lifecycle.

## Anti-Patterns

- liveness checks that require database/provider success
- identical readiness and liveness endpoints
- no startup probe for slow boot
- readiness endpoint that always returns OK
- killing workers mid-side-effect
- running migrations inside every app pod startup

## Architecture Rule

Readiness protects traffic.

Liveness repairs broken processes.

Confusing them reduces reliability.
