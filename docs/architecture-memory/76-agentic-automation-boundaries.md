# Agentic Automation Boundaries

Date: 2026-05-31
Status: baseline agentic automation memory

## Decision

Do not give LLM/agent workflows broad autonomous authority over production actions.

Use least-agency design: AI can classify, summarize, recommend and draft. Deterministic application logic executes actions after policy checks and, for high-impact operations, human approval.

References:

- NIST AI RMF Playbook: https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-rmf-playbook
- OWASP LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications
- OpenAI prompt injection guidance: https://openai.com/safety/prompt-injections/
- OpenAI agent safety practices: https://help.openai.com/en/articles/11752874-chatgpt-agent

## Allowed AI Actions

Allowed without human approval:

```text
classify relevance
summarize source clusters
extract entities
suggest topic rules
suggest source filters
rank digest candidates
draft notification text
flag anomalies for review
```

## Not Allowed Without Human/Policy Gate

```text
delete data
change tenant budget
rotate credentials
enable X/provider fallback
trigger large backfill
send external webhook/email
change billing plan
invite admins
modify source credentials
disable compliance workflow
```

## Tool Access

AI jobs should not have direct tools that can:

- spend money;
- send external communications;
- modify credentials;
- change authorization;
- delete/purge data;
- call arbitrary URLs;
- access raw secrets.

## Rule

LLM output is data. It is never command authority.

## Locked Decisions

1. AI workflows use least agency.
2. AI can recommend/draft; application logic executes.
3. High-impact operations require deterministic policy checks and/or human approval.
4. AI jobs have no direct access to secrets or destructive tools.
5. Prompt injection risk is managed through limited agency, not only detection.

