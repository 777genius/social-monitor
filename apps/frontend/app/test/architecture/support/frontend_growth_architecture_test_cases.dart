part of '../frontend_architecture_boundaries_test.dart';

void registerFrontendGrowthArchitectureTests() {
  test('frontend async state and generated DTO boundaries stay explicit', () {
    final frontendRoot = _frontendRootPath();
    final violations = <String>[];
    final importsByFile = _collectImportsByFile('$frontendRoot/features');

    for (final entry in importsByFile.entries) {
      final path = _normalizePath(entry.key);
      final source = File(path).readAsStringSync();
      final imports = entry.value;

      if (_isPresentationStore(path)) {
        if (_hasLooseAsyncStateField(source)) {
          violations.add('$path uses loose loading/error state fields');
        }
        if (_hasAsyncWork(source) && !_hasStaleResultGuard(source)) {
          violations.add('$path has async work without stale-result guard');
        }
      }

      if (_isApplicationUseCase(path) &&
          _hasAsyncWork(source) &&
          !source.contains('Result<')) {
        violations.add('$path has async use case work without Result output');
      }

      if (_importsGeneratedApi(imports) &&
          !_allowsGeneratedApiImportInFeature(path)) {
        violations.add('$path imports generated API outside anti-corruption');
      }

      if (_isInnerFeatureLayer(path) && _usesLocalization(imports, source)) {
        violations.add('$path uses localization outside presentation');
      }
    }

    expect(violations, isEmpty);
  });

  test('frontend feature tests stay split and fixture-safe', () {
    final frontendRoot = _frontendRootPath();
    final violations = <String>[];

    for (final file in _collectDartFiles('$frontendRoot/features')) {
      final path = _normalizePath(file.path);
      if (!path.contains('/test/')) {
        continue;
      }

      if (_isFeatureRootMegaTest(path)) {
        violations.add('$path is a root-level feature mega-test candidate');
      }

      final source = file.readAsStringSync();
      final sensitivePattern = _firstSensitiveFixturePattern(source);
      if (sensitivePattern != null) {
        violations.add(
          '$path contains sensitive fixture pattern $sensitivePattern',
        );
      }
    }

    expect(violations, isEmpty);
  });

  test('frontend runtime scaling contracts stay centralized', () {
    final frontendRoot = _frontendRootPath();
    final violations = <String>[];
    final importsByFile = _collectImportsByFile('$frontendRoot/features');
    final allImportsByFile = _collectImportsByFile(frontendRoot);

    for (final entry in importsByFile.entries) {
      final path = _normalizePath(entry.key);
      if (!path.contains('/lib/')) {
        continue;
      }

      final source = File(path).readAsStringSync();
      final imports = entry.value;

      if (_hasRawRoutePathLiteral(source)) {
        violations.add('$path contains raw route path literals');
      }
      if (_readsEnvironmentFlags(imports, source)) {
        violations.add('$path reads runtime flags directly');
      }
      if (_usesConsoleLogging(source)) {
        violations.add('$path logs directly instead of traced redacted logs');
      }
      if (_importsPersistentCache(imports)) {
        violations.add('$path imports persistent cache without ADR boundary');
      }
      if (_importsDirectObservabilitySdk(imports)) {
        violations.add('$path imports direct observability SDK');
      }
      if (_hasRealtimeInput(source, imports) &&
          !_usesRealtimeOrderGuard(source)) {
        violations.add('$path handles realtime input without order guard');
      }
    }

    for (final entry in allImportsByFile.entries) {
      final path = _normalizePath(entry.key);
      if (!path.contains('/lib/')) {
        continue;
      }
      if (_importsDirectObservabilitySdk(entry.value)) {
        violations.add('$path imports direct observability SDK');
      }
    }

    for (final pubspec in _collectPubspecFiles(frontendRoot)) {
      final source = pubspec.readAsStringSync();
      if (_declaresPersistentCachePackage(source)) {
        violations.add('${pubspec.path} declares persistent cache by default');
      }
      if (_declaresDirectObservabilitySdkPackage(source)) {
        violations.add('${pubspec.path} declares direct observability SDK');
      }
    }

    final featureCatalog = File(
      '$frontendRoot/app/lib/src/routing/feature_catalog.dart',
    ).readAsStringSync();
    if (!featureCatalog.contains('FeatureRouteContract get route')) {
      violations.add('app feature catalog must expose typed route contracts');
    }
    if (featureCatalog.contains('routePath')) {
      violations.add('app feature catalog must not expose raw routePath');
    }

    final appComposition = File(
      '$frontendRoot/app/lib/src/composition/app_composition_root.dart',
    ).readAsStringSync();
    if (!appComposition.contains('FeatureRouteContract(')) {
      violations.add('app composition must register FeatureRouteContract');
    }
    if (!appComposition.contains('AppCompositionRoot.production')) {
      violations.add('app composition must expose a production runtime path');
    }
    if (!appComposition.contains('AppCompositionRoot.demo')) {
      violations.add('app composition must mark demo runtime paths explicitly');
    }

    final appMain = File('$frontendRoot/app/lib/main.dart').readAsStringSync();
    if (!appMain.contains('AppCompositionRoot.production()')) {
      violations.add('app main must use the production composition path');
    }
    if (!appMain.contains('usePathUrlStrategy();')) {
      violations.add('app main must support direct web deep links');
    }
    if (appMain.contains('AppCompositionRoot.demo') ||
        appMain.contains('AppCompositionRoot.bootstrap')) {
      violations.add('app main must not use demo or bootstrap composition');
    }

    final appDemoMain = File(
      '$frontendRoot/app/lib/main_demo.dart',
    ).readAsStringSync();
    if (!appDemoMain.contains('usePathUrlStrategy();')) {
      violations.add('app demo main must support direct web deep links');
    }

    final webIndex = File(
      '$frontendRoot/app/web/index.html',
    ).readAsStringSync();
    if (!webIndex.contains("hash.indexOf('#/') === 0") ||
        !webIndex.contains('window.history.replaceState')) {
      violations.add('web shell must migrate old hash deep links to paths');
    }

    expect(violations, isEmpty);
  });

  test('frontend pre-scale playbooks stay discoverable', () {
    final frontendRoot = _frontendRootPath();
    final repoRoot = Directory(frontendRoot).parent.parent.path;
    final violations = <String>[];
    final playbooks = {
      'frontend-ux-architecture.md': [
        'Workspace Switcher',
        'Back Behavior',
        'FeatureRouteContract',
      ],
      'design-system-component-roadmap.md': [
        'AppFilterBar',
        'AppPermissionRepairSurface',
        'AppResponsiveSplitView',
      ],
      'frontend-state-playbook.md': [
        'Recipe: List With Filters And Selection',
        'Recipe: Polling And Realtime Merge',
        'OperationGenerationGuard',
      ],
      'frontend-api-contract-playbook.md': [
        'Generated DTOs are outer-boundary details',
        'PageRequest',
        'Problem Details',
      ],
      'frontend-testing-strategy.md': [
        'Test Pyramid',
        'Responsive Test Matrix',
        'Critical Workflow Definition',
      ],
      'frontend-observability-decision.md': [
        'provider-neutral frontend observability facade',
        'Sentry',
        'OpenTelemetry',
      ],
      'frontend-security-privacy-policy.md': [
        'Credential data is never stored or logged',
        'Local Storage Policy',
        'Credential Repair UX',
      ],
    };

    final docsReadme = File('$frontendRoot/docs/README.md');
    if (!docsReadme.existsSync()) {
      violations.add('${docsReadme.path} is missing');
    } else {
      final readme = docsReadme.readAsStringSync();
      for (final playbook in playbooks.keys) {
        if (!readme.contains(playbook)) {
          violations.add('${docsReadme.path} does not link $playbook');
        }
      }
    }

    for (final entry in playbooks.entries) {
      final file = File('$frontendRoot/docs/${entry.key}');
      if (!file.existsSync()) {
        violations.add('${file.path} is missing');
        continue;
      }
      final source = file.readAsStringSync();
      for (final phrase in entry.value) {
        if (!source.contains(phrase)) {
          violations.add('${file.path} missing "$phrase"');
        }
      }
    }

    final frontendAgents = File('$frontendRoot/AGENTS.md').readAsStringSync();
    if (!frontendAgents.contains('docs/README.md')) {
      violations.add('frontend AGENTS must link docs/README.md');
    }

    final rootAgents = File('$repoRoot/AGENTS.md').readAsStringSync();
    if (!rootAgents.contains('apps/frontend/docs/README.md')) {
      violations.add('root AGENTS must link apps/frontend/docs/README.md');
    }

    final scaffold = File(
      '$repoRoot/scripts/create-frontend-feature.mjs',
    ).readAsStringSync();
    if (!scaffold.contains('Frontend playbooks')) {
      violations.add('feature scaffold must link frontend playbooks');
    }

    for (final featureRules in Directory(
      '$frontendRoot/features',
    ).listSync(recursive: true).whereType<File>()) {
      if (!featureRules.path.endsWith('/AGENTS.md')) {
        continue;
      }
      final source = featureRules.readAsStringSync();
      if (!source.contains('../../docs/README.md')) {
        violations.add('${featureRules.path} must link frontend playbooks');
      }
    }

    expect(violations, isEmpty);
  });
}

