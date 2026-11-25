"""Actual regenerated pb2 descriptors and deterministic TS/donor wire vectors; no service."""
import hashlib
import json
import sys
import unittest
from google.protobuf import descriptor_pb2
from x_collector.v1 import x_collector_pb2 as pb

# TS-produced bytes, checked byte-for-byte against isolated frozen f338 generated TS.
VECTORS = [
    '0a710a0973796e746865746963120a323032362d30382d33301801200128013240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161613a04686f6d6542076669787475726568904e',
    '0a730a0973796e746865746963120a323032362d30382d33301801200128063240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161613a04686f6d65420766697874757265500068904e',
    '1283020a0973796e746865746963120a323032362d30382d333018012240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161612a406161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616130063a0608c0f1ffd406420608c0f1ffd4064a0608c0f1ffd406500158007800880101b2014061616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161',
    '1a250a0973796e746865746963120a323032362d30382d333018022a0042080809100118002001',
    '1286020a0973796e746865746963120a323032362d30382d333018012240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161612a406161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616130063a0608c0f1ffd406420608c0f1ffd4064a0608c0f1ffd406500158007800880101b2014061616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161ba0100',
    '1288020a0973796e746865746963120a323032362d30382d333018012240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161612a406161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616130063a0608c0f1ffd406420608c0f1ffd4064a0608c0f1ffd406500158007800880101b2014061616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161ba01020802',
    '12c7040a0973796e746865746963120a323032362d30382d333018012240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161612a406161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616130063a0608c0f1ffd406420608c0f1ffd4064a0608c0f1ffd406500158007800880101b2014061616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161ba01c0020802129e010a03323031122068747470733a2f2f782e636f6d2f666978747572652f7374617475732f3230311a0608c0f1ffd40622002801322a554e5245434f474e495a454420f09f988020585f4f42534552564154494f4e5f53544147455f484f4d453a290a050801120130121408011210393030373139393235343734303939331a020802220208022a020802420608c0f1ffd4064a0171520762696e64696e67129a010a03323031122068747470733a2f2f782e636f6d2f666978747572652f7374617475732f3230311a0608c0f1ffd406322a554e5245434f474e495a454420f09f988020585f4f42534552564154494f4e5f53544147455f484f4d453a290a050801120130121408011210393030373139393235343734303939331a020802220208022a020802420608c0f1ffd4064a0171520762696e64696e67',
]
COLLECTION = [
    ('CollectDailySearchRequest', '0801120973796e7468657469634207666978747572655a0608c0f1ffd40662020102'),
    ('CollectDailySearchResponse', '080112250a033230311a04f09f98803a1608818080808080801010ffffffffffffffffff0140015803'),
    ('CheckHealthRequest', '0a0766697874757265'),
    ('CheckHealthResponse', '0801120766697874757265'),
]
NEW_NAMES = set(['XObservationSendOffer', 'XObservationSendOutcome', 'XObservationFinished', 'XObservationMetric', 'XObservationMetrics', 'XObservationReducedObservation', 'XObservationTargetOutcome', 'XObservationTargetOutcomeCount', 'XObservationTerminalError', 'XObservationEvent', 'XObservationAcquisitionV2', 'XObservationAcquiredPost', 'XObservationStage', 'XObservationCursorState', 'XObservationMetricState', 'XObservationIdentityState', 'XObservationTargetState', 'XObservationFinishState', 'XObservationEffects', 'XObservationFailureCode', 'XObservationOutcomeKind', 'XObservationReasonCode'])
BASELINE_HASH = "719cddc8da844182087fef19efb26f90e7884c7a1c271fedbd002d53f939b028"
ADDED_HASH = "644abc9fa0ce1cb6ce2a15b8c3977af71e891638bf15cbf6e69bd8656e0c5f54"


PYTHON_FINISHED = '1a230a0973796e746865746963120a323032362d30382d3330180242080809100118002001'


