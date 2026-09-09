import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_display_headline_verifier.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_display_source_mapper.dart';

import '../../support/reader_display_headline_fixture.dart';

bool verify(Map<String, Object?> fixture, {String title = 'Orion model discussion',
    String workspaceId = 'workspace-fixture', String sourceItemId = 'source-fixture'}) =>
  verifyReaderDisplayHeadline(payload: fixture['payload']! as Map<String, Object?>,
    headline: fixture['headline'], source: fixture['source'], outerSeal: fixture['seal'],
    title: title, providerKey: 'reddit', tenantId: 'tenant-fixture',
    workspaceId: workspaceId, sourceItemId: sourceItemId, sourceCandidateId: 'candidate-fixture');

void main() {
  test('exact accepted text and full Unicode source survive verification and mapping', () {
    final fixture = readerDisplayFixture();
    expect(verify(fixture), isTrue);
    expect(mapReaderDisplayHeadline(fixture['headline'])!.text, 'Orion model discussion');
    final source = mapReaderCapturedSource(fixture['source'])!;
    expect(source.body, (fixture['source']! as Map<String, Object?>)['body']);
    expect(source.body, contains('Final correction: simulation only. <b>literal source</b>'));
  });
  test('title, scope and source identity mismatch fail closed', () {
    final fixture = readerDisplayFixture();
    expect(verify(fixture, title: 'Invented claim'), isFalse);
    expect(verify(fixture, workspaceId: 'other-workspace'), isFalse);
    expect(verify(fixture, sourceItemId: 'other-source'), isFalse);
  });
  for (final field in ['headline', 'source', 'seal']) {
    test('missing $field cannot inherit display authority', () {
      final fixture = readerDisplayFixture()..remove(field);
      expect(verify(fixture), isFalse);
    });
  }
  test('changed tail, unknown status and unknown review availability fail closed', () {
    final changedTail = readerDisplayFixture();
    (changedTail['source']! as Map<String, Object?>)['body'] = 'Different source tail';
    expect(verify(changedTail), isFalse);
    final unknown = readerDisplayFixture();
    (unknown['headline']! as Map<String, Object?>)['status'] = 'future';
    expect(verify(unknown), isFalse);
    final unavailable = readerDisplayFixture();
    (unavailable['source']! as Map<String, Object?>)['reviewAvailability'] = 'future';
    expect(verify(unavailable), isFalse);
  });
  test('historical absence stays historical without synthesized authority', () {
    final fixture = <String, Object?>{'payload': <String, Object?>{
      'schemaVersion': 'reader_post_promotion_attestation.v2'}};
    expect(verify(fixture), isTrue);
    expect(mapReaderDisplayHeadline(null), isNull);
    expect(mapReaderCapturedSource(null), isNull);
  });
}