bool _hasLooseAsyncStateField(String source) {
  return RegExp(r'\bbool\s+isLoading\b').hasMatch(source) ||
      RegExp(
        r'\b(?:String|Object|Exception|AppFailure)\?\s+error\b',
      ).hasMatch(source) ||
      RegExp(
        r'\b(?:String|Object|Exception|AppFailure)\?\s+lastError\b',
      ).hasMatch(source);
}

bool _hasAsyncWork(String source) {
  return source.contains('Future<') ||
      source.contains('Stream<') ||
      source.contains('await ');
}

bool _hasStaleResultGuard(String source) {
  return source.contains('OperationGenerationGuard') ||
      source.contains('WorkspaceRequestGuard') ||
      source.contains('markOperationStarted') ||
      source.contains('staleFailureFor');
}

bool _isApplicationUseCase(String path) {
  return path.contains('/lib/src/application/use_cases/') &&
      path.endsWith('_use_case.dart');
}

bool _importsGeneratedApi(Set<String> imports) {
  return imports.any((uri) {
    return uri.startsWith('package:social_monitor_generated_api');
  });
}

bool _allowsGeneratedApiImportInFeature(String path) {
  return path.contains('/lib/src/infrastructure/api/') ||
      path.contains('/lib/src/infrastructure/api_clients/') ||
      path.contains('/lib/src/infrastructure/anti_corruption/') ||
      path.contains('/lib/src/infrastructure/data_sources/') ||
      path.contains('/lib/src/infrastructure/mappers/') ||
      path.contains('/test/infrastructure/api_clients/') ||
      path.contains('/test/infrastructure/anti_corruption/') ||
      path.contains('/test/infrastructure/data_sources/') ||
      path.contains('/test/infrastructure/mappers/');
}

