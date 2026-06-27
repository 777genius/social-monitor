import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../../application/contracts/session_gateway.dart';
import '../../application/use_cases/restore_session_use_case.dart';
import '../../application/use_cases/select_workspace_use_case.dart';
import '../pages/auth_feature_page.dart';
import '../stores/auth_bootstrap_store.dart';

class AuthFeatureModuleHost extends StatefulWidget {
  const AuthFeatureModuleHost({super.key});

  @override
  State<AuthFeatureModuleHost> createState() => _AuthFeatureModuleHostState();
}

class _AuthFeatureModuleHostState extends State<AuthFeatureModuleHost> {
  AuthBootstrapStore? _store;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_store != null) {
      return;
    }
    final binder = ModuleProvider.of(context, listen: false);
    final gateway = binder.get<SessionGateway>();
    _store = AuthBootstrapStore(
      restoreSession: RestoreSessionUseCase(gateway),
      selectWorkspace: SelectWorkspaceUseCase(gateway),
    );
  }

  @override
  void dispose() {
    _store?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = _store;
    if (store == null) {
      return const SizedBox.shrink();
    }
    return AuthFeaturePage(store: store);
  }
}
