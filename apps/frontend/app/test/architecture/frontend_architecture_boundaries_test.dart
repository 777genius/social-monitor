import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

part 'support/frontend_architecture_test_support.dart';
part 'support/frontend_growth_architecture_test_cases.dart';

void main() {
  registerFrontendGrowthArchitectureTests();

  test('frontend feature slices keep clean boundaries', () {
    final importsByFile = _collectImportsByFile(
      '${_frontendRootPath()}/features',
    );

    for (final entry in importsByFile.entries) {
      final path = _normalizePath(entry.key);
      final imports = entry.value;
      final isDomain = path.contains('/src/domain/');
      final isApplication = path.contains('/src/application/');
      final isInfrastructure = path.contains('/src/infrastructure/');
      final isPresentation = path.contains('/src/presentation/');
      final isFeatureComposition = _isFeatureCompositionPath(path);

      if (isDomain) {
        _expectNoImportsStartingWith(path, imports, const [
          'package:flutter',
          'package:flutter_mobx',
          'package:go_router',
          'package:mobx',
          'package:social_monitor_design_system',
          'package:social_monitor_generated_api',
        ]);
        _expectNoFeatureLayerImports(path, imports, const [
          'application',
          'infrastructure',
          'presentation',
        ]);
      }

      if (isApplication) {
        _expectNoImportsStartingWith(path, imports, const [
          'package:flutter',
          'package:flutter_mobx',
          'package:go_router',
          'package:mobx',
          'package:social_monitor_design_system',
          'package:social_monitor_generated_api',
        ]);
        _expectNoFeatureLayerImports(path, imports, const [
          'infrastructure',
          'presentation',
        ]);
      }

      if (isInfrastructure) {
        _expectNoImportsStartingWith(path, imports, const [
          'package:flutter',
          'package:flutter_mobx',
          'package:go_router',
          'package:mobx',
          'package:social_monitor_design_system',
        ]);
        _expectNoFeatureLayerImports(path, imports, const ['presentation']);
      }

      if (isPresentation) {
        _expectNoImportsStartingWith(path, imports, const [
          ..._featureCrossPackageImportPrefixes,
        ], allowSelfFeatureFor: path);
        if (!isFeatureComposition) {
          _expectNoFeatureLayerImports(path, imports, const ['infrastructure']);
        }
      }

      if (!_allowsGeneratedApiImportInFeature(path)) {
        _expectNoImportsStartingWith(path, imports, const [
          'package:social_monitor_generated_api',
        ]);
      }

      _expectNoImportsStartingWith(
        path,
        imports,
        _featureGlobalForbiddenImportPrefixes,
      );
      if (!_allowsFeatureModularityImport(path)) {
        _expectNoImportsStartingWith(path, imports, const [
          'package:modularity_flutter',
        ]);
      }

      final source = File(path).readAsStringSync();
      if (source.contains('ModuleProvider.of') &&
          !path.endsWith('_feature_module_host.dart')) {
        fail(
          'ModuleProvider.of is allowed only in feature module hosts: $path',
        );
      }
    }
  });

  test('frontend root agent rules stay discoverable', () {
    final frontendRoot = _frontendRootPath();
    final agentsFile = File('$frontendRoot/AGENTS.md');

    expect(agentsFile.existsSync(), isTrue);
    final agents = agentsFile.readAsStringSync();
    for (final requiredPhrase in _requiredFrontendAgentsPhrases.split('|')) {
      expect(agents, contains(requiredPhrase));
    }
  });

  test('headless adaptive package is consumed from pinned upstream repo', () {
    final frontendRoot = _frontendRootPath();
    final workspacePubspec = File(
      '$frontendRoot/pubspec.yaml',
    ).readAsStringSync();
    final designSystemPubspec = File(
      '$frontendRoot/packages/design_system/pubspec.yaml',
    ).readAsStringSync();

    expect(workspacePubspec, isNot(contains('packages/headless_adaptive')));
    expect(
      Directory('$frontendRoot/packages/headless_adaptive').existsSync(),
      isFalse,
    );
    expect(
      designSystemPubspec,
      contains('https://github.com/777genius/flutter_headless.git'),
    );
    expect(designSystemPubspec, contains('path: packages/headless_adaptive'));
    expect(designSystemPubspec, contains('ref: eda0637'));
  });

  test('frontend Dart files stay inside architecture size budgets', () {
    final frontendRoot = _frontendRootPath();
    final oversizedFiles = <String>[];

    for (final file in _collectDartFiles(frontendRoot)) {
      final path = _normalizePath(file.path);
      final lineCount = file.readAsLinesSync().length;
      final budget = _lineBudgetFor(path);
      if (lineCount > budget) {
        oversizedFiles.add('$path has $lineCount lines, budget is $budget');
      }
    }

    expect(oversizedFiles, isEmpty);
  });

  test('frontend analyzer options stay strict across packages', () {
    final frontendRoot = _frontendRootPath();
    final rootOptions = File(
      '$frontendRoot/analysis_options.yaml',
    ).readAsStringSync();

    for (final requiredPhrase in _requiredAnalysisOptionsPhrases.split('|')) {
      expect(rootOptions, contains(requiredPhrase));
    }

    for (final pubspec in _collectPubspecFiles(frontendRoot)) {
      final packageRoot = pubspec.parent.path;
      if (packageRoot == frontendRoot) {
        continue;
      }
      final optionsFile = File('$packageRoot/analysis_options.yaml');
      expect(optionsFile.existsSync(), isTrue, reason: packageRoot);
      expect(
        optionsFile.readAsStringSync(),
        contains('include:'),
        reason: optionsFile.path,
      );
    }
  });

  test('frontend files avoid clean disk scale triggers', () {
    final frontendRoot = _frontendRootPath();
    final violations = <String>[];

    for (final file in _collectDartFiles(frontendRoot)) {
      final path = _normalizePath(file.path);
      final source = file.readAsStringSync();

      if (_isRoutePage(path)) {
        _addMaxViolation(
          violations,
          path,
          label: 'private declarations',
          actual: _countLineMatches(source, _privateDeclarationPattern),
          max: 12,
        );
        _addMaxViolation(
          violations,
          path,
          label: 'direct store reads',
          actual: _countSourceMatches(source, RegExp(r'\bstore\.')),
          max: 30,
        );
        _addMaxViolation(
          violations,
          path,
          label: 'direct l10n reads',
          actual: _countSourceMatches(source, RegExp(r'\bl10n\.')),
          max: 40,
        );
      }

      if (_isPresentationStore(path)) {
        _addMaxViolation(
          violations,
          path,
          label: 'distinct use case dependencies',
          actual: _distinctSourceMatches(
            source,
            RegExp(r'\b[A-Z][A-Za-z0-9]*UseCase\b'),
          ).length,
          max: 8,
        );
        _addMaxViolation(
          violations,
          path,
          label: 'observable declarations',
          actual: _countLineMatches(source, _observablePattern),
          max: 20,
        );
        _addMaxViolation(
          violations,
          path,
          label: 'MobX actions',
          actual: _countLineMatches(source, RegExp(r'^@action\b')),
          max: 12,
        );
      }

      if (_hasCatchAllFileName(path)) {
        violations.add('$path uses a broad catch-all file name');
      }
    }

    expect(violations, isEmpty);
  });

  test('frontend feature folders use canonical DDD module scaffold', () {
    final frontendRoot = _frontendRootPath();
    final violations = <String>[];
    final featureDirectories = Directory(
      '$frontendRoot/features',
    ).listSync().whereType<Directory>();

    for (final featureDirectory in featureDirectories) {
      final agentsFile = File('${featureDirectory.path}/AGENTS.md');
      if (!agentsFile.existsSync()) {
        violations.add('${agentsFile.path} is missing');
        continue;
      }
      final agents = agentsFile.readAsStringSync();
      for (final requiredPhrase in _requiredFeatureAgentsPhrases.split('|')) {
        if (!agents.contains(requiredPhrase)) {
          violations.add('${agentsFile.path} missing "$requiredPhrase"');
        }
      }

      final featureName = _normalizePath(featureDirectory.path).split('/').last;
      final requiredFiles = [
        'docs/ubiquitous_language.md',
        'docs/context_map.md',
        'lib/social_monitor_$featureName.dart',
        'lib/src/presentation/routes/${featureName}_feature_route.dart',
        'lib/src/presentation/composition/${featureName}_feature_module.dart',
        'lib/src/presentation/composition/${featureName}_feature_module_host.dart',
        'lib/src/presentation/pages/${featureName}_feature_page.dart',
      ];

      for (final requiredFile in requiredFiles) {
        final file = File('${featureDirectory.path}/$requiredFile');
        if (!file.existsSync()) {
          violations.add('${file.path} is missing');
        }
      }

      final routeFile = File(
        '${featureDirectory.path}/lib/src/presentation/routes/${featureName}_feature_route.dart',
      );
      if (routeFile.existsSync()) {
        final routeSource = routeFile.readAsStringSync();
        if (!routeSource.contains('ModuleScope<')) {
          violations.add(
            '${routeFile.path} must wrap the feature in ModuleScope',
          );
        }
        if (!routeSource.contains('ModuleRetentionPolicy.routeBound')) {
          violations.add('${routeFile.path} must use routeBound retention');
        }
      }

      final moduleFile = File(
        '${featureDirectory.path}/lib/src/presentation/composition/${featureName}_feature_module.dart',
      );
      if (moduleFile.existsSync()) {
        final moduleSource = moduleFile.readAsStringSync();
        if (!moduleSource.contains('extends Module') ||
            !moduleSource.contains('void binds(Binder i)')) {
          violations.add('${moduleFile.path} must define a Modularity Module');
        }
      }
    }

    final allFeatureDirectories = Directory(
      '$frontendRoot/features',
    ).listSync(recursive: true).whereType<Directory>();
    for (final directory in allFeatureDirectories) {
      final path = _normalizePath(directory.path);
      if (!_isFeatureSourceDirectory(path)) {
        continue;
      }

      if (_hasForbiddenTechnicalFolder(path)) {
        violations.add('$path uses a technical folder name');
      }
    }

    for (final file in _collectDartFiles('$frontendRoot/features')) {
      final path = _normalizePath(file.path);
      final layer = _featureSourceLayer(path);
      if (layer == null) {
        if (_isFeatureSourceFile(path)) {
          violations.add('$path is not under a DDD layer folder');
        }
        continue;
      }
      final childFolder = _featureLayerChildFolder(path, layer);
      if (childFolder == null ||
          !_isAllowedDddTacticalFolder(layer, childFolder)) {
        violations.add('$path is not under an allowed $layer DDD folder');
      }
    }

    expect(violations, isEmpty);
  });

  test('frontend package dependencies keep scalable layer boundaries', () {
    final frontendRoot = _frontendRootPath();
    final featurePackages = _featurePackageNames(frontendRoot);

    final appPubspecPath = '$frontendRoot/app/pubspec.yaml';
    final appPubspec = File(appPubspecPath).readAsStringSync();
    _expectNoPubspecEntries(
      appPubspecPath,
      appPubspec,
      _appForbiddenPubspecEntries,
    );
    _expectPubspecEntries(appPubspecPath, appPubspec, ['modularity_flutter:']);

    for (final featurePackage in featurePackages) {
      final pubspecPath =
          '$frontendRoot/features/${featurePackage.replaceFirst('social_monitor_', '')}/pubspec.yaml';
      final pubspec = File(pubspecPath).readAsStringSync();
      final otherFeatures = featurePackages.where((name) {
        return name != featurePackage;
      });

      _expectNoPubspecEntries(pubspecPath, pubspec, [
        ..._featureForbiddenPubspecEntries,
        for (final feature in otherFeatures) '$feature:',
      ]);
      _expectPubspecEntries(pubspecPath, pubspec, ['modularity_flutter:']);
    }

    final designSystemPubspecPath =
        '$frontendRoot/packages/design_system/pubspec.yaml';
    final designSystemPubspec = File(
      designSystemPubspecPath,
    ).readAsStringSync();
    _expectNoPubspecEntries(designSystemPubspecPath, designSystemPubspec, [
      ..._designSystemForbiddenPubspecEntries,
      for (final feature in featurePackages) '$feature:',
    ]);

    final sharedKernelPubspecPath =
        '$frontendRoot/packages/shared_kernel/pubspec.yaml';
    final sharedKernelPubspec = File(
      sharedKernelPubspecPath,
    ).readAsStringSync();
    _expectNoPubspecEntries(sharedKernelPubspecPath, sharedKernelPubspec, [
      ..._sharedKernelForbiddenPubspecEntries,
      for (final feature in featurePackages) '$feature:',
    ]);

    final generatedApiPubspecPath =
        '$frontendRoot/packages/generated_api/pubspec.yaml';
    final generatedApiPubspec = File(
      generatedApiPubspecPath,
    ).readAsStringSync();
    _expectNoPubspecEntries(generatedApiPubspecPath, generatedApiPubspec, [
      ..._generatedApiForbiddenPubspecEntries,
      for (final feature in featurePackages) '$feature:',
    ]);
  });

  test('app shell uses feature public APIs only', () {
    final frontendRoot = _frontendRootPath();
    final importsByFile = _collectImportsByFile('$frontendRoot/app/lib');

    for (final entry in importsByFile.entries) {
      final path = _normalizePath(entry.key);
      _expectNoImportsStartingWith(
        path,
        entry.value,
        _appForbiddenImportPrefixes,
      );
      if (!_allowsAppModularityImport(path)) {
        _expectNoImportsStartingWith(path, entry.value, const [
          'package:modularity_flutter',
        ]);
      }
      _expectNoImportContains(path, entry.value, const [
        '/features/',
        '/lib/src/',
      ]);
    }
  });

  test('design system stays product UI only', () {
    final frontendRoot = _frontendRootPath();
    final importsByFile = _collectImportsByFile(
      '$frontendRoot/packages/design_system/lib',
    );

    for (final entry in importsByFile.entries) {
      final path = _normalizePath(entry.key);
      _expectNoImportsStartingWith(
        path,
        entry.value,
        _designSystemForbiddenImportPrefixes,
      );
    }
  });

  test('generated API stays framework neutral', () {
    final frontendRoot = _frontendRootPath();
    final importsByFile = _collectImportsByFile(
      '$frontendRoot/packages/generated_api/lib',
    );

    for (final entry in importsByFile.entries) {
      final path = _normalizePath(entry.key);
      _expectNoImportsStartingWith(
        path,
        entry.value,
        _generatedApiForbiddenImportPrefixes,
      );
    }
  });

  test('shared kernel stays framework neutral', () {
    final frontendRoot = _frontendRootPath();
    final importsByFile = _collectImportsByFile(
      '$frontendRoot/packages/shared_kernel/lib',
    );

    for (final entry in importsByFile.entries) {
      final path = _normalizePath(entry.key);
      _expectNoImportsStartingWith(
        path,
        entry.value,
        _sharedKernelForbiddenImportPrefixes,
      );
    }
  });

  test('feature public barrels expose only route entrypoints', () {
    final frontendRoot = _frontendRootPath();
    final invalidExports = <String>[];

    for (final featureDir in Directory('$frontendRoot/features').listSync()) {
      if (featureDir is! Directory) {
        continue;
      }
      final featureName = _normalizePath(featureDir.path).split('/').last;
      final barrel = File(
        '${featureDir.path}/lib/social_monitor_$featureName.dart',
      );
      if (!barrel.existsSync()) {
        invalidExports.add('${barrel.path} is missing');
        continue;
      }

      for (final line in barrel.readAsLinesSync()) {
        final normalized = line.trim();
        if (!normalized.startsWith('export ')) {
          continue;
        }
        if (!RegExp(
          r"^export 'src/presentation/routes/[a-z0-9_]+_feature_route\.dart';$",
        ).hasMatch(normalized)) {
          invalidExports.add('${barrel.path}: $normalized');
        }
      }
    }

    expect(invalidExports, isEmpty);
  });
}
