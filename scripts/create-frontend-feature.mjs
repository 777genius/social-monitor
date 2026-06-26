import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [rawName, rawTitle, rawPurpose] = process.argv.slice(2);

if (!rawName) {
  fail(
    'Usage: npm run frontend:create-feature -- <bounded_context> "<Title>" "<Purpose>"',
  );
}

const featureName = rawName.trim();
if (!/^[a-z][a-z0-9_]*$/.test(featureName)) {
  fail('Feature name must be snake_case and start with a lowercase letter.');
}

const title = rawTitle?.trim() || toTitle(featureName);
const purpose =
  rawPurpose?.trim() ||
  `${title} workflow language, route shell and future use cases.`;
const classPrefix = toPascalCase(featureName);
const repoRoot = process.cwd();
const frontendRoot = path.join(repoRoot, 'apps', 'frontend');
const featureRoot = path.join(frontendRoot, 'features', featureName);

if (!existsSync(frontendRoot)) {
  fail('apps/frontend was not found. Run this command from the repository root.');
}

if (existsSync(featureRoot)) {
  fail(`Feature already exists: ${path.relative(repoRoot, featureRoot)}`);
}

writeNewFile(
  path.join(featureRoot, 'AGENTS.md'),
  `# ${title} Feature Agent Rules

This feature is the \`${featureName}\` bounded context.
Read this file before changing anything under \`apps/frontend/features/${featureName}\`.

## Required Reading

- Root project rules: \`../../../../AGENTS.md\`
- DDD feature standard: \`../../../../.claude/rules/ddd-clean-architecture-folders.md\`
- Frontend quality rules: \`../../../../.claude/rules/flutter-frontend-quality.md\`
- Clean Disk lessons: \`../../../../.claude/rules/flutter-clean-disk-deep-lessons.md\`
- Frontend playbooks: \`../../docs/README.md\`

## Current Mode

Mode: canonical modular DDD bounded context.

Required scaffold files:

\`\`\`text
AGENTS.md
docs/ubiquitous_language.md
docs/context_map.md
lib/social_monitor_${featureName}.dart
lib/src/presentation/routes/${featureName}_feature_route.dart
lib/src/presentation/composition/${featureName}_feature_module.dart
lib/src/presentation/composition/${featureName}_feature_module_host.dart
lib/src/presentation/pages/${featureName}_feature_page.dart
\`\`\`

## Bounded Context Purpose

${purpose}

## Growth Triggers

- a user action changes business state;
- a screen needs a MobX store or workflow state;
- data comes from generated API, cache, storage, realtime or SDKs;
- DTOs need mapping before reaching UI;
- a business rule, policy, validation or invariant appears;
- another feature needs ids, route contracts or read models from this context.

When growing, use the tactical folders from the shared DDD standard. Do not create \`ports/\`, \`adapters/\`, \`models.dart\`, \`utils.dart\` or layer-root Dart files.

## Feature Growth Rules

- Use typed shared async state and typed failures instead of loose \`isLoading\`/\`error\` fields.
- Guard async/realtime updates against stale workspace, filter, route or selection state before mutating stores.
- Keep generated DTOs and provider payload language inside infrastructure mappers or anti-corruption folders.
- Keep risky actions explicit with action id, risk, disabled reason, confirmation policy and idempotency key.
- Do not add raw route paths, direct environment flag reads, persistent cache packages or console logging in feature code.
- Realtime input needs event id, schema version, cursor, sequence, workspace scope and order guarding.
- Cache is in-memory by default and scoped to workspace unless an ADR approves persistence.
- Keep fixtures in \`test/support\` and do not store realistic tokens, API keys, secrets or raw provider payloads.

## Local Done Checks

- From \`apps/frontend\`, run \`fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart\`.
- Run \`fvm flutter analyze\` for Dart changes.
- Add focused tests for any use case, mapper, store or value object introduced here.
`,
);

writeNewFile(
  path.join(featureRoot, 'analysis_options.yaml'),
  'include: ../../analysis_options.yaml\n',
);

writeNewFile(
  path.join(featureRoot, 'pubspec.yaml'),
  `name: social_monitor_${featureName}
description: ${title} feature slice for the Social Monitor frontend.
publish_to: none
resolution: workspace

environment:
  sdk: ^3.11.0

dependencies:
  flutter:
    sdk: flutter
  modularity_flutter: ^0.3.1
  social_monitor_design_system: any
  social_monitor_shared_kernel: any

dev_dependencies:
  flutter_lints: ^6.0.0
  flutter_test:
    sdk: flutter
`,
);

writeNewFile(
  path.join(featureRoot, 'docs', 'ubiquitous_language.md'),
  `# ${title} Ubiquitous Language

## Purpose

${purpose}

## Core Terms

- ${title}: the bounded context represented by this feature.

## Forbidden Synonyms

- Do not use backend DTO names as domain terms without translating them here.

## Open Questions

- None yet.
`,
);

