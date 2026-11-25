part of '../frontend_architecture_boundaries_test.dart';

/// Frontend memory is in-memory by default. Every file that may touch
/// persistent browser storage or raw browser APIs is listed here with the
/// ADR that approved it; nothing else may.
const _approvedBrowserStorageFiles = <String, String>{
  'features/summaries/lib/src/infrastructure/storage/'
          'browser_preference_storage_web.dart':
      'docs/architecture-memory/398-frontend-ui-preference-browser-storage.md',
};

/// The only files that may import the approved browser storage data source.
const _browserPreferenceStorageImporterFolder =
    'features/summaries/lib/src/infrastructure/storage/';

void registerFrontendBrowserStorageArchitectureTests() {
  test('browser storage stays behind approved ADR exceptions', () {
    final frontendRoot = _frontendRootPath();
    final repoRoot = Directory(frontendRoot).parent.parent.path;
    final violations = <String>[];

    for (final entry in _approvedBrowserStorageFiles.entries) {
      if (!File('$frontendRoot/${entry.key}').existsSync()) {
        violations.add('approved browser storage file ${entry.key} is gone');
      }
      if (!File('$repoRoot/${entry.value}').existsSync()) {
        violations.add('${entry.key} cites missing ADR ${entry.value}');
      }
    }

    final normalizedRoot = _normalizePath(frontendRoot);
    for (final file in _collectDartFiles(frontendRoot)) {
      final relativePath = _normalizePath(
        file.path,
      ).substring(normalizedRoot.length + 1);
      if (!relativePath.startsWith('lib/') && !relativePath.contains('/lib/')) {
        continue;
      }
      final source = file.readAsStringSync();
      final approved = _approvedBrowserStorageFiles.containsKey(relativePath);

      if (!approved && _usesBrowserStorage(source)) {
        violations.add('$relativePath uses browser storage without an ADR');
      }
      if (!approved &&
          relativePath.startsWith('features/') &&
          _importsRawBrowserApi(_importUris(source))) {
        violations.add('$relativePath imports raw browser APIs in a feature');
      }
      if (source.contains('browser_preference_storage.dart') &&
          !relativePath.startsWith(_browserPreferenceStorageImporterFolder)) {
        violations.add(
          '$relativePath reaches browser storage outside its storage adapter',
        );
      }
    }

    expect(violations, isEmpty);
  });
}

bool _usesBrowserStorage(String source) {
  return RegExp(
    r'\b(?:localStorage|sessionStorage|indexedDB|IDBFactory)\b',
  ).hasMatch(source);
}

bool _importsRawBrowserApi(Set<String> imports) {
  return imports.any((uri) {
    return uri == 'dart:html' ||
        uri == 'dart:indexed_db' ||
        uri == 'dart:js' ||
        uri == 'dart:js_util' ||
        uri == 'dart:js_interop' ||
        uri == 'dart:js_interop_unsafe' ||
        uri.startsWith('package:web/');
  });
}

Set<String> _importUris(String source) {
  final uris = <String>{};
  for (final line in source.split('\n')) {
    final normalized = line.trim();
    if (!normalized.startsWith('import ') &&
        !normalized.startsWith('export ') &&
        !normalized.startsWith('if (')) {
      continue;
    }
    final uri = _extractImportUri(normalized);
    if (uri != null) {
      uris.add(uri);
    }
  }
  return uris;
}
