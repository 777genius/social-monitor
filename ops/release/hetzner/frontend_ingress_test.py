"""Only synthetic ZIP/TAR bytes; no Docker, external service or model calls."""
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import struct
import shutil
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

from contract import Denied
from frontend_bundle_test import archive_at, files, SHA
from frontend_ingress import stage_frontend_artifact


class FrontendIngressTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='TEST-sm-frontend-ingress-')
        self.root = Path(self.temporary.name)
        self.parent = self.root / 'staging'
        self.parent.mkdir(mode=0o700)
        self.tar = self.root / 'frontend-release.tgz'
        self.manifest = archive_at(self.tar, files())
        self.path = self.root / 'artifact.zip'

    def tearDown(self):
        self.temporary.cleanup()

    def package(self, entries=None, compression=zipfile.ZIP_DEFLATED):
        entries = entries if entries is not None else [
            ('frontend-release.tgz', self.tar.read_bytes()),
            ('frontend-manifest.json', json.dumps(self.manifest).encode())]
        with warnings.catch_warnings(), zipfile.ZipFile(self.path, 'w', compression=compression) as output:
            warnings.simplefilter('ignore', UserWarning)
            for name, data in entries:
                output.writestr(name, data)
        return self.authority()

    def authority(self):
        value = self.path.read_bytes()
        return {'sha': SHA, 'ci_run_id': '123', 'ci_run_attempt': '1', 'artifact_id': '456',
            'artifact_name': f'frontend-candidate-{SHA}-123-1',
            'artifact_sha256': 'sha256:' + hashlib.sha256(value).hexdigest(), 'artifact_bytes': len(value)}

    def stage(self, authority=None):
        return stage_frontend_artifact(self.path, authority or self.authority(), self.parent)

    def refused(self, authority=None):
        with self.assertRaises(Denied):
            self.stage(authority)
        self.assertEqual(list(self.parent.iterdir()), [])

    def test_exact_observed_zip_stages_both_lanes_and_returns_receipt_bindings(self):
        for compression in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            proof = self.package(compression=compression)
            result = self.stage(proof)
            root = Path(result['root'])
            self.assertEqual((root / 'public/release-sha.txt').read_text(), SHA + '\n')
            self.assertEqual((root / 'admin/release-sha.txt').read_text(), SHA + '\n')
            self.assertEqual(set(p.name for p in root.iterdir()), {'public', 'admin'})
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
            self.assertEqual(result['authority'], proof)
            raw = json.dumps(self.manifest).encode()
            self.assertEqual(result['manifest_sha256'], 'sha256:' + hashlib.sha256(raw).hexdigest())
            self.assertEqual(result['archive_sha256'], 'sha256:' + self.manifest['archive']['sha256'])
            self.assertEqual(result['archive_bytes'], self.tar.stat().st_size)
            shutil.rmtree(root)
        self.assertFalse((self.root / 'escape').exists())

    def test_authority_identity_hash_size_and_private_parent_fail_closed(self):
        proof = self.package()
        for key, value in [('sha', 'b' * 40), ('ci_run_id', '124'), ('ci_run_attempt', '2'),
                           ('artifact_id', '0'), ('artifact_name', 'other'),
                           ('artifact_sha256', 'sha256:' + '0' * 64),
                           ('artifact_bytes', proof['artifact_bytes'] + 1), ('artifact_bytes', 300_000_001)]:
            candidate = {**proof, key: value}
            with self.subTest(key=key, value=value): self.refused(candidate)
        self.parent.chmod(0o755)
        self.refused(proof)

    def test_exact_members_reject_duplicates_paths_links_and_executable_verifier(self):
        good = [('frontend-release.tgz', self.tar.read_bytes()),
                ('frontend-manifest.json', json.dumps(self.manifest).encode())]
        link = zipfile.ZipInfo('frontend-release.tgz')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for entries in [good + [good[0]], good + [('verify-static-release.sh', b'echo forbidden')],
                        [('../escape', b'bad'), good[1]], [('dir/frontend-release.tgz', b'bad'), good[1]],
                        [('/frontend-release.tgz', b'bad'), good[1]], [(link, b'../escape'), good[1]]]:
            with self.subTest(names=[str(name) for name, _ in entries]):
                self.refused(self.package(entries))
        self.assertFalse((self.root / 'escape').exists())

    def test_zip_member_limits_precede_decompression_and_tar_staging(self):
        self.package()
        raw = bytearray(self.path.read_bytes())
        position = raw.index(b'PK\x01\x02')
        struct.pack_into('<I', raw, position + 24, 268435457)
        self.path.write_bytes(raw)
        with patch('frontend_ingress.stage_frontend_bundle') as stage:
            self.refused()
            stage.assert_not_called()
        self.package([('frontend-release.tgz', self.tar.read_bytes()),
                      ('frontend-manifest.json', b' ' * 65537)])
        self.assertLess(self.path.stat().st_size, 10000)
        with patch('frontend_ingress.stage_frontend_bundle') as stage:
            self.refused()
            stage.assert_not_called()

    def test_central_directory_bounds_precede_zip_parser(self):
        self.package()
        raw = bytearray(self.path.read_bytes())
        end = raw.rindex(b'PK\x05\x06')
        struct.pack_into('<H', raw, end + 10, 60000)
        self.path.write_bytes(raw)
        with patch('frontend_ingress.zipfile.ZipFile') as parser:
            self.refused()
            parser.assert_not_called()
        self.package()
        with patch('frontend_ingress.MAX_CENTRAL', 1), patch('frontend_ingress.zipfile.ZipFile') as parser:
            self.refused()
            parser.assert_not_called()

    def test_crc_truncation_local_name_disagreement_and_encryption_fail_closed(self):
        for kind in ('crc', 'truncated', 'local-name', 'encrypted'):
            self.package(compression=zipfile.ZIP_STORED)
            raw = bytearray(self.path.read_bytes())
            if kind == 'crc': raw[50] ^= 1
            if kind == 'truncated': raw = raw[:-1]
            if kind == 'local-name': raw[30] = ord('x')
            if kind == 'encrypted':
                central = raw.index(b'PK\x01\x02')
                flags = struct.unpack_from('<H', raw, central + 8)[0]
                struct.pack_into('<H', raw, central + 8, flags | 1)
            self.path.write_bytes(raw)
            with self.subTest(kind=kind): self.refused()

    def test_manifest_duplicates_wrong_identity_and_inner_tar_digest_are_rejected(self):
        for kind in ('duplicate', 'attempt', 'inner-digest', 'utf8'):
            value = copy.deepcopy(self.manifest)
            if kind == 'attempt': value['ciRunAttempt'] = '2'
            if kind == 'inner-digest': value['archive']['sha256'] = '0' * 64
            raw = json.dumps(value).encode()
            if kind == 'duplicate': raw = raw.replace(b'"version": 1', b'"version": 1, "version": 1')
            if kind == 'utf8': raw = b'\xff'
            with self.subTest(kind=kind):
                self.refused(self.package([('frontend-release.tgz', self.tar.read_bytes()),
                                           ('frontend-manifest.json', raw)]))

    def test_source_links_and_replacement_during_stage_leave_no_stage(self):
        proof = self.package()
        alias = self.root / 'alias.zip'
        alias.symlink_to(self.path)
        with self.assertRaises(Denied): stage_frontend_artifact(alias, proof, self.parent)
        alias.unlink(); alias.hardlink_to(self.path)
        self.refused(proof)
        alias.unlink()
        from frontend_bundle import stage_frontend_bundle
        def replace(*args, **kwargs):
            root = stage_frontend_bundle(*args, **kwargs)
            replacement = self.root / 'replacement.zip'
            replacement.write_bytes(self.path.read_bytes())
            replacement.replace(self.path)
            return root
        with patch('frontend_ingress.stage_frontend_bundle', side_effect=replace): self.refused(proof)

    def test_archive_tree_seal_rejects_mutation_before_receiver(self):
        proof = self.package()
        from frontend_bundle import stage_frontend_bundle
        def mutate(*args, **kwargs):
            root, expected = stage_frontend_bundle(*args, **kwargs)
            path = root / 'public/main.dart.js'
            path.write_bytes(path.read_bytes() + b' injected')
            return root, expected
        with patch('frontend_ingress.stage_frontend_bundle', side_effect=mutate): self.refused(proof)

    def test_private_umask_keeps_asset_directories_readable(self):
        proof = self.package()
        previous = os.umask(0o077)
        try:
            result = self.stage(proof)
        finally:
            os.umask(previous)
        root = Path(result['root'])
        self.assertEqual(root.stat().st_mode & 0o777, 0o700)
        self.assertEqual((root / 'public').stat().st_mode & 0o777, 0o755)
        self.assertEqual((root / 'admin').stat().st_mode & 0o777, 0o755)
        shutil.rmtree(root)

    def test_small_zip64_end_records_and_streamed_zip64_members_are_supported(self):
        self.package()
        raw = self.path.read_bytes()
        end = raw.rindex(b'PK\x05\x06')
        _, _, _, count, length, offset = struct.unpack('<4H2I', raw[end + 4:end + 20])
        record = struct.pack('<4sQ2H2I4Q', b'PK\x06\x06', 44, 45, 45, 0, 0, count, count, length, offset)
        locator = struct.pack('<4sIQI', b'PK\x06\x07', 0, end, 1)
        self.path.write_bytes(raw[:end] + record + locator + raw[end:])
        self.assertTrue(Path(self.stage()['root']).is_dir())
        with zipfile.ZipFile(self.path, 'w', compression=zipfile.ZIP_DEFLATED) as output:
            for name, data in [('frontend-release.tgz', self.tar.read_bytes()),
                               ('frontend-manifest.json', json.dumps(self.manifest).encode())]:
                with output.open(name, 'w', force_zip64=True) as entry: entry.write(data)
        self.assertTrue(Path(self.stage()['root']).is_dir())


if __name__ == '__main__':
    unittest.main()
