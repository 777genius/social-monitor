# Roadmap

## Build Order

```text
1. contracts package
2. monorepo skeleton
3. tenants/users/auth
4. topics/subscriptions
5. scheduler + scan run state machine
6. HN connector
7. RSS connector
8. normalization + source_items
9. outbox/inbox + Kafka/Rabbit conventions
10. dedupe + clustering
11. summary rules + summary jobs
12. Flutter feed/summaries UI
13. Reddit official connector
14. provider registry
15. X connector abstraction
16. Telegram connector
17. compliance/retention service
18. ops dashboard
```

Do not start with X. X comes only after provider abstraction, budget guard, cost ledger, quota manager, circuit breaker and connector quarantine exist.

## Production Readiness Gates

Before production:

- OpenAPI contracts generated and checked in CI;
- event schemas versioned;
- database migrations reviewed;
- outbox/inbox active;
- idempotency keys active for unsafe commands;
- connector certification suite active;
- basic admin/ops console;
- observability dashboards;
- cost ledger;
- compliance deletion jobs;
- backup/PITR restore drill;
- incident runbooks for P0/P1.

## Documentation Structure

```text
docs/
  architecture-memory/
  adr/
  contracts/
  runbooks/
  threat-model/
  compliance/
```

ADRs should include:

```text
Status
Context
Decision
Consequences
Alternatives considered
Operational impact
Migration/deprecation impact
References
```

References:

- adr-tools: https://github.com/npryce/adr-tools
- Backstage TechDocs: https://backstage.io/docs/features/techdocs/getting-started
- Docusaurus versioning: https://docusaurus.io/docs/versioning