writeNewFile(
  path.join(featureRoot, 'docs', 'context_map.md'),
  `# ${title} Context Map

## Owning Context

- \`${featureName}\` owns ${purpose.toLowerCase()}

## Upstream Contexts

- Backend API through infrastructure anti-corruption code when needed.

## Downstream Contexts

- App routing consumes only the public feature route entrypoint.

## Integration Rules

- Do not import another feature package directly.
- Use app composition, shared kernel primitives or backend/API contracts for cross-context integration.
`,
);

writeNewFile(
  path.join(featureRoot, 'lib', `social_monitor_${featureName}.dart`),
  `library;

export 'src/presentation/routes/${featureName}_feature_route.dart';
`,
);

writeNewFile(
  path.join(
    featureRoot,
    'lib',
    'src',
    'presentation',
    'routes',
    `${featureName}_feature_route.dart`,
  ),
  `import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../composition/${featureName}_feature_module.dart';
import '../composition/${featureName}_feature_module_host.dart';

class ${classPrefix}FeatureRoute extends StatelessWidget {
  const ${classPrefix}FeatureRoute({super.key});

  @override
  Widget build(BuildContext context) {
    return ModuleScope<${classPrefix}FeatureModule>(
      module: ${classPrefix}FeatureModule(),
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: '${featureName}',
      child: const ${classPrefix}FeatureModuleHost(),
    );
  }
}
`,
);

writeNewFile(
  path.join(
    featureRoot,
    'lib',
    'src',
    'presentation',
    'composition',
    `${featureName}_feature_module.dart`,
  ),
  `import 'package:modularity_flutter/modularity_flutter.dart';

final class ${classPrefix}FeatureModule extends Module {
  @override
  void binds(Binder i) {}
}
`,
);

writeNewFile(
  path.join(
    featureRoot,
    'lib',
    'src',
    'presentation',
    'composition',
    `${featureName}_feature_module_host.dart`,
  ),
  `import 'package:flutter/widgets.dart';

import '../pages/${featureName}_feature_page.dart';

class ${classPrefix}FeatureModuleHost extends StatelessWidget {
  const ${classPrefix}FeatureModuleHost({super.key});

  @override
  Widget build(BuildContext context) {
    return const ${classPrefix}FeaturePage();
  }
}
`,
);

writeNewFile(
  path.join(
    featureRoot,
    'lib',
    'src',
    'presentation',
    'pages',
    `${featureName}_feature_page.dart`,
  ),
  `import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

class ${classPrefix}FeaturePage extends StatelessWidget {
  const ${classPrefix}FeaturePage({super.key});

  @override
  Widget build(BuildContext context) {
    return const AppPageSurface(
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: AppSectionHeader(
              eyebrow: 'Feature',
              title: '${title}',
              description: '${purpose}',
            ),
          ),
          SliverFillRemaining(
            hasScrollBody: false,
            child: AppEmptyState(
              title: '${title} shell is ready',
              message: 'Use this bounded context for its own language, use cases and workflow state.',
              icon: Icons.dashboard_customize_outlined,
            ),
          ),
        ],
      ),
    );
  }
}
`,
);

updateWorkspacePubspec(featureName);

console.log(`Created frontend feature ${featureName}.`);
console.log('Next: cd apps/frontend && fvm flutter pub get');

function writeNewFile(filePath, content) {
  if (existsSync(filePath)) {
    fail(`Refusing to overwrite ${path.relative(repoRoot, filePath)}`);
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function updateWorkspacePubspec(name) {
  const pubspecPath = path.join(frontendRoot, 'pubspec.yaml');
  const entry = `  - features/${name}`;
  const pubspec = readFileSync(pubspecPath, 'utf8');
  if (pubspec.includes(`${entry}\n`)) {
    return;
  }

  const workspaceMatch = pubspec.match(/workspace:\n(?<items>(?: {2}- .+\n)+)/);
  if (!workspaceMatch?.groups?.items) {
    fail('Could not find workspace list in apps/frontend/pubspec.yaml');
  }

  const items = workspaceMatch.groups.items
    .trimEnd()
    .split('\n')
    .concat(entry)
    .sort((left, right) => {
      const leftIsFeature = left.includes('features/');
      const rightIsFeature = right.includes('features/');
      if (leftIsFeature !== rightIsFeature) {
        return leftIsFeature ? 1 : -1;
      }
      return left.localeCompare(right);
    })
    .join('\n');

  writeFileSync(
    pubspecPath,
    pubspec.replace(workspaceMatch.groups.items, `${items}\n`),
    'utf8',
  );
}

function toPascalCase(value) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function toTitle(value) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
