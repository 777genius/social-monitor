import 'dart:convert';

import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:test/test.dart';

void main() {
  test('generated binding accepts a V3 interest digest without plaintext', () {
    final binding = ReaderSummaryHeadlineBindingDto.fromJson({
      'candidateId': 'candidate-fixture',
      'providerKey': 'reddit',
      'tenantId': 'tenant-fixture',
      'workspaceId': 'workspace-fixture',
      'interestId': 'interest-fixture',
      'sourceBindingId': 'binding-fixture',
      'sourceItemId': 'source-fixture',
      'interestDigest': List.filled(64, 'a').join(),
      'availability': 'body_present',
      'reviewedInputDigest': List.filled(64, 'b').join(),
    });

    expect(binding.interestDigest, List.filled(64, 'a').join());
    expect(binding.trustedIntent, isNull);
  });

  test(
    'generated reader contract preserves exact display and captured source',
    () {
      const title = 'Orion model discussion';
      const body =
          'Synthetic é 漢字 🚀 context.\nFinal correction: simulation only.';
      final headline = {
        'status': 'accepted',
        'kind': 'subject_label',
        'text': title,
        'binding': {
          'candidateId': 'candidate-fixture',
          'providerKey': 'reddit',
          'tenantId': 'tenant-fixture',
          'workspaceId': 'workspace-fixture',
          'interestId': 'interest-fixture',
          'sourceBindingId': 'binding-fixture',
          'sourceItemId': 'source-fixture',
          'trustedIntent': 'Synthetic model research',
          'availability': 'body_present',
          'reviewedInputDigest': 'digest-fixture',
        },
        'support': [
          {'field': 'title', 'start': 0, 'end': 5, 'quote': 'Orion'},
          {'field': 'title', 'start': 6, 'end': 11, 'quote': 'model'},
        ],
        'qualifications': <Object?>[],
        'confidence': .95,
        'wholeInput': {
          'titleLength': title.length,
          'bodyLength': body.length,
          'qualificationJudgment': 'subject_only',
        },
      };
      final source = {
        'title': title,
        'body': body,
        'captureAvailability': 'available',
        'reviewAvailability': 'body_present',
      };
      final seal = {
        'headline': headline,
        'capturedSourceDigest': 'digest-fixture',
      };
      final item = ReaderSummaryReaderItemDto.fromJson({
        'title': title,
        'providerKey': 'reddit',
        'providerName': 'Reddit',
        'primaryActionKind': 'read_source',
        'reason': 'Synthetic context',
        'matchedInterestIds': <String>[],
        'matchedRules': <String>[],
        'signalScore': .7,
        'confidence': {
          'level': 'high',
          'score': .95,
          'rationale': 'Synthetic fixture',
        },
        'confirmedProviderKeys': ['reddit'],
        'providerMetrics': <Object?>[],
        'whyImportant': <String>[],
        'whyNow': 'Synthetic period',
        'citationIds': ['citation-fixture'],
        'displayHeadline': headline,
        'capturedSource': source,
        'promotionAttestation': {
          'schemaVersion': 'reader_post_promotion_attestation.v2',
          'policyVersion': 'reader_post_promotion.v2',
          'digestVersion': 'reader_post_promotion_digest.sha256.v2',
          'digest': 'digest-fixture',
          'canonicalPayload': 'synthetic transport only',
          'artifactId': 'artifact-fixture',
          'sourceWindowId': 'window-fixture',
          'slot': 1,
          'candidateId': 'candidate-fixture',
          'canonicalIdentity': 'identity-fixture',
          'placement': 'top',
          'decision': 'promote_top',
          'citationIds': ['citation-fixture'],
          'displayHeadline': seal,
        },
      });
      final encoded =
          jsonDecode(jsonEncode(item.toJson())) as Map<String, Object?>;
      expect(encoded['title'], title);
      final mappedSource = encoded['capturedSource']! as Map<String, Object?>;
      expect(mappedSource['body'], body);
      expect(mappedSource['title'], title);
      final mappedHeadline =
          encoded['displayHeadline']! as Map<String, Object?>;
      expect(mappedHeadline['text'], title);
      expect(mappedHeadline['support'], headline['support']);
      expect(mappedHeadline['qualifications'], isEmpty);
      final attestation =
          encoded['promotionAttestation']! as Map<String, Object?>;
      expect(
        (attestation['displayHeadline']! as Map<String, Object?>)['headline'],
        mappedHeadline,
      );
    },
  );

  test('generated contract preserves unavailable source-title display', () {
    const title =
        'Atlas documents agent safety findings across public websites and proposes reporting standards.';
    final headline = {'status': 'unavailable', 'reasonCode': 'not_assessed'};
    final source = {
      'title': title,
      'body': title,
      'captureAvailability': 'available',
      'reviewAvailability': 'body_present',
    };
    final item = ReaderSummaryReaderItemDto.fromJson({
      'title': title,
      'providerKey': 'reddit',
      'providerName': 'Reddit',
      'primaryActionKind': 'read_source',
      'reason': 'Selected with 1 cited source in this summary window.',
      'matchedInterestIds': <String>[],
      'matchedRules': <String>[],
      'signalScore': .7,
      'confidence': {
        'level': 'high',
        'score': .95,
        'rationale': 'Synthetic fixture',
      },
      'confirmedProviderKeys': ['reddit'],
      'providerMetrics': <Object?>[],
      'whyImportant': <String>[],
      'whyNow': 'Synthetic period',
      'citationIds': ['citation-fixture'],
      'displayHeadline': headline,
      'capturedSource': source,
    });
    final encoded =
        jsonDecode(jsonEncode(item.toJson())) as Map<String, Object?>;
    expect(encoded['title'], title);
    expect(encoded['displayHeadline'], containsPair('status', 'unavailable'));
    expect(
      (encoded['displayHeadline']! as Map<String, Object?>)['reasonCode'],
      'not_assessed',
    );
    expect((encoded['capturedSource']! as Map<String, Object?>)['body'], title);
  });
}
