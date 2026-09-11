import 'dart:convert';
import 'package:crypto/crypto.dart';

Map<String, Object?> readerDisplayFixture() {
  const title = 'Orion model discussion';
  final body = '${List.filled(40, 'Synthetic é 漢字 🚀 context.').join('\n')}\n'
      'Final correction: simulation only. <b>literal source</b>';
  final context = <String, Object?>{
    'tenantId': 'tenant-fixture', 'workspaceId': 'workspace-fixture',
    'interestId': 'interest-fixture', 'sourceBindingId': 'binding-fixture',
    'sourceItemId': 'source-fixture', 'trustedIntent': 'Synthetic model research',
    'availability': 'body_present',
  };
  final source = <String, Object?>{
    'title': title, 'body': body, 'captureAvailability': 'available',
    'reviewAvailability': 'body_present',
  };
  final headline = <String, Object?>{
    'status': 'accepted', 'kind': 'subject_label', 'text': title,
    'binding': {
      ...context, 'candidateId': 'candidate-fixture', 'providerKey': 'reddit',
      'reviewedInputDigest': _digest(jsonEncode({
        'candidateId': 'candidate-fixture', 'providerKey': 'reddit',
        'context': context, 'title': title, 'body': body,
      })),
    },
    'support': [
      {'field': 'title', 'start': 0, 'end': 5, 'quote': 'Orion'},
      {'field': 'title', 'start': 6, 'end': 11, 'quote': 'model'},
    ],
    'qualifications': <Object?>[], 'confidence': .95,
    'wholeInput': {'titleLength': title.length, 'bodyLength': body.length,
      'qualificationJudgment': 'subject_only'},
  };
  final seal = {'headline': headline, 'capturedSourceDigest': _digest(jsonEncode({
    'body': body, 'captureAvailability': 'available',
    'reviewAvailability': 'body_present', 'title': title,
  }))};
  return {'headline': headline, 'source': source, 'seal': seal,
    'payload': {'schemaVersion': 'reader_post_promotion_attestation.v2',
      'candidateId': 'candidate-fixture', 'displayHeadline': seal}};
}
String _digest(String value) => sha256.convert(utf8.encode(value)).toString();
