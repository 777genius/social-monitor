import 'dart:async';

import 'package:flutter/material.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/published_summaries_feature_module.dart';
import '../composition/published_summaries_feature_module_host.dart';

class PublishedSummariesFeatureRoute extends StatelessWidget {
  PublishedSummariesFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    String? summaryId,
    Object? initialBootstrap,
    void Function(String summaryId)? onSummarySelected,
    FutureOr<void> Function(Uri uri)? onOpenReaderSource,
  }) : _module = PublishedSummariesFeatureModule(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         summaryId: summaryId,
         initialBootstrap: initialBootstrap,
         onSummarySelected: onSummarySelected,
         onOpenReaderSource: onOpenReaderSource,
       );

  final PublishedSummariesFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    final host = PublishedSummariesFeatureModuleHost(module: _module);
    return ModuleScope<PublishedSummariesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      loadingBuilder: (context) => const Center(
        key: ValueKey('published-summary-module-loading'),
        child: CircularProgressIndicator(),
      ),
      child: host,
    );
  }
}
