part of '../frontend_architecture_boundaries_test.dart';

void _expectNoImportsStartingWith(
  String path,
  Set<String> actualImports,
  List<String> forbiddenPrefixes, {
  String? allowSelfFeatureFor,
}) {
  final selfPackage = _packageNameForPath(allowSelfFeatureFor ?? '');
  final forbiddenImports = actualImports.where((uri) {
    if (selfPackage != null && uri.startsWith('package:$selfPackage/src/')) {
      return false;
    }
    return forbiddenPrefixes.any(uri.startsWith);
  }).toList();

  expect(forbiddenImports, isEmpty, reason: path);
}

void _expectNoFeatureLayerImports(
  String path,
  Set<String> actualImports,
  List<String> forbiddenLayers,
) {
  final forbiddenImports = actualImports.where((uri) {
    return forbiddenLayers.any((layer) {
      return _importReferencesFeatureLayer(uri, layer);
    });
  }).toList();

  expect(forbiddenImports, isEmpty, reason: path);
}

void _expectNoImportContains(
  String path,
  Set<String> actualImports,
  List<String> forbiddenFragments,
) {
  final forbiddenImports = actualImports.where((uri) {
    return forbiddenFragments.every(uri.contains);
  }).toList();

  expect(forbiddenImports, isEmpty, reason: path);
}

bool _importReferencesFeatureLayer(String uri, String layer) {
  return uri.contains('/src/$layer/') ||
      uri.contains('../$layer/') ||
      uri.startsWith('$layer/');
}

Map<String, Set<String>> _collectImportsByFile(String directoryPath) {
  final directory = Directory(directoryPath);
  final importsByFile = <String, Set<String>>{};

  for (final entity in directory.listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.dart')) {
      continue;
    }

    final imports = <String>{};
    for (final line in entity.readAsLinesSync()) {
      final normalized = line.trim();
      if (!normalized.startsWith('import ') &&
          !normalized.startsWith('export ') &&
          !normalized.startsWith('part ')) {
        continue;
      }
      final uri = _extractImportUri(normalized);
      if (uri != null) {
        imports.add(uri);
      }
    }
    importsByFile[entity.path] = imports;
  }

  return importsByFile;
}

List<File> _collectDartFiles(String directoryPath) {
  final directory = Directory(directoryPath);
  final files = <File>[];

  for (final entity in directory.listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.dart')) {
      continue;
    }
    final path = _normalizePath(entity.path);
    if (path.contains('/.dart_tool/') ||
        path.contains('/build/') ||
        path.endsWith('.g.dart') ||
        path.endsWith('.freezed.dart')) {
      continue;
    }
    files.add(entity);
  }

  return files;
}

List<File> _collectPubspecFiles(String directoryPath) {
  final directory = Directory(directoryPath);
  final files = <File>[];

  for (final entity in directory.listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('pubspec.yaml')) {
      continue;
    }
    final path = _normalizePath(entity.path);
    if (path.contains('/.dart_tool/') || path.contains('/build/')) {
      continue;
    }
    files.add(entity);
  }

  return files;
}

int _lineBudgetFor(String normalizedPath) {
  if (normalizedPath.contains('/test/')) {
    return 600;
  }
  if (normalizedPath.contains('/lib/src/components/')) {
    return 250;
  }
  if (normalizedPath.contains('/lib/src/presentation/')) {
    return 400;
  }
  if (normalizedPath.contains('/lib/src/routing/')) {
    return 250;
  }
  if (normalizedPath.contains('/lib/src/composition/')) {
    return 350;
  }
  if (normalizedPath.contains('/lib/src/infrastructure/')) {
    return 400;
  }
  if (normalizedPath.contains('/lib/src/theme/') ||
      normalizedPath.contains('/lib/src/tokens/') ||
      normalizedPath.contains('/lib/src/responsive/')) {
    return 250;
  }
  return 600;
}

final _privateDeclarationPattern = RegExp(
  r'^(?:final\s+|base\s+|interface\s+|sealed\s+|abstract\s+)*'
  r'(?:class|mixin|enum|extension|typedef)\s+_',
);

