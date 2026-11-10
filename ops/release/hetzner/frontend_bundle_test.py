"""An untrusted archive must never write outside its private staging directory."""
import hashlib
import io
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from contract import Denied
from frontend_bundle import ORIGINS, stage_frontend_bundle

SHA = 'a' * 40


def files():
    result = {}
    for lane, origin in ORIGINS.items():
        result.update({
            f'{lane}/release-sha.txt': (SHA + '\n').encode(),
            f'{lane}/index.html': f'flutter_bootstrap.js?v={SHA}'.encode(),
            f'{lane}/flutter_bootstrap.js': f"const configuredRelease = '{SHA}'".encode(),
            f'{lane}/flutter_service_worker.js': b'self.registration.unregister()',
            f'{lane}/main.dart.js': origin.encode(),
            f'{lane}/main.dart.wasm': b'wasm',
        })
    return result


def archive_at(path, entries, extra=None, format_id=tarfile.PAX_FORMAT):
    with tarfile.open(path, 'w:gz', format=format_id) as tar:
        for name, value in entries.items():
            info = tarfile.TarInfo(name)
            info.size = len(value)
            tar.addfile(info, io.BytesIO(value))
        if extra:
            tar.addfile(extra)
    data = path.read_bytes()
    return {'version': 1, 'sourceSha': SHA, 'ciRunId': '123', 'ciRunAttempt': '1',
            'archive': {'name': 'frontend-release.tgz', 'sha256': hashlib.sha256(data).hexdigest(),
                        'bytes': len(data)},
            'bundles': [{'lane': lane, 'sourceSha': SHA, 'ciRunId': '123', 'ciRunAttempt': '1',
                         'apiOrigin': origin} for lane, origin in ORIGINS.items()]}


class FrontendBundleTests(unittest.TestCase):
    def test_stages_exact_public_and_admin_without_changing_other_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'bundle.tgz'
            manifest = archive_at(archive, files())
            staged = stage_frontend_bundle(archive, manifest, SHA, '123', '1', root)
            self.assertEqual((staged / 'public/release-sha.txt').read_text(), SHA + '\n')
            self.assertEqual((staged / 'admin/main.dart.js').read_bytes(), ORIGINS['admin'].encode())
            self.assertEqual((staged / 'public/main.dart.js').stat().st_mode & 0o777, 0o644)

    def test_rejects_tampering_wrong_origin_and_untrusted_members_without_leaving_stage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'bundle.tgz'
            for kind in ('digest', 'identity', 'origin', 'path', 'link', 'duplicate'):
                entries = files()
                extra = None
                if kind == 'origin':
                    entries['public/main.dart.js'] = ORIGINS['admin'].encode()
                if kind == 'path':
                    entries['public/../../escape'] = b'bad'
                if kind == 'link':
                    extra = tarfile.TarInfo('public/link')
                    extra.type, extra.linkname = tarfile.SYMTYPE, '../../escape'
                if kind == 'duplicate':
                    extra = tarfile.TarInfo('public/main.dart.js')
                manifest = archive_at(archive, entries, extra)
                if kind == 'digest':
                    manifest['archive']['sha256'] = '0' * 64
                if kind == 'identity':
                    manifest['bundles'][1]['ciRunId'] = '456'
                with self.subTest(kind=kind), self.assertRaises(Denied):
                    stage_frontend_bundle(archive, manifest, SHA, '123', '1', root)
                self.assertEqual(sorted(p.name for p in root.iterdir()), ['bundle.tgz'])

    def test_refuses_archive_symlink_and_hardlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'bundle.tgz'
            manifest = archive_at(archive, files())
            alias = root / 'alias.tgz'
            alias.symlink_to(archive)
            with self.assertRaises(Denied):
                stage_frontend_bundle(alias, manifest, SHA, '123', '1', root)
            alias.unlink()
            alias.hardlink_to(archive)
            with self.assertRaises(Denied):
                stage_frontend_bundle(archive, manifest, SHA, '123', '1', root)

    def test_rejects_pax_and_gnu_extension_headers_before_parsing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'bundle.tgz'
            for format_id in (tarfile.PAX_FORMAT, tarfile.GNU_FORMAT):
                extra = tarfile.TarInfo('public/' + 'x' * 200)
                manifest = archive_at(archive, files(), extra, format_id)
                with self.subTest(format=format_id), patch('frontend_bundle._extract') as extract, \
                        self.assertRaisesRegex(Denied, 'frontend-tar-header'):
                    stage_frontend_bundle(archive, manifest, SHA, '123', '1', root)
                extract.assert_not_called()
                self.assertEqual(sorted(p.name for p in root.iterdir()), ['bundle.tgz'])

    def test_caps_decompressed_bytes_before_tar_parser(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'bundle.tgz'
            manifest = archive_at(archive, files())
            with patch('frontend_bundle.MAX_TAR', 2048), patch('frontend_bundle._extract') as extract, \
                    self.assertRaisesRegex(Denied, 'frontend-tar-size'):
                stage_frontend_bundle(archive, manifest, SHA, '123', '1', root)
            extract.assert_not_called()
            self.assertEqual(sorted(p.name for p in root.iterdir()), ['bundle.tgz'])


if __name__ == '__main__':
    unittest.main()
