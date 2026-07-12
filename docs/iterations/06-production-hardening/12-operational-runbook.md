# Iteration 06 - Operational Runbook

## Daily Workflow

1. Run tenant isolation tests.
2. Check secret redaction tests.
3. Review dashboards after new metrics.
4. Run CI contract and migration checks.
5. Inspect queue/backlog simulations.
6. Update runbooks with new failure modes.
7. Verify alerts still point to current runbook sections.
8. Review DLQ, quota and provider outage trends.

## Review Cadence

- Security review before beta launch.
- Observability review before support handoff.
- CI/CD review before staging deploy.
- Cost/quota review before external users.

## Blockers

- Cross-tenant tests fail.
- Logs expose secrets.
- Provider failure lacks dashboard visibility.
- Queue backlog is not bounded.
- Backup restore is unverified.
- Alert has no owner or action.
- Support cannot identify affected tenant/topic/source from safe signals.
- User-visible status does not match backend failure state.

## Handoff Notes

- Hand off dashboards to support.
- Hand off alert thresholds to on-call.
- Hand off rollback plan to release owner.
- Hand off quota policy to product/support.
- Hand off failure taxonomy and support macros for common beta issues.
- Hand off DLQ triage and replay rules.

## Runtime App Profile

- Use `docker compose --profile app up -d --build` for the durable local MVP runtime: API, ingestion worker, intelligence worker, delivery service, event relay, PostgreSQL and RabbitMQ.
- The `migrate` service must complete successfully before app services accept traffic. If migration fails, keep workers stopped and inspect schema compatibility before replaying queued work.
- Required durable selectors for the app profile: `MONITORING_PERSISTENCE=prisma`, `FEED_PERSISTENCE=prisma`, `SUMMARY_PERSISTENCE=prisma`, `DELIVERY_PERSISTENCE=prisma`, `IDENTITY_PERSISTENCE=prisma`, `USAGE_PERSISTENCE=prisma`, `MONITORING_SCAN_QUEUE=rabbitmq`, `SUMMARY_JOB_QUEUE_MODE=rabbitmq`, `INGESTION_SCAN_QUEUE_READER=rabbitmq`, `INTELLIGENCE_SUMMARY_QUEUE_READER=rabbitmq`, `DELIVERY_ATTEMPT_QUEUE_READER=rabbitmq`.
- RabbitMQ task queues must use `RABBITMQ_DEAD_LETTER_EXCHANGE=social-monitor.commands.dlx`, `RABBITMQ_QUEUE_TYPE=quorum` and `RABBITMQ_QUEUE_DELIVERY_LIMIT=20` in beta runtime. If an existing local broker volume already declared classic queues, recreate the test broker volume before validating the app profile.
- Event relay must run with `EVENT_RELAY_LOOP=enabled`; otherwise durable outbox events can accumulate without fanout to RabbitMQ-backed consumers.
- Delivery service uses `DELIVERY_ATTEMPT_DISPATCH_TARGET=queue`, `DELIVERY_ATTEMPT_DISPATCH_QUEUE=rabbitmq`, `DELIVERY_ATTEMPT_QUEUE_READER=rabbitmq` and `DELIVERY_WEBHOOK_PROVIDER=http` in app profile. If webhook failures spike, follow Delivery Failure Triage before replaying attempts.
- Run `npm run check:runtime-compose`, `npm run check:container`, `npm run check:api-health`, `npm run check:event-relay`, `npm run check:cross-process-scheduler`, `npm run check:summary-queue-drain-loop` and `npm run check:delivery-attempt-queue-drain-loop` as targeted confidence checks when runtime wiring changes.

## Support And Ops Impact

- Support must diagnose scan, provider, summary and delivery failures from dashboards.
- Alerts must point to runbooks, not just raw metrics.
- Quotas should be explainable to beta users.
- Support should never need raw provider credentials, raw prompts or database shell access for common beta triage.
- Every incident should end with either a product limitation, source/provider issue, user configuration issue, system bug or capacity/cost issue classification.

## Scan Status Triage

Scan status API responses expose support-safe fields for beta triage:

