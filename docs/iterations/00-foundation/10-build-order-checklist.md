# Iteration 00 - Build Order Checklist

## Build Order

1. Write product loop and glossary.
2. Define bounded contexts.
3. Assign aggregate ownership.
4. Define core value objects.
5. Define domain events.
6. Define source acquisition policy.
7. Define architecture dependency rules.
8. Define REST/OpenAPI rules.
9. Define event envelope rules.
10. Define gRPC usage rules.
11. Define Flutter feature-scoped architecture rules.
12. Define ticket quality rule.
13. Review all rules against MVP loop.
14. Close with transition criteria.

## Contracts First

- Product glossary.
- Context map.
- Aggregate ownership matrix.
- Source risk classification.
- Contract versioning rules.
- Architecture guardrails.

## Tests And Checks To Prepare

- Architecture import rule plan.
- Contract compatibility plan.
- Connector certification test plan.
- Tenant isolation test plan.
- Flutter feature boundary test plan.

## Edge Cases Before Closure

- Multi-workspace user.
- Same public source monitored by many tenants.
- Source technically works but is not production-safe.
- Summary rule conflicts with topic rule.
- Future connector has partial capabilities.

## Closure

Close only when implementation tickets can be cut without guessing context, layer, contract impact or acceptance criteria.
