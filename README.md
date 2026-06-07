# Social Monitor

Social Monitor is an API-first backend for building social, news, and web signal monitoring systems.

It is designed for teams that need to collect public signals, normalize them into reliable events, search and analyze them, and route important findings into dashboards, alerts, reports, or downstream AI workflows.

The repository currently contains a TypeScript/NestJS backend, tests, infrastructure helpers, and a large architecture memory that documents the product and system design decisions behind the platform.

## What You Can Build With It

- Brand, product, or creator mention monitoring
- News and media intelligence dashboards
- Public web and social signal ingestion pipelines
- Reputation, risk, and incident monitoring workflows
- Source connector experiments for APIs, feeds, webhooks, and queues
- AI-assisted triage, summarization, clustering, and evaluation pipelines
- Internal tools for analysts, operators, and engineering teams

Social Monitor is not a hosted SaaS in this repo. It is a backend and architecture foundation that you can run locally, extend, and adapt.

## Project Status

This is an early MVP/reference implementation. The codebase already has a structured backend and extensive architecture docs, but some integrations are intentionally in-memory or local-first while the production design is being hardened.

Good fit today:

- Reading the architecture and product direction
- Exploring a clean TypeScript backend structure
- Building or testing monitoring-domain workflows
- Extending the API, ingestion, delivery, identity, and observability modules

Not a good fit yet:

- Plug-and-play production deployment without review
- Sensitive or regulated monitoring without your own legal, privacy, and security controls
- Assuming all planned architecture documents are fully implemented in code

## Tech Stack

- TypeScript on Node.js 22+
- NestJS for application modules and REST APIs
- Prisma for database schema and migrations
- PostgreSQL and Redis for local infrastructure
- Jest and Supertest for unit and end-to-end tests
- ESLint for code quality checks
- Ports/adapters style boundaries for domain modules

## Repository Map

    apps/
      api-gateway/          REST API entrypoint
      delivery-service/     delivery and notification workflows
      ingestion-worker/     ingestion processing entrypoint
      intelligence-worker/  analysis and intelligence processing entrypoint

    libs/
      delivery/             delivery domain and adapters
      identity/             tenants, API keys, and auth-related flows
      monitoring/           scan requests and monitoring workflows
      platform/             shared platform utilities and infrastructure ports

    docs/
      architecture-memory/  durable product and architecture decisions
      iterations/           implementation and planning notes

    prisma/
      schema.prisma         database schema
      seed.ts               local seed script

    test/
      e2e/                  end-to-end API tests

## Quick Start

Prerequisites:

- Node.js 22 or newer
- npm
- Docker and Docker Compose, for local PostgreSQL and Redis

Clone the repository:

    git clone https://github.com/777genius/social-monitor.git
    cd social-monitor

Install dependencies:

    npm install

Create local environment config:

    cp .env.example .env

Start local infrastructure:

    docker compose up -d

Validate database and generate Prisma client:

    npm run check:migrations

Run tests:

    npm run test
    npm run test:e2e

Start the API locally:

    npm run start:api

Other worker entrypoints are available:

    npm run start:ingestion
    npm run start:intelligence
    npm run start:delivery

## Useful Commands

    npm run build              # TypeScript build
    npm run lint               # ESLint check
    npm run check:architecture # Architecture boundary checks
    npm run check:local-infra  # Local infrastructure checks
    npm run verify             # Full local verification pipeline

## Start With The Architecture Docs

If you want to understand the system before running it, start here:

- docs/architecture-memory/00-index.md
- docs/architecture-memory/100-architecture-summary.md
- docs/architecture-memory/101-bounded-context-map.md
- docs/architecture-memory/102-service-interface-contracts.md
- docs/architecture-memory/103-event-catalog-v1.md

The architecture memory is intentionally detailed. It captures decisions around ingestion, monitoring, identity, delivery, observability, data governance, AI evaluation, and production readiness.

## Responsible Use

Use this project only with data sources you are allowed to access and monitor. Social and web monitoring can affect privacy, safety, and platform policy compliance. Before using it in production, review source terms, data retention, user consent, legal basis, and internal access controls.

## License

A public license has not been selected yet. Do not assume reuse rights beyond viewing this public repository until a LICENSE file is added.