- `userState=scan_pending`: scan was requested but not enqueued yet. Check scheduler lag or enqueue path if it lasts beyond the freshness SLO.
- `userState=scan_in_progress`: scan is enqueued or being processed. Check worker lag if it exceeds configured freshness expectations.
- `userState=content_current`: scan completed successfully. No support action is required.
- `userState=scan_degraded` with `failureClass=provider_unavailable`: check provider health, retry budget and affected source capability.
- `userState=scan_degraded` with `failureClass=provider_rate_limited`: reduce scan frequency or pause the affected source before adding workers.
- `userState=scan_degraded` with `failureClass=worker_conflict`: inspect scan lease ownership and worker lag.
- `userState=scan_degraded` with `failureClass=system_failure`: inspect scan attempts, logs and DLQ without exposing raw source payloads.

## Queue Backlog Triage

- `queue_commands_enqueued_total{command_type=ingestion.scan.execute,job_type=scan,status=enqueued}` shows accepted scan queue work.
- `queue_commands_backlog{command_type=ingestion.scan.execute,queue=scan}` shows current in-memory scan queue depth after enqueue.
- `queue_command_delivery_lag_seconds{command_type=ingestion.scan.execute,queue=scan,worker=ingestion-worker}` shows how old RabbitMQ work is when a worker receives it. Equivalent labels exist for `summary` and `delivery`.
- If backlog grows while `scan_jobs_total{status=started}` is flat, inspect worker availability before increasing scan frequency.
- If backlog grows together with provider rate-limit failures, reduce scan frequency or pause affected sources before adding workers.
- Quorum queues dead-letter messages after the configured delivery limit when a DLX is present. Use RabbitMQ policy for at-least-once dead-lettering in shared/staging brokers before replaying production-like queues.
- Queue lag depends on broker message timestamps, so in-memory fixture queues do not emit it. If lag is high while backlog is low, inspect worker pauses, long-running handlers and broker redelivery patterns.

## DLQ Triage

- `scan_failure_queue_events_total{queue=scan-retry,status=retry_enqueued}` shows failed scans accepted for retry.
- `scan_failure_queue_backlog{queue=scan-retry}` shows retry queue depth.
- `scan_failure_queue_events_total{queue=scan-dlq,status=dead_lettered}` shows scans that exhausted retry budget.
- `scan_failure_queue_backlog{queue=scan-dlq}` shows scan failures requiring manual classification.
- First action: classify the failure as provider outage, provider rate limit, worker conflict, source configuration, system bug or unsafe replay.
- Replay only after confirming the source capability and retry budget; suppress retry storms before increasing workers.
- Never inspect raw source payloads or credentials during DLQ triage; use scan id, source binding id, safe failure class and correlation id.

## Provider Failure Triage

- `scan_failures_total{failure_class=provider_unavailable,job_type=scan,worker=ingestion-worker}` shows provider availability failures.
- `scan_failures_total{failure_class=provider_rate_limited,job_type=scan,worker=ingestion-worker}` shows provider rate-limit failures.
- If provider unavailable failures rise, check provider health and source capability before replaying scans.
- If provider rate-limit failures rise, reduce scan frequency, enforce quota/backoff and avoid adding workers until provider pressure is controlled.
- Provider failure triage must not use raw URLs, prompts, source item bodies or credentials as metric labels.

## Summary Cost Triage

- `summary_model_estimated_cost_usd{provider,model}` shows estimated summary model spend by low-cardinality route.
- `summary_model_tokens_total{token_type=output}` helps detect oversized summary outputs after prompt/model changes.
- If estimated cost rises, confirm quota preflight and model route before replaying failed or delayed summary jobs.
- Prefer reducing summary frequency, max evidence items or output budget before changing provider routing.
- Do not add prompt text, source URLs or user emails to metric labels while diagnosing cost spikes.

## Summary Quality Triage

