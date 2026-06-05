# Iteration 00 - Definition Of Done

## Done Checklist

1. MVP product loop is documented.
2. Bounded contexts are named and scoped.
3. Aggregate ownership is documented.
4. Core value objects are listed.
5. Core domain events are listed.
6. Source acquisition policy is documented.
7. Unsafe production scraping is explicitly rejected.
8. REST/OpenAPI versioning rules are documented.
9. Event envelope/versioning rules are documented.
10. gRPC usage rules are documented.
11. Flutter feature-scoped architecture rule is documented.
12. Ticket quality rule is documented.

## Architecture Done

- No planned domain concept depends on framework, database or provider payload shape.
- Every future implementation ticket can name context, layer, artifact and tests.
- Source strategy is adapter-based and provider-replaceable.

## Evidence Required

- Context map.
- Source acquisition policy.
- Contract standards.
- Architecture guardrails.
- Closure checklist reviewed.

## Not Done If

- A source is approved without risk class.
- A context has unclear ownership.
- A ticket can be started without tests or contract impact.