final _observablePattern = RegExp(
  r'^(?:late\s+)?(?:final\s+)?(?:Observable|ObservableList|ObservableMap|'
  r'ObservableSet|@observable\b)',
);

void _addMaxViolation(
  List<String> violations,
  String path, {
  required String label,
  required int actual,
  required int max,
}) {
  if (actual > max) {
    violations.add('$path has $actual $label, max is $max');
  }
}

int _countLineMatches(String source, RegExp pattern) {
  return source.split('\n').where((line) {
    return pattern.hasMatch(line.trim());
  }).length;
}

int _countSourceMatches(String source, RegExp pattern) {
  return pattern.allMatches(source).length;
}

Set<String> _distinctSourceMatches(String source, RegExp pattern) {
  return pattern.allMatches(source).map((match) => match.group(0)!).toSet();
}

bool _isRoutePage(String path) {
  return path.contains('/lib/src/presentation/') && path.endsWith('_page.dart');
}

bool _isPresentationStore(String path) {
  return path.contains('/lib/src/presentation/stores/') &&
      path.endsWith('_store.dart');
}

bool _hasCatchAllFileName(String path) {
  final fileName = path.split('/').last;
  return const {
    'models.dart',
    'dtos.dart',
    'mapper.dart',
    'mappers.dart',
    'widgets.dart',
    'helpers.dart',
    'utils.dart',
    'manager.dart',
  }.contains(fileName);
}

bool _isFeatureSourceDirectory(String path) {
  return path.contains('/features/') && path.contains('/lib/src/');
}

bool _isFeatureSourceFile(String path) {
  return path.contains('/features/') && path.contains('/lib/src/');
}

bool _hasForbiddenTechnicalFolder(String path) {
  final segments = path.split('/');
  return segments.contains('ports') || segments.contains('adapters');
}

const _allowedDddFoldersByLayer = <String, String>{
  'domain':
      ' aggregates entities value_objects domain_events policies specifications repositories domain_services ',
  'application': ' use_cases commands queries handlers results contracts ',
  'infrastructure':
      ' api api_clients persistence realtime storage mappers repositories data_sources anti_corruption ',
  'presentation':
      ' routes composition pages layout components stores view_models workflows formatters ',
};

const _requiredFeatureAgentsPhrases =
    '.claude/rules/ddd-clean-architecture-folders.md|.claude/rules/flutter-frontend-quality.md|Frontend playbooks|Mode: canonical modular DDD bounded context|Required scaffold files|Growth Triggers|Feature Growth Rules|Local Done Checks';

const _requiredFrontendAgentsPhrases =
    '../../AGENTS.md|../../.claude/rules/ddd-clean-architecture-folders.md|../../.claude/rules/flutter-frontend-quality.md|Feature Architecture|Package Boundaries|frontend:create-feature|ModuleScope|Local Done Checks';

const _requiredAnalysisOptionsPhrases =
    'strict-casts: true|strict-inference: true|strict-raw-types: true|unawaited_futures: true|avoid_print: true';

const _frontendRestImportPrefixes = <String>[
  'package:dio',
  'package:openapi_retrofit_generator',
  'package:retrofit',
];

const _frontendRestPubspecEntries = <String>[
  'dio:',
  'openapi_retrofit_generator:',
  'retrofit:',
  'retrofit_generator:',
];

const _featureGlobalForbiddenImportPrefixes = <String>[
  'dart:io',
  ..._frontendRestImportPrefixes,
  'package:flutter_modular',
  'package:get_it',
  'package:headless',
  'package:headless_adaptive',
  'package:naked_ui',
];

const _featureCrossPackageImportPrefixes = <String>[
  'package:social_monitor_auth/src/',
  'package:social_monitor_feed/src/',
  'package:social_monitor_settings/src/',
  'package:social_monitor_sources/src/',
  'package:social_monitor_summaries/src/',
  'package:social_monitor_interests/src/',
];