- `summary_story_ranking_cross_provider_cluster_share{ranking_policy_version}` shows how often selected story clusters are confirmed by more than one provider.
- `summary_story_ranking_title_only_cluster_share{ranking_policy_version}` shows reliance on weak title fingerprints when canonical URLs or entity keys are missing.
- `summary_story_ranking_clusters_without_provider_metrics{ranking_policy_version}` shows ranked clusters that cannot explain raw provider metrics to the user.
- `summary_story_ranking_top_provider_cluster_share{ranking_policy_version,top_provider_key}` shows whether one provider dominates the ranked story set.
- If quality alerts fire, inspect source coverage, canonical URL extraction and provider metric mapping before changing ranking weights or replaying summaries.

## Backup Restore Drill

- Use `ops/recovery/backup-restore-contract.json` as the beta recovery contract for RPO/RTO and included tables.
- Backup must include operational replay/idempotency state: `outbox_events`, `inbox_records`, `idempotency_keys`, `scan_jobs` and `cursor_checkpoints`.
- After restore, require the exact source/restored base-table sets to match and run every canonical count query from `restoreValidationQueries` before resuming workers.
- Keep workers paused during restore validation; resume only after migration version, replay state and idempotency state are consistent.
- Required local durable drill: run `docker compose --profile app up -d --build`, then `npm run capture:docker-staging-reliability-evidence`, then load the printed env file and run `npm run check:staging-reliability-evidence`.
- Treat restore as unsafe unless the Postgres artifact includes `postgres-outbox-inbox-idempotency`, `postgres-worker-pause-resume` and `postgres-no-duplicate-side-effects` with matching counts and fingerprints.
- The duplicate delivery proof must show a restored `delivery_attempts` idempotency key remains at count `1` after a duplicate insert probe. If it changes, keep workers stopped and do not replay delivery queues.
- Resume order after a valid restore is `event-relay`, `ingestion-worker`, `intelligence-worker`, `delivery-service`; capture before/after resume counts in the staging reliability artifact.
- If restore loses operational state, do not replay provider/AI jobs blindly; classify affected jobs and rebuild queues from durable records.

## Retention And DSAR Triage

- Use `ops/privacy/retention-contract.json` as the beta retention, export and deletion coverage contract.
- Every Prisma table must have an explicit retention policy before beta release; `npm run check:retention` blocks schema drift without a policy.
- User-exportable tables include user/profile, membership, topic, source binding, source item, feed item, summary, feedback and usage records.
- Operational replay/idempotency tables are not user-exportable; use them only to prove safe replay, restore and deletion completion.
- Legal hold behavior defaults to skipping purge and recording the exception until the hold is released.
- Do not run ad hoc database deletes for DSAR or retention requests; use the contract to classify each data class and record evidence.
- Real purge/export automation is a post-contract implementation step; until then, release evidence must show table coverage, owner, delete mode, purge trigger and legal-hold behavior.

## Delivery Failure Triage

- `delivery_attempts_total{status=started}` shows delivery work accepted by a provider adapter.
- `delivery_attempts_total{status=delivered}` shows provider-accepted delivery attempts.
- `delivery_failures_total{channel=webhook,resource_type=digest,retryable=true}` shows retryable webhook delivery failures.
- If retryable webhook failures rise, check endpoint status, signing secret rotation and suppression/quarantine state before replaying attempts.
- Delivery triage must use attempt id, channel, resource type and correlation id; never inspect raw webhook secrets or payload credentials.

## Release Rollback Triage

- Use `ops/release/mvp-release-evidence-contract.json` as the beta release evidence contract before promoting hardening changes.
- Release evidence must include release commit SHA, immutable image digest, OpenAPI snapshot, event catalog, migration schema and blocking gate output for architecture, container/runtime compose, OpenAPI, events, persistence, RabbitMQ queues, event relay, source adapters, summary, delivery, retention and drills.
- Run deploy smoke checks for API health, OpenAPI contract, migration compatibility and worker pause/resume readiness before inviting beta traffic.
- If tenant isolation, redaction or credential protection fails, hold release and keep beta traffic disabled.
- If migration or restore validation fails, stop workers, avoid queue replay and rework or restore before resuming provider/AI jobs.
- If provider, summary cost or delivery alerts spike after deploy, pause the affected source/job path before increasing worker capacity or replaying attempts.
