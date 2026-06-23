import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../composition/auth_feature_module.dart';
import '../composition/auth_feature_module_host.dart';

class AuthFeatureRoute extends StatelessWidget {
  const AuthFeatureRoute({super.key});

  @override
  Widget build(BuildContext context) {
    return ModuleScope<AuthFeatureModule>(
      module: AuthFeatureModule(),
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: 'auth',
      child: const AuthFeatureModuleHost(),
    );
  }
}
