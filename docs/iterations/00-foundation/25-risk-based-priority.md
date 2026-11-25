# Iteration 00 - Risk-Based Priority

## Priority 1 - Source Acquisition Policy

- Risk: Later connector work may be built on unsafe or unreliable assumptions.
- Do First: Define allowed/rejected acquisition modes and source risk classes.
- Do Not Defer: Production-safe source strategy.

## Priority 2 - Bounded Context Ownership

- Risk: Platform skeleton and Flutter features split around wrong boundaries.
- Do First: Assign aggregate ownership and cross-context communication.
- Do Not Defer: Context ownership review.

## Priority 3 - Contract Standards

- Risk: Backend/mobile/events drift before implementation starts.
- Do First: Define REST, event and gRPC versioning rules.
- Do Not Defer: Contract compatibility rules.

## Priority 4 - Ticket Quality Rule

- Risk: Work starts without tests, edge cases or contract impact.
- Do First: Require context/layer/artifact/tests/edge cases on every ticket.
