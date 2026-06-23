import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

void main() {
  testWidgets('renders problem repair command and workspace components', (
    tester,
  ) async {
    var repaired = false;
    var commanded = false;
    var switched = false;

    await _pumpSized(
      tester,
      width: 920,
      child: Column(
        children: [
          AppWorkspaceSwitcher(
            workspaceName: 'Acme alerts',
            tenantName: 'Acme',
            status: const AppStatusBadge(
              label: 'Active',
              tone: AppStatusTone.success,
            ),
            onPressed: () => switched = true,
          ),
          AppPermissionRepairSurface(
            title: 'Permission required',
            message: 'Reconnect the source to continue collection.',
            reasonCode: 'source.credential_expired',
            actionLabel: 'Repair',
            onAction: () => repaired = true,
          ),
          AppCommandBar(
            actions: [
              AppCommandAction(
                label: 'Archive',
                icon: Icons.archive_outlined,
                onPressed: () => commanded = true,
              ),
              const AppCommandAction(
                label: 'Disabled',
                onPressed: null,
                enabled: false,
                reason: 'permission_missing',
              ),
            ],
          ),
        ],
      ),
    );

    expect(find.text('Acme alerts'), findsOneWidget);
    expect(find.text('source.credential_expired'), findsOneWidget);
    await tester.tap(find.byType(AppWorkspaceSwitcher));
    await tester.tap(find.text('Repair'), warnIfMissed: false);
    await tester.tap(find.text('Archive'), warnIfMissed: false);

    expect(switched, isTrue);
    expect(repaired, isTrue);
    expect(commanded, isTrue);
  });

  testWidgets('renders filter data list entity header and pagination', (
    tester,
  ) async {
    var query = '';
    var loadMore = false;

    await _pumpSized(
      tester,
      width: 920,
      child: Column(
        children: [
          AppEntityHeader(
            title: 'Market risk',
            subtitle: 'Topic rule group',
            status: const AppStatusBadge(label: 'Healthy'),
            metadata: const [AppEntityMetadata(label: 'Mentions', value: '24')],
          ),
          AppFilterBar(
            searchValue: '',
            placeholder: 'Search topics',
            onSearchChanged: (value) => query = value,
            filters: [
              AppFilterChipData(
                label: 'Active',
                selected: true,
                onSelected: (_) {},
              ),
            ],
            onClear: () => query = '',
          ),
          AppDataList<String>(
            items: const ['one', 'two'],
            stableId: (item) => item,
            emptyTitle: 'No items',
            emptyMessage: 'Create the first item.',
            itemBuilder: (context, item, index) {
              return ListTile(title: Text(item));
            },
            footer: AppPaginationControls(
              hasMore: true,
              isLoading: false,
              summary: '2 loaded',
              onLoadMore: () => loadMore = true,
            ),
          ),
        ],
      ),
    );

    await tester.enterText(find.byType(TextFormField), 'risk');
    await tester.tap(find.text('Load more'), warnIfMissed: false);

    expect(query, 'risk');
    expect(loadMore, isTrue);
    expect(find.text('Market risk'), findsOneWidget);
    expect(find.text('Active'), findsOneWidget);
    expect(find.text('one'), findsOneWidget);
  });

  testWidgets('responsive split view shows detail only on compact screens', (
    tester,
  ) async {
    await _pumpSized(
      tester,
      width: 390,
      child: AppResponsiveSplitView(
        list: const Text('List pane'),
        detailTitle: 'Mention',
        detail: const Text('Detail pane'),
        onCloseDetail: () {},
      ),
    );

    expect(find.text('List pane'), findsNothing);
    expect(find.text('Detail pane'), findsOneWidget);
    expect(find.byTooltip('Close detail'), findsOneWidget);
  });

  testWidgets(
    'responsive split view shows list and detail on expanded screens',
    (tester) async {
      await _pumpSized(
        tester,
        width: 1280,
        child: AppResponsiveSplitView(
          list: const Text('List pane'),
          detailTitle: 'Mention',
          detail: const Text('Detail pane'),
        ),
      );

      expect(find.text('List pane'), findsOneWidget);
      expect(find.text('Detail pane'), findsOneWidget);
    },
  );

  testWidgets('data list shows empty loading and stale states', (tester) async {
    await _pumpSized(
      tester,
      width: 920,
      child: AppDataList<String>(
        items: const [],
        emptyTitle: 'No sources',
        emptyMessage: 'Connect a source.',
        itemBuilder: (context, item, index) => Text(item),
      ),
    );

    expect(find.text('No sources'), findsOneWidget);

    await _pumpSized(
      tester,
      width: 920,
      child: AppDataList<String>(
        items: const [],
        isLoading: true,
        emptyTitle: 'No sources',
        emptyMessage: 'Connect a source.',
        itemBuilder: (context, item, index) => Text(item),
      ),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await _pumpSized(
      tester,
      width: 920,
      child: AppDataList<String>(
        items: const ['source'],
        isStale: true,
        emptyTitle: 'No sources',
        emptyMessage: 'Connect a source.',
        itemBuilder: (context, item, index) => Text(item),
      ),
    );

    expect(find.text('Showing stale data'), findsOneWidget);
  });

  testWidgets('data list uses lazy viewport for long repeated rows', (
    tester,
  ) async {
    final items = List<String>.generate(120, (index) => 'row-$index');

    await _pumpSized(
      tester,
      width: 920,
      child: AppDataList<String>(
        items: items,
        stableId: (item) => item,
        emptyTitle: 'No rows',
        emptyMessage: 'Rows will appear here.',
        itemBuilder: (context, item, index) => ListTile(title: Text(item)),
      ),
    );

    expect(find.text('row-0'), findsOneWidget);
    expect(find.text('row-119'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('row-119'),
      600,
      scrollable: find.byType(Scrollable).last,
    );

    expect(find.text('row-119'), findsOneWidget);
  });
}

Future<void> _pumpSized(
  WidgetTester tester, {
  required double width,
  required Widget child,
}) async {
  final theme = AppTheme.light();
  tester.view.physicalSize = Size(width, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: MediaQuery(
            data: MediaQueryData(size: Size(width, 780)),
            child: SizedBox(
              width: double.infinity,
              height: 780,
              child: SingleChildScrollView(
                child: SizedBox(width: width, child: child),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