const _appForbiddenImportPrefixes = <String>[
  'dart:io',
  ..._frontendRestImportPrefixes,
  'package:headless',
  'package:headless_adaptive',
  'package:flutter_modular',
  'package:get_it',
  'package:naked_ui',
  ..._featureCrossPackageImportPrefixes,
];

const _designSystemForbiddenImportPrefixes = <String>[
  ..._frontendRestImportPrefixes,
  'package:go_router',
  'package:get_it',
  'package:mobx',
  'package:modularity_flutter',
  'package:flutter_modular',
  'package:flutter_mobx',
  'package:social_monitor_app',
  'package:social_monitor_auth',
  'package:social_monitor_feed',
  'package:social_monitor_generated_api',
  'package:social_monitor_settings',
  'package:social_monitor_shared_kernel',
  'package:social_monitor_sources',
  'package:social_monitor_summaries',
  'package:social_monitor_interests',
];

const _generatedApiForbiddenImportPrefixes = <String>[
  'dart:io',
  'dart:ui',
  'package:flutter',
  'package:flutter_mobx',
  'package:go_router',
  'package:headless',
  'package:headless_adaptive',
  'package:flutter_modular',
  'package:get_it',
  'package:mobx',
  'package:modularity_flutter',
  'package:naked_ui',
  'package:social_monitor_app',
  'package:social_monitor_auth',
  'package:social_monitor_design_system',
  'package:social_monitor_feed',
  'package:social_monitor_settings',
  'package:social_monitor_sources',
  'package:social_monitor_summaries',
  'package:social_monitor_interests',
];

const _sharedKernelForbiddenImportPrefixes = <String>[
  'dart:io',
  'dart:ui',
  ..._frontendRestImportPrefixes,
  'package:flutter',
  'package:flutter_mobx',
  'package:go_router',
  'package:headless',
  'package:headless_adaptive',
  'package:flutter_modular',
  'package:get_it',
  'package:mobx',
  'package:modularity_flutter',
  'package:naked_ui',
  'package:social_monitor_app',
  'package:social_monitor_auth',
  'package:social_monitor_design_system',
  'package:social_monitor_feed',
  'package:social_monitor_generated_api',
  'package:social_monitor_settings',
  'package:social_monitor_sources',
  'package:social_monitor_summaries',
  'package:social_monitor_interests',
];

const _appForbiddenPubspecEntries = <String>[
  ..._frontendRestPubspecEntries,
  'mobx:',
  'flutter_mobx:',
  'flutter_modular:',
  'get_it:',
  'headless:',
  'headless_adaptive:',
];

const _featureForbiddenPubspecEntries = <String>[
  ..._frontendRestPubspecEntries,
  'go_router:',
  'flutter_modular:',
  'get_it:',
  'headless:',
  'headless_adaptive:',
];

const _designSystemForbiddenPubspecEntries = <String>[
  ..._frontendRestPubspecEntries,
  'go_router:',
  'mobx:',
  'flutter_mobx:',
  'flutter_modular:',
  'get_it:',
  'modularity_flutter:',
  'social_monitor_generated_api:',
  'social_monitor_shared_kernel:',
];

const _sharedKernelForbiddenPubspecEntries = <String>[
  ..._frontendRestPubspecEntries,
  'flutter:',
  'go_router:',
  'mobx:',
  'flutter_mobx:',
  'flutter_modular:',
  'get_it:',
  'headless:',
  'headless_adaptive:',
  'modularity_flutter:',
  'social_monitor_app:',
  'social_monitor_design_system:',
  'social_monitor_generated_api:',
];

const _generatedApiForbiddenPubspecEntries = <String>[
  'flutter:',
  'go_router:',
  'mobx:',
  'flutter_mobx:',
  'flutter_modular:',
  'get_it:',
  'modularity_flutter:',
  'social_monitor_design_system:',
];

