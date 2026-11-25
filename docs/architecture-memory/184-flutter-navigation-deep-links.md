# 184. Flutter Navigation and Deep Links

## Status

Locked for Flutter architecture baseline.

## Research Anchors

- Flutter deep linking: https://docs.flutter.dev/ui/navigation/deep-linking
- Flutter Android app links setup: https://docs.flutter.dev/cookbook/navigation/set-up-app-links
- go_router package: https://pub.dev/packages/go_router

## Decision

Use declarative navigation with typed route contracts owned by the app shell. Features expose route entrypoints and typed route inputs. Deep links are parsed into safe intents and passed through auth/workspace guards before navigation.

## Route Ownership

Each feature owns:

- route entrypoint widget;
- typed feature route input objects when needed;
- feature-local fallback surfaces for missing or unauthorized resources after app guards pass.

Core shell owns:

- app-level router;
- typed `FeatureRouteContract` registry;
- route names and path strings;
- route parameter and query contract validation;
- auth redirects;
- tenant/workspace selection;
- unknown route handling;
- app link/bootstrap handling.

## Deep Link Rules

- Do not trust route params as authorization.
- Resolve tenant/resource through backend where needed.
- If unauthenticated, store pending safe intent and resume after login.
- If tenant context missing, route to tenant selector.
- If resource unavailable, show stable not-found/permission state.
- Avoid deep links to destructive actions; use review/confirmation screens.

## Best-Fact Choice

Deep links are product entry points, not just navigation shortcuts. They must go through the same authorization and tenant-state rules as normal UI flows.