def constructed_events():
    offer = pb.XObservationSendOffer(operation_id='synthetic', batch_id='2026-08-30', epoch=1,
        sequence=1, stage=1, request_digest='a'*64, destination_rule_id='home', account_ref='fixture', timeout_ms=10000)
    home = pb.XObservationEvent(send_offer=offer)
    offer.stage, offer.page_index = 6, 0
    search = pb.XObservationEvent(send_offer=offer)
    outcome = pb.XObservationSendOutcome(operation_id='synthetic', batch_id='2026-08-30', sequence=1,
        reservation_hash='a'*64, request_digest='a'*64, stage=6, outcome=1, status_code=0,
        candidate_count=0, cursor_state=1, result_hash='a'*64)
    for key in ['started_at', 'ended_at', 'response_observed_at']:
        getattr(outcome, key).FromJsonString('2026-09-08T12:00:00Z')
    v1 = pb.XObservationEvent(send_outcome=outcome)
    finished = pb.XObservationEvent(finished=pb.XObservationFinished(operation_id='synthetic',
        batch_id='2026-08-30', state=2, terminal_error=pb.XObservationTerminalError(code=9, stage=1, sequence=0, effects=1)))
    outcome.acquisition.SetInParent()
    empty = pb.XObservationEvent(send_outcome=outcome)
    outcome.acquisition.schema_version = 2
    v2empty = pb.XObservationEvent(send_outcome=outcome)
    for present in [True, False]:
        post = outcome.acquisition.acquired_posts.add(primary_id='201', canonical_url='https://x.com/fixture/status/201',
            text='UNRECOGNIZED 😀 X_OBSERVATION_STAGE_HOME', query_id='q', source_binding_id='binding')
        for key in ['published_at', 'response_observed_at']:
            getattr(post, key).FromJsonString('2026-09-08T12:00:00Z')
        if present:
            post.author_handle, post.content_kind = '', 1
        for key, decimal in [('likes', '0'), ('reposts', '9007199254740993'), ('replies', None), ('quotes', None), ('views', None)]:
            metric = getattr(post.metrics, key)
            metric.state = 2 if decimal is None else 1
            if decimal is not None:
                metric.value_decimal = decimal
    return [home, search, v1, finished, empty, v2empty, pb.XObservationEvent(send_outcome=outcome)]


