# Documentation, ADRs & Workflow Specs

Date: 2026-05-31
Status: baseline documentation memory

## Decision

Architecture memory lives as structured markdown near the code. Individual major decisions get ADRs.

References:

- ADR organization: https://github.com/adr
- Backstage TechDocs: https://backstage.io/docs/features/techdocs/getting-started
- Diataxis: https://diataxis.fr/
- Arazzo Specification: https://spec.openapis.org/arazzo/latest.html

## Documentation Structure

```text
docs/
  architecture-memory/
  adr/
  contracts/
    rest/
    events/
    grpc/
  runbooks/
  threat-model/
  compliance/
```

## ADR Template

Each ADR includes:

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

Architecture memory captures baseline principles. ADR captures a specific decision with tradeoffs and consequences.

## Documentation Types

Use Diataxis-style separation:

- tutorials for learning paths;
- how-to guides for tasks;
- reference for contracts/config;
- explanation for architecture decisions.

## Workflow Specs

OpenAPI describes operations. Arazzo can describe multi-step workflows once workflows are stable.

MVP:

- markdown workflow docs;
- executable E2E tests.

Later:

- Arazzo specs for stable API workflows.

Candidate workflows:

```text
create tenant -> create topic -> add HN source -> schedule scan -> read feed
create summary rule -> generate preview -> save rule -> digest includes summary
add webhook endpoint -> verify -> deliver event -> replay missed event
connect Reddit account -> refresh token -> scan -> handle rate limit
trigger manual scan -> observe WebSocket hint -> refetch REST truth
```

## Publishing

MVP:

- markdown in repo.

Later:

- Docusaurus or Backstage TechDocs when docs discovery/ownership becomes painful.

## Locked Decisions

1. Architecture memory and ADRs live in repo markdown.
2. ADRs are required for irreversible/high-risk decisions.
3. Workflow docs start as markdown/E2E tests.
4. Arazzo is later for stable workflows, not a test replacement.
5. Backstage/Docusaurus are later, not MVP requirements.