String? _featureSourceLayer(String path) {
  final match = RegExp(
    r'/features/[^/]+/lib/src/(domain|application|infrastructure|presentation)(?:/|$)',
  ).firstMatch(path);
  return match?.group(1);
}

String? _featureLayerChildFolder(String path, String layer) {
  final marker = '/lib/src/$layer/';
  final markerIndex = path.indexOf(marker);
  if (markerIndex == -1) {
    return null;
  }

  final relativePath = path.substring(markerIndex + marker.length);
  if (!relativePath.contains('/')) {
    return null;
  }
  return relativePath.split('/').first;
}

bool _isAllowedDddTacticalFolder(String layer, String folder) {
  return _allowedDddFoldersByLayer[layer]?.contains(' $folder ') ?? false;
}

void _expectNoPubspecEntries(
  String path,
  String pubspec,
  List<String> forbiddenEntries,
) {
  final matches = forbiddenEntries.where(pubspec.contains).toList();
  expect(matches, isEmpty, reason: path);
}

void _expectPubspecEntries(
  String path,
  String pubspec,
  List<String> requiredEntries,
) {
  final missing = requiredEntries.where((entry) {
    return !pubspec.contains(entry);
  }).toList();
  expect(missing, isEmpty, reason: path);
}

bool _isFeatureCompositionPath(String path) {
  return path.contains('/features/') &&
      path.contains('/lib/src/presentation/composition/');
}

bool _allowsFeatureModularityImport(String path) {
  return path.contains('/features/') &&
      (path.contains('/lib/src/presentation/routes/') ||
          path.contains('/lib/src/presentation/composition/'));
}

bool _allowsAppModularityImport(String path) {
  return path.endsWith('/app/lib/src/app/social_monitor_app.dart');
}

String? _extractImportUri(String line) {
  final firstSingleQuote = line.indexOf("'");
  final firstDoubleQuote = line.indexOf('"');
  final firstQuote = switch ((firstSingleQuote, firstDoubleQuote)) {
    (-1, -1) => -1,
    (-1, _) => firstDoubleQuote,
    (_, -1) => firstSingleQuote,
    _ when firstSingleQuote < firstDoubleQuote => firstSingleQuote,
    _ => firstDoubleQuote,
  };
  if (firstQuote == -1) {
    return null;
  }

  final quote = line[firstQuote];
  final secondQuote = line.indexOf(quote, firstQuote + 1);
  if (secondQuote == -1) {
    return null;
  }

  return line.substring(firstQuote + 1, secondQuote);
}

String _normalizePath(String path) => path.replaceAll(r'\', '/');

String _frontendRootPath() {
  final current = Directory.current;
  if (_looksLikeFrontendRoot(current)) {
    return current.path;
  }

  final parent = current.parent;
  if (_looksLikeFrontendRoot(parent)) {
    return parent.path;
  }

  var scriptDirectory = File.fromUri(Platform.script).parent;
  while (scriptDirectory.path != scriptDirectory.parent.path) {
    if (_looksLikeFrontendRoot(scriptDirectory)) {
      return scriptDirectory.path;
    }
    scriptDirectory = scriptDirectory.parent;
  }

  throw StateError('Could not locate frontend root from ${current.path}.');
}

bool _looksLikeFrontendRoot(Directory directory) {
  return File('${directory.path}/pubspec.yaml').existsSync() &&
      Directory('${directory.path}/features').existsSync() &&
      Directory('${directory.path}/app').existsSync();
}

List<String> _featurePackageNames(String frontendRoot) {
  final featuresDirectory = Directory('$frontendRoot/features');
  final names = <String>[];

  for (final entity in featuresDirectory.listSync()) {
    if (entity is! Directory) {
      continue;
    }
    final featureName = _normalizePath(entity.path).split('/').last;
    names.add('social_monitor_$featureName');
  }

  names.sort();
  return names;
}

String? _packageNameForPath(String path) {
  final match = RegExp(r'features/([^/]+)/').firstMatch(_normalizePath(path));
  if (match == null) {
    return null;
  }
  return 'social_monitor_${match.group(1)}';
}
