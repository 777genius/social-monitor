import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
  test('route contract validates route ids query and workspace scope', () {
    const contract = FeatureRouteContract(
      id: AppRouteId('feed.items'),
      path: '/feed',
      query: RouteQueryContract(
        allowedKeys: {'cursor', 'filter'},
        requiredKeys: {'filter'},
      ),
    );

    const scope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
    );

    const valid = RouteResolution(
      contract: contract,
      scope: scope,
      query: {'filter': 'open', 'cursor': 'next'},
    );
    const missingRequired = RouteResolution(
      contract: contract,
      scope: scope,
      query: {'cursor': 'next'},
    );
    const unknownQuery = RouteResolution(
      contract: contract,
      scope: scope,
      query: {'filter': 'open', 'raw': 'bad'},
    );

    expect(contract.isValid, isTrue);
    expect(valid.isValid, isTrue);
    expect(missingRequired.isValid, isFalse);
    expect(unknownQuery.isValid, isFalse);
  });

  test('workspace scoped value rejects stale workspace generations', () {
    const firstScope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
    );
    const nextScope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-2',
    );
    const value = WorkspaceScopedValue<String>(
      scope: firstScope,
      generation: 3,
      value: 'feed',
    );

    expect(
      value.isCurrent(currentScope: firstScope, currentGeneration: 3),
      isTrue,
    );
    expect(
      value.isCurrent(currentScope: nextScope, currentGeneration: 3),
      isFalse,
    );
    expect(
      value.isCurrent(currentScope: firstScope, currentGeneration: 4),
      isFalse,
    );
  });

  test('realtime guard detects duplicates stale gaps and wrong workspace', () {
    const scope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
    );
    const otherScope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-2',
    );
    final guard = RealtimeEventOrderGuard(scope: scope);

    final first = _event('event-1', sequence: 1, scope: scope);
    final duplicate = _event('event-1', sequence: 1, scope: scope);
    final stale = _event('event-0', sequence: 1, scope: scope);
    final gap = _event('event-3', sequence: 3, scope: scope);
    final wrongWorkspace = _event('event-2', sequence: 2, scope: otherScope);

    expect(guard.decisionFor(first), RealtimeApplyDecision.apply);
    guard.markApplied(first);
    expect(guard.decisionFor(duplicate), RealtimeApplyDecision.duplicate);
    expect(guard.decisionFor(stale), RealtimeApplyDecision.stale);
    expect(guard.decisionFor(gap), RealtimeApplyDecision.resyncRequired);
    expect(
      guard.decisionFor(wrongWorkspace),
      RealtimeApplyDecision.wrongWorkspace,
    );
  });

  test('cache entries expire on stale ttl and workspace switch', () {
    const scope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
    );
    const otherScope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-2',
    );
    const policy = FrontendCachePolicy(
      freshFor: Duration(minutes: 1),
      staleFor: Duration(minutes: 4),
    );
    final storedAt = DateTime.utc(2026, 1, 1, 12);
    final entry = FrontendCacheEntry<String>(
      value: 'feed',
      scope: scope,
      storedAt: storedAt,
      policy: policy,
    );

    expect(policy.isInMemoryOnly, isTrue);
    expect(
      entry.freshnessAt(
        storedAt.add(const Duration(seconds: 30)),
        currentScope: scope,
      ),
      FrontendCacheFreshness.fresh,
    );
    expect(
      entry.freshnessAt(
        storedAt.add(const Duration(minutes: 3)),
        currentScope: scope,
      ),
      FrontendCacheFreshness.stale,
    );
    expect(
      entry.freshnessAt(
        storedAt.add(const Duration(seconds: 30)),
        currentScope: otherScope,
      ),
      FrontendCacheFreshness.expired,
    );
  });

  test('memory cache serves stale entries and invalidates by workspace', () {
    const scope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
    );
    const otherScope = WorkspaceScope(
      tenantId: 'tenant-1',
      workspaceId: 'workspace-2',
    );
    var now = DateTime.utc(2026, 1, 1, 12);
    final cache = FrontendMemoryCache<String>(
      policy: const FrontendCachePolicy(
        freshFor: Duration(minutes: 1),
        staleFor: Duration(minutes: 2),
      ),
      now: () => now,
    );

    cache.put('feed:first-page', 'page-1', scope: scope);
    expect(
      cache.read('feed:first-page', scope: scope).freshness,
      FrontendCacheFreshness.fresh,
    );

    now = now.add(const Duration(minutes: 2));
    final stale = cache.read('feed:first-page', scope: scope);
    expect(stale.value, 'page-1');
    expect(stale.canServe, isTrue);
    expect(stale.freshness, FrontendCacheFreshness.stale);

    expect(cache.read('feed:first-page', scope: otherScope).isHit, isFalse);
    cache.put('feed:first-page', 'page-1', scope: scope);
    cache.invalidateWorkspace(scope);
    expect(cache.read('feed:first-page', scope: scope).isHit, isFalse);
  });

  test('permission access states expose repair action contracts', () {
    const repair = UserActionIntent(
      id: 'sources.reconnect',
      risk: UserActionRisk.credential,
      requiresConfirmation: true,
      idempotencyKey: 'workspace-1:source-1:reconnect',
    );
    const access = PermissionRequiredAccess(
      permissionKey: 'source.write',
      disabledReasonCode: 'missing_source_write',
      repairAction: repair,
    );

    expect(access.permissionKey, 'source.write');
    expect(access.disabledReasonCode, 'missing_source_write');
    expect(access.repairAction.isRisky, isTrue);
  });

  test('trace context keeps correlation and redacted log fields explicit', () {
    const trace = FrontendTraceContext(
      correlationId: 'corr-1',
      screenId: 'feed.list',
    );
    final actionTrace = trace.forAction('feed.refresh');
    final redacted = RedactedLogField.redacted('access_token');

    expect(trace.isValid, isTrue);
    expect(actionTrace.actionId, 'feed.refresh');
    expect(redacted.value, '[redacted]');
  });

  test('observability events use catalog ids and redacted fields', () {
    const trace = FrontendTraceContext(
      correlationId: 'corr-1',
      screenId: 'settings',
    );
    final event = FrontendObservedEvent(
      eventId: FrontendEventCatalog.actionInvoked,
      trace: trace.forAction('settings.diagnostics.copy'),
      fields: [
        RedactedLogField.safe('provider_payload', 'Bearer demo'),
        RedactedLogField.present('diagnostics_snapshot'),
      ],
    );
    const noop = NoopFrontendObservability();

    expect(event.isValid, isTrue);
    expect(event.fields.first.value, '[redacted]');
    expect(
      FrontendEventCatalog.isKnown('frontend.analytics_freeform'),
      isFalse,
    );
    noop.trackAction('settings.diagnostics.copy', trace, fields: event.fields);
    noop.recordNonFatal(
      StateError('demo'),
      StackTrace.empty,
      trace,
      fields: event.fields,
    );
  });

  test('pagination normalizes limits and reports next page state', () {
    const request = PageRequest(limit: 500);
    final normalized = request.normalized();
    final result = PageResult<String>(
      items: const ['a'],
      request: normalized,
      nextCursor: 'next',
    );

    expect(normalized.limit, PageRequest.maxLimit);
    expect(result.hasMore, isTrue);
  });

  test('feature flags fail closed when capability is absent', () {
    const flags = FeatureFlagSet({
      'summaries.feedback': FeatureCapability(
        key: 'summaries.feedback',
        isEnabled: true,
      ),
    });

    expect(flags.capability('summaries.feedback').isEnabled, isTrue);
    expect(flags.capability('sources.credentials').isEnabled, isFalse);
    expect(
      flags.capability('sources.credentials').disabledReasonCode,
      'capability_missing',
    );
  });
}

RealtimeEventEnvelope<String> _event(
  String eventId, {
  required int sequence,
  required WorkspaceScope scope,
}) {
  return RealtimeEventEnvelope<String>(
    streamId: 'feed',
    eventId: eventId,
    schemaVersion: 1,
    sequence: sequence,
    cursor: RealtimeCursor('cursor-$sequence'),
    scope: scope,
    payload: eventId,
  );
}