bool _isInnerFeatureLayer(String path) {
  return path.contains('/lib/src/domain/') ||
      path.contains('/lib/src/application/') ||
      path.contains('/lib/src/infrastructure/');
}

bool _usesLocalization(Set<String> imports, String source) {
  return imports.any((uri) {
        return uri.startsWith('package:flutter_localizations') ||
            uri.startsWith('package:intl') ||
            uri.startsWith('package:flutter_gen') ||
            uri.contains('localization') ||
            uri.contains('localizations');
      }) ||
      source.contains('AppLocalizations') ||
      source.contains('.l10n') ||
      source.contains('context.l10n');
}

bool _isFeatureRootMegaTest(String path) {
  final match = RegExp(
    r'/features/[^/]+/test/([^/]+_test\.dart)$',
  ).firstMatch(path);
  if (match == null) {
    return false;
  }
  return match.group(1) != 'architecture_boundaries_test.dart';
}

String? _firstSensitiveFixturePattern(String source) {
  const patterns = <String, String>{
    'bearer-token': r'Bearer\s+[A-Za-z0-9._~+/=-]{8,}',
    'github-token': r'\bgh[pousr]_[A-Za-z0-9_]{10,}',
    'openai-token': r'\bsk-[A-Za-z0-9_-]{10,}',
    'slack-token': r'\bxox[baprs]-[A-Za-z0-9-]{10,}',
    'aws-access-key': r'\bAKIA[0-9A-Z]{12,}',
    'private-key': r'-----BEGIN [A-Z ]*PRIVATE KEY-----',
    'client-secret': 'client_secret\\s*[:=]\\s*["\'][^"\']{8,}',
  };

  for (final entry in patterns.entries) {
    if (RegExp(entry.value).hasMatch(source)) {
      return entry.key;
    }
  }
  return null;
}

