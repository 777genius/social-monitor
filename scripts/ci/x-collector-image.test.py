#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('x-collector-image.sh')
SHA = 'a' * 40
IMAGE = 'sha256:' + 'b' * 64

class CandidateTest(unittest.TestCase):
    def run_candidate(self, mode='ok'):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            binpath = root / 'bin'; binpath.mkdir()
            (binpath / 'git').write_text('#!/bin/sh\nprintf "%s\\n" "$GITHUB_SHA"\n')
            (binpath / 'sudo').write_text('#!/bin/sh\nif [ "$1" = chown ]; then exit 0; fi\nexec "$@"\n')
            (binpath / 'docker').write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
a=sys.argv[1:]; mode=os.environ['CASE']; log=Path(os.environ['LOG'])
with log.open('a') as f: f.write(' '.join(a)+'\\n')
if a[0]=='version': print('28.0.0' if mode=='docker28' else '29.8.1'); sys.exit(0)
if a[0]=='info': print(json.dumps([['driver-type', 'overlay2' if mode=='legacy_store' else 'io.containerd.snapshotter.v1']])); sys.exit(0)
if a[0]=='build':
 assert '--platform' in a and a[a.index('--platform')+1]=='linux/amd64' and '--provenance=false' in a
 sys.exit(0)
if a[:2]==['image','inspect']:
 template=a[-1]
 if '.Id' in template: value='sha256:'+'b'*64
 elif '.Descriptor' in template:
  value=json.dumps({'digest':'sha256:'+('c' if mode=='digest' else 'b')*64,
    'mediaType':'application/vnd.oci.image.'+('index' if mode=='index' else 'manifest')+'.v1+json'})
 elif '.Os' in template: value='linux/arm64' if mode=='platform' else 'linux/amd64'
 else: value='c'*40 if mode=='revision' else os.environ['GITHUB_SHA']
 print(value); sys.exit(0)
if a[0]=='run':
 assert '--network' in a and a[a.index('--network')+1]=='none' and '--read-only' in a
 state=a[a.index('--mount')+1].split('src=')[1].split(',')[0]
 held='phase=held' in Path(state,'x-launch-state.v1').read_text()
 if not held or mode=='guard': sys.exit(0)
 if mode in ('125','127'): sys.exit(int(mode))
 print('x-launch-denied: '+('other' if mode=='wrong_message' else 'X source launch is held'),file=sys.stderr)
 sys.exit(75)
if a[0]=='save': Path(a[a.index('-o')+1]).write_bytes(b'synthetic image'); sys.exit(0)
sys.exit(9)
''')
            for p in binpath.iterdir(): p.chmod(0o755)
            env = dict(os.environ, PATH=f'{binpath}:'+os.environ['PATH'], RUNNER_TEMP=td,
                       GITHUB_SHA=SHA,GITHUB_RUN_ID='123',GITHUB_RUN_ATTEMPT='2',
                       CASE=mode,LOG=str(root/'calls'))
            result=subprocess.run(['bash',str(SCRIPT)],env=env,capture_output=True,text=True)
            manifest=root/'x-collector-candidate'/'manifest.json'
            data=json.loads(manifest.read_text()) if manifest.exists() else None
            return result.returncode, data, (root/'calls').read_text()

    def test_image_and_manifest(self):
        code, data, calls=self.run_candidate()
        self.assertEqual(code,0)
        self.assertEqual(data,{'sha256':hashlib.sha256(b'synthetic image').hexdigest(),
                               'imageId':IMAGE,'revision':SHA,'runId':'123','runAttempt':'2'})
        self.assertEqual(calls.count('run --rm --network none --read-only'),2)
        self.assertIn('save -o ',calls)

    def test_rejects_revision_mismatch(self):
        code,data,calls=self.run_candidate('revision')
        self.assertNotEqual(code,0); self.assertIsNone(data); self.assertNotIn('save -o',calls)

    def test_rejects_store_platform_and_manifest_mismatch(self):
        for mode in ('docker28', 'legacy_store', 'digest', 'index', 'platform'):
            with self.subTest(mode=mode):
                code,data,calls=self.run_candidate(mode)
                self.assertNotEqual(code,0); self.assertIsNone(data); self.assertNotIn('save -o',calls)

    def test_rejects_docker_errors_and_wrong_diagnostic(self):
        for mode in ('125', '127', 'wrong_message'):
            with self.subTest(mode=mode):
                code,data,calls=self.run_candidate(mode)
                self.assertNotEqual(code,0); self.assertIsNone(data); self.assertNotIn('save -o',calls)

    def test_rejects_broken_hold(self):
        code,data,calls=self.run_candidate('guard')
        self.assertNotEqual(code,0); self.assertIsNone(data); self.assertNotIn('save -o',calls)

if __name__ == '__main__': unittest.main()
