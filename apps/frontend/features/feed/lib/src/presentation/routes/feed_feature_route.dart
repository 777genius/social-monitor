import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/feed_feature_module.dart';
import '../composition/feed_feature_module_host.dart';
import '../stores/feed_items_store.dart';

class FeedFeatureRoute extends StatelessWidget {
  FeedFeatureRoute({super.key}) : _module = FeedFeatureModule();

  FeedFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    String? interestId,
    String? interestTitle,
  }) : _module = FeedFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         initialInterestId: interestId,
         initialInterestTitle: interestTitle,
       );

  final FeedFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    const host = FeedFeatureModuleHost();
    return ModuleScope<FeedFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      loadingBuilder: (context) => const _LoadedModuleFallback(child: host),
      child: host,
    );
  }
}

class _LoadedModuleFallback extends StatefulWidget {
  const _LoadedModuleFallback({required this.child});

  final Widget child;

  @override
  State<_LoadedModuleFallback> createState() => _LoadedModuleFallbackState();
}

class _LoadedModuleFallbackState extends State<_LoadedModuleFallback> {
  Timer? _statusCheckTimer;

  @override
  void initState() {
    super.initState();
    _statusCheckTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _statusCheckTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.getInheritedWidgetOfExactType<ModuleProvider>();
    final store = provider?.controller.binder.tryGet<FeedItemsStore>();
    if (store != null) {
      _statusCheckTimer?.cancel();
      return widget.child;
    }

    return const Center(
      child: Text('Loading feed', textDirection: TextDirection.ltr),
    );
  }
}