bool _hasRawRoutePathLiteral(String source) {
  return RegExp(r'''['"]/[a-z][^'"]*['"]''').hasMatch(source);
}

bool _readsEnvironmentFlags(Set<String> imports, String source) {
  return imports.contains('dart:io') ||
      imports.any((uri) => uri.contains('dotenv')) ||
      source.contains('fromEnvironment') ||
      source.contains('hasEnvironment') ||
      source.contains('Platform.environment');
}

bool _usesConsoleLogging(String source) {
  return RegExp(r'\b(?:debugPrint|print)\s*\(').hasMatch(source);
}

bool _importsPersistentCache(Set<String> imports) {
  return imports.any(_isPersistentCacheUri);
}

bool _importsDirectObservabilitySdk(Set<String> imports) {
  return imports.any((uri) {
    return uri.startsWith('package:sentry') ||
        uri.startsWith('package:sentry_flutter') ||
        uri.startsWith('package:firebase_crashlytics') ||
        uri.startsWith('package:firebase_analytics') ||
        uri.startsWith('package:opentelemetry') ||
        uri.startsWith('package:otel');
  });
}

bool _declaresPersistentCachePackage(String source) {
  return const [
    'shared_preferences:',
    'hive:',
    'sqflite:',
    'sembast:',
    'drift:',
    'isar:',
    'objectbox:',
    'flutter_secure_storage:',
  ].any(source.contains);
}

bool _declaresDirectObservabilitySdkPackage(String source) {
  return const [
    'sentry:',
    'sentry_flutter:',
    'firebase_crashlytics:',
    'firebase_analytics:',
    'opentelemetry:',
    'otel:',
  ].any(source.contains);
}

bool _isPersistentCacheUri(String uri) {
  return uri.startsWith('package:shared_preferences') ||
      uri.startsWith('package:hive') ||
      uri.startsWith('package:sqflite') ||
      uri.startsWith('package:sembast') ||
      uri.startsWith('package:drift') ||
      uri.startsWith('package:isar') ||
      uri.startsWith('package:objectbox') ||
      uri.startsWith('package:flutter_secure_storage');
}

bool _hasRealtimeInput(String source, Set<String> imports) {
  return source.contains('Stream<') ||
      source.contains('StreamController') ||
      source.contains('WebSocket') ||
      source.contains('EventSource') ||
      imports.any((uri) {
        return uri.startsWith('package:web_socket_channel') ||
            uri.startsWith('package:socket_io_client') ||
            uri.startsWith('package:eventsource');
      });
}

bool _usesRealtimeOrderGuard(String source) {
  return source.contains('RealtimeEventOrderGuard') ||
      source.contains('RealtimeEventEnvelope');
}