class ObservationSchemaCompatibilityTest(unittest.TestCase):
    def test_exact_descriptor_projection_and_donor_closure(self):
        descriptor = descriptor_pb2.FileDescriptorProto()
        pb.DESCRIPTOR.CopyToProto(descriptor)
        # This current producer adds only the closed quote/lookup extension.
        # Preserve the immutable legacy descriptor hash by projecting precisely
        # those new tags away; every old field/type/method still binds its hash.
        extensions = {"XQuotedPost": [
            ("tweet_id", 1, 9, 1, ""), ("canonical_url", 2, 9, 1, ""),
            ("text", 3, 9, 1, ""), ("author_handle", 4, 9, 1, ""),
            ("published_at", 5, 11, 1, ".google.protobuf.Timestamp")],
            "LookupPostsRequest": [(name, index, 13 if index == 1 else 9,
                3 if index == 8 else 1, "") for index, name in enumerate([
                    "schema_version", "request_id", "tenant_id", "workspace_id",
                    "source_binding_id", "scan_job_id", "correlation_id", "tweet_ids"], 1)]}
        for name, fields in extensions.items():
            message = next(m for m in descriptor.message_type if m.name == name)
            self.assertEqual([(f.name, f.number, f.type, f.label, f.type_name) for f in message.field], fields)
            actual = descriptor_pb2.DescriptorProto()
            actual.CopyFrom(message)
            expected = descriptor_pb2.DescriptorProto(name=name)
            for field, (field_name, number, kind, label, type_name) in zip(actual.field, fields, strict=True):
                field.ClearField('json_name')
                added = expected.field.add(name=field_name, number=number, type=kind, label=label)
                if type_name:
                    added.type_name = type_name
            self.assertEqual(actual.SerializeToString(deterministic=True), expected.SerializeToString(deterministic=True))
        parent = next(m for m in descriptor.message_type if m.name == "XCollectedPost")
        extension = [f for f in parent.field if f.number == 12]
        self.assertEqual([(f.name, f.number, f.type, f.label, f.type_name) for f in extension],
            [("quoted_post", 12, 11, 1, ".social_monitor.x_collector.v1.XQuotedPost")])
        field = descriptor_pb2.FieldDescriptorProto()
        field.CopyFrom(extension[0])
        field.ClearField('json_name')
        expected_field = descriptor_pb2.FieldDescriptorProto(name="quoted_post", number=12, type=11,
            label=1, type_name=".social_monitor.x_collector.v1.XQuotedPost")
        self.assertEqual(field.SerializeToString(deterministic=True), expected_field.SerializeToString(deterministic=True))
        product = next(e for e in descriptor.enum_type if e.name == "XSearchProduct")
        self.assertEqual([(v.name, v.number) for v in product.value if v.number == 3],
                         [("X_SEARCH_PRODUCT_ID_LOOKUP", 3)])
        self.assertEqual(next(v for v in product.value if v.number == 3).SerializeToString(deterministic=True),
            descriptor_pb2.EnumValueDescriptorProto(name="X_SEARCH_PRODUCT_ID_LOOKUP", number=3).SerializeToString(deterministic=True))
        lookup = next(m for m in descriptor.service[0].method if m.name == "LookupPosts")
        self.assertEqual((lookup.input_type, lookup.output_type, lookup.client_streaming, lookup.server_streaming),
            (".social_monitor.x_collector.v1.LookupPostsRequest",
             ".social_monitor.x_collector.v1.CollectDailySearchResponse", False, False))
        self.assertEqual(lookup.SerializeToString(deterministic=True), descriptor_pb2.MethodDescriptorProto(
            name="LookupPosts", input_type=".social_monitor.x_collector.v1.LookupPostsRequest",
            output_type=".social_monitor.x_collector.v1.CollectDailySearchResponse").SerializeToString(deterministic=True))
        def normalized_hash(added):
            projected = descriptor_pb2.FileDescriptorProto()
            projected.CopyFrom(descriptor)
            selected = [m for m in projected.message_type if m.name not in extensions]
            del projected.message_type[:]
            projected.message_type.extend(selected)
            for message in projected.message_type:
                if message.name == "XCollectedPost":
                    fields = [f for f in message.field if f.number != 12]
                    del message.field[:]
                    message.field.extend(fields)
            for enum in projected.enum_type:
                if enum.name == "XSearchProduct":
                    values = [v for v in enum.value if v.number != 3]
                    del enum.value[:]
                    enum.value.extend(values)
            for service in projected.service:
                methods = [m for m in service.method if m.name != "LookupPosts"]
                del service.method[:]
                service.method.extend(methods)
            for field in ['message_type', 'enum_type']:
                selected = [item for item in getattr(projected, field) if (item.name in NEW_NAMES) == added]
                del getattr(projected, field)[:]
                getattr(projected, field).extend(selected)
            if added:
                del projected.service[:]
            def normalize(message):
                for field in message.field:
                    field.ClearField('json_name')
                for child in message.nested_type:
                    normalize(child)
            for message in projected.message_type:
                normalize(message)
            return hashlib.sha256(projected.SerializeToString(deterministic=True)).hexdigest()
        self.assertEqual(normalized_hash(False), BASELINE_HASH)
        self.assertEqual(normalized_hash(True), ADDED_HASH)
        self.assertEqual([m.name for m in descriptor.service[0].method], ['CollectDailySearch', 'CheckHealth', 'LookupPosts'])
        event = pb.XObservationEvent.DESCRIPTOR
        self.assertEqual([f.number for f in event.oneofs_by_name['payload'].fields], [1, 2, 3])
        self.assertEqual(pb.XObservationSendOutcome.DESCRIPTOR.fields_by_name['acquisition'].number, 23)

    def test_ts_python_deterministic_binary_roundtrips(self):
        for index, (hex_bytes, constructed) in enumerate(zip(VECTORS, constructed_events(), strict=True)):
            raw = bytes.fromhex(hex_bytes)
            event = pb.XObservationEvent.FromString(raw)
            expected = bytes.fromhex(PYTHON_FINISHED) if index == 3 else raw
            self.assertEqual(constructed, event)
            self.assertEqual(constructed.SerializeToString(deterministic=True), expected)
            self.assertEqual(event.SerializeToString(deterministic=True), expected)
        home, search, outcome, finished, empty, v2empty, populated = [pb.XObservationEvent.FromString(bytes.fromhex(v)) for v in VECTORS]
        self.assertFalse(home.send_offer.HasField('page_index'))
        self.assertTrue(search.send_offer.HasField('page_index'))
        self.assertEqual(search.send_offer.page_index, 0)
        for key in ['query_id', 'cursor_hash', 'parent_sequence']:
            self.assertFalse(search.send_offer.HasField(key))
        self.assertFalse(outcome.send_outcome.HasField('acquisition'))
        self.assertTrue(empty.send_outcome.HasField('acquisition'))
        self.assertEqual(v2empty.send_outcome.acquisition.schema_version, 2)
        self.assertTrue(finished.finished.terminal_error.HasField('sequence'))
        self.assertEqual(finished.finished.terminal_error.sequence, 0)
        self.assertEqual(outcome.send_outcome.started_at.ToJsonString(), '2026-09-08T12:00:00Z')
        first, second = populated.send_outcome.acquisition.acquired_posts
        self.assertTrue(first.HasField('author_handle'))
        self.assertTrue(first.HasField('content_kind'))
        self.assertFalse(second.HasField('author_handle'))
        self.assertFalse(second.HasField('content_kind'))
        self.assertEqual(first.text, 'UNRECOGNIZED 😀 X_OBSERVATION_STAGE_HOME')
        self.assertEqual(first.metrics.likes.value_decimal, '0')
        self.assertEqual(first.metrics.reposts.value_decimal, '9007199254740993')
        self.assertFalse(first.metrics.replies.HasField('value_decimal'))
        for name, hex_bytes in COLLECTION:
            raw = bytes.fromhex(hex_bytes)
            self.assertEqual(getattr(pb, name).FromString(raw).SerializeToString(deterministic=True), raw)


if __name__ == '__main__':
    if sys.argv[1:] == ['--export']:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(ObservationSchemaCompatibilityTest)
        if not unittest.TextTestRunner(stream=sys.stderr).run(suite).wasSuccessful():
            sys.exit(1)
        print(json.dumps({'producer': 'independent-python-constructors', 'vectors': [
            {'hex': event.SerializeToString(deterministic=True).hex()} for event in constructed_events()]}))
    else:
        unittest.main()
