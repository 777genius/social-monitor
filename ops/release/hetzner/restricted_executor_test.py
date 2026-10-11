"""Compile the actual static program. Intercept execve BEFORE executing fixed host paths."""
import ctypes
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import tempfile
import unittest
import install


class Registers(ctypes.Structure):
    _fields_ = [(name, ctypes.c_ulonglong) for name in (
        'r15', 'r14', 'r13', 'r12', 'rbp', 'rbx', 'r11', 'r10', 'r9', 'r8',
        'rax', 'rcx', 'rdx', 'rsi', 'rdi', 'orig_rax', 'rip', 'cs', 'eflags',
        'rsp', 'ss', 'fs_base', 'gs_base', 'ds', 'es', 'fs', 'gs')]


@unittest.skipUnless(platform.system() == 'Linux' and platform.machine() == 'x86_64',
                     'execve tracing qualification requires Linux x86_64')
class StaticBoundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        cls.directory = Path(cls.temp.name)
        cls.directory.chmod(0o755)
        cls.binary = cls.directory / 'executor'
        subprocess.run(['/usr/bin/gcc', '-static', '-O2', '-Wall', '-Wextra', '-Werror',
                        '-o', str(cls.binary), str(Path(__file__).with_name('restricted-executor.c'))],
                       env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'}, check=True,
                       stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        cls.libc = ctypes.CDLL(None, use_errno=True)
        cls.libc.ptrace.restype = ctypes.c_long
        cls.libc.ptrace.argtypes = [ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def trace(self, argv, original='status', login=False):
        # LD_PRELOAD is deliberately an impossible synthetic path. Static ELF never loads it.
        env = {'SSH_ORIGINAL_COMMAND': original, 'LD_PRELOAD': '/synthetic/never-load.so',
               'BASH_ENV': '/synthetic/never-source', 'ENV': '/synthetic/never-source',
               'PYTHONPATH': '/synthetic/never-import', 'PATH': '/synthetic/never-search',
               'SYNTHETIC_PRIVATE_VALUE': 'discard-me'}
        child = os.fork()
        if child == 0:
            try:
                os.chdir(self.directory)
                if login and os.getuid() == 0:
                    try:
                        os.setgid(65534)
                        os.setuid(65534)
                    except OSError as error:
                        if error.errno in (1, 13, 22):
                            os._exit(119)
                        raise
                    self.libc.prctl(4, 1, 0, 0, 0)  # Restore child dumpability for parent tracing only.
                if self.libc.ptrace(0, 0, None, None) == -1:
                    os._exit(117)
                os.execve('./executor', argv, env)
            except BaseException:
                os._exit(118)
        def ptrace(request, address=0, data=0):
            ctypes.set_errno(0)
            result = self.libc.ptrace(request, child, ctypes.c_void_p(address), ctypes.c_void_p(data))
            if result == -1 and ctypes.get_errno():
                raise OSError(ctypes.get_errno(), 'synthetic trace unavailable')
            return result & ((1 << 64) - 1)
        def string(address):
            value = bytearray()
            for offset in range(0, 4096, 8):
                word = ptrace(2, address + offset).to_bytes(8, 'little')
                value.extend(word.split(b'\0', 1)[0])
                if b'\0' in word:
                    return value.decode()
            raise AssertionError('Unbounded execve string')
        def vector(address):
            result = []
            for i in range(20):
                pointer = ptrace(2, address + i * 8)
                if pointer == 0:
                    return result
                result.append(string(pointer))
            raise AssertionError('Unbounded execve vector')
        try:
            _, status = os.waitpid(child, 0)
            if os.WIFEXITED(status) and os.WEXITSTATUS(status) == 119:
                self.skipTest('sandbox denies or cannot map synthetic UID/GID; login boundary unqualified')
            if os.WIFEXITED(status) and os.WEXITSTATUS(status) == 117:
                self.skipTest('sandbox denies PTRACE_TRACEME; actual environment observation unqualified')
            self.assertTrue(os.WIFSTOPPED(status), 'static trace startup failed: status=' + str(status))
            ptrace(0x4200, 0, 1)  # PTRACE_O_TRACESYSGOOD
            for _ in range(1000):
                ptrace(24)  # PTRACE_SYSCALL
                _, status = os.waitpid(child, 0)
                if os.WIFEXITED(status):
                    return {'exit': os.WEXITSTATUS(status)}
                self.assertTrue(os.WIFSTOPPED(status))
                regs = Registers()
                ptrace(12, 0, ctypes.addressof(regs))  # PTRACE_GETREGS
                if regs.orig_rax == 59 and regs.rax == ((1 << 64) - 38):
                    # Kill in finally, before the syscall executes sudo or Python.
                    return {'path': string(regs.rdi), 'argv': vector(regs.rsi), 'env': vector(regs.rdx)}
            raise AssertionError('No bounded execve observation')
        finally:
            try:
                os.kill(child, signal.SIGKILL)
                os.waitpid(child, 0)
            except ProcessLookupError:
                pass
            except ChildProcessError:
                pass

    def test_actual_elf_has_no_loader_or_dynamic_dependencies(self):
        install.static_elf(self.binary)
        # A dynamic ELF with an actual interpreter must fail the installer guard.
        dynamic = self.directory / 'dynamic'
        subprocess.run(['/usr/bin/gcc', '-O2', '-o', str(dynamic),
                        str(Path(__file__).with_name('restricted-executor.c'))],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        with self.assertRaisesRegex(install.Denied, 'executor-not-static'):
            install.static_elf(dynamic)

    def test_independent_gcc_ast_proves_environment_order_and_fixed_exec_vectors(self):
        # Parse compiler AST nodes and references, never source text or a test-only executor hook.
        object_file = self.directory / 'ast.o'
        subprocess.run(['/usr/bin/gcc', '-O0', '-fdump-tree-original-raw', '-c',
                        '-o', str(object_file), str(Path(__file__).with_name('restricted-executor.c'))],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        dump = next(self.directory.glob('*.original')).read_text().split(';; Function main', 1)[1]
        nodes = {int(i): (kind, body) for i, kind, body in
                 re.findall(r'^@(\d+)\s+(\w+)\s+(.*?)(?=^@\d+|\Z)', dump, re.M | re.S)}
        def ref(body, key):
            match = re.search(r'(?<!\w)' + re.escape(key) + r'\s*:\s*@(\d+)', body)
            return int(match[1]) if match else None
        def scalar(i):
            kind, body = nodes[i]
            if kind in ('nop_expr', 'addr_expr'):
                return scalar(ref(body, 'op 0'))
            if kind == 'var_decl':
                value = ref(body, 'init')
                return scalar(value) if value else '<variable>'
            if kind in ('identifier_node', 'string_cst'):
                return re.search(r'strg:\s*(.*?)\s+lngt:', body, re.S)[1]
            if kind == 'integer_cst':
                return int(re.search(r'int:\s*(-?\d+)', body)[1])
            if kind == 'parm_decl':
                return scalar(ref(body, 'name'))
            if kind == 'function_decl':
                return scalar(ref(body, 'name'))
            return '<expression>'
        calls = []
        guards = []
        def walk(i):
            kind, body = nodes[i]
            if kind == 'ne_expr' and scalar(ref(body, 'op 0')) == 'argc':
                guards.append((scalar(ref(body, 'op 1')), len(calls)))
            if kind == 'statement_list':
                children = [int(x) for _, x in re.findall(r'(\d+)\s*:\s*@(\d+)', body)]
            elif kind == 'bind_expr':
                children = [ref(body, 'body')]
            elif kind == 'call_expr':
                args = [int(x) for _, x in re.findall(r'(?<!op )(\d+)\s*:\s*@(\d+)', body)]
                calls.append((scalar(ref(body, 'fn')), [scalar(a) for a in args]))
                children = args
            else:
                children = [int(x) for x in re.findall(r'op \d+\s*:\s*@(\d+)', body)]
                if kind == 'return_expr':
                    children = [ref(body, 'expr')]
            for child in children:
                if child is not None:
                    walk(child)
        walk(1)
        boundary = [name for name, _ in calls if name in ('clearenv', 'setenv', 'execv')]
        self.assertEqual(boundary, ['clearenv', 'setenv', 'setenv', 'setenv', 'execv', 'execv'])
        clear_index = next(i for i, (name, _) in enumerate(calls) if name == 'clearenv')
        self.assertEqual([limit for limit, _ in guards], [1, 3])
        self.assertTrue(all(index < clear_index for _, index in guards))
        self.assertEqual([args[0] for name, args in calls if name == 'setenv'],
                         ['PATH', 'LC_ALL', 'SSH_ORIGINAL_COMMAND'])
        self.assertTrue(all(name in {'strnlen', 'memcpy', 'strlen', 'getuid', 'geteuid',
                            'strcmp', 'clearenv', 'setenv', 'execv'} for name, _ in calls))
        vectors = []
        for kind, body in nodes.values():
            if kind == 'constructor':
                vectors.append([scalar(int(x)) for x in re.findall(r'val\s*:\s*@(\d+)', body)])
        self.assertIn(['/opt/social-monitor-release-python/bin/python3', '-I', '-B',
                       '/opt/social-monitor-release/controller.py', 0], vectors)
        self.assertIn(['/usr/bin/sudo', '-n', '/opt/social-monitor-release/root-executor', 0], vectors)
        self.assertEqual([args[1] for name, args in calls if name == 'strnlen'], [513])

    def test_actual_static_program_rejects_root_arguments_before_any_host_exec(self):
        # Removing the argc guard would reach fixed exec failure (127), not denial (126).
        if os.getuid() != 0:
            self.skipTest('root argument branch requires root test process')
        for args in [['status'], ['-c', '/bin/sh'], ['--help']]:
            result = subprocess.run([str(self.binary), *args], env={
                'SSH_ORIGINAL_COMMAND': 'status', 'LD_PRELOAD': '/synthetic/never-load.so',
                'BASH_ENV': '/synthetic/never-source'}, check=False,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
            self.assertEqual(result.returncode, 126)
            self.assertEqual(result.stdout, b'')
            self.assertEqual(result.stderr, b'')

    def test_login_boundary_observes_fixed_sudo_and_cleared_actual_execve_environment(self):
        observed = self.trace(['restricted-executor', '-c',
            '/usr/bin/sudo -n /opt/social-monitor-release/root-executor'], login=True)
        self.assertEqual(observed['path'], '/usr/bin/sudo')
        self.assertEqual(observed['argv'], ['/usr/bin/sudo', '-n',
                                          '/opt/social-monitor-release/root-executor'])
        self.assertEqual(sorted(observed['env']), ['LC_ALL=C', 'PATH=/usr/sbin:/usr/bin:/sbin:/bin',
                                                   'SSH_ORIGINAL_COMMAND=status'])

    @unittest.skipUnless(os.getuid() == 0, 'actual root branch requires a root synthetic test process')
    def test_root_noargs_boundary_observes_isolated_python_before_execution(self):
        observed = self.trace(['root-executor'], original='receipt ' + 'a' * 40 + '-123')
        self.assertEqual(observed['path'], '/opt/social-monitor-release-python/bin/python3')
        self.assertEqual(observed['argv'], ['/opt/social-monitor-release-python/bin/python3',
                         '-I', '-B', '/opt/social-monitor-release/controller.py'])
        self.assertEqual(sorted(observed['env']), ['LC_ALL=C', 'PATH=/usr/sbin:/usr/bin:/sbin:/bin',
                            'SSH_ORIGINAL_COMMAND=receipt ' + 'a' * 40 + '-123'])

    def test_untrusted_login_arguments_and_overlong_original_never_reach_exec(self):
        for args in [[], ['-c', '/bin/sh'], ['-c', '/usr/bin/sudo -n '
                     '/opt/social-monitor-release/root-executor extra'], ['-c'], ['status']]:
            observed = self.trace(['restricted-executor', *args], login=True)
            self.assertEqual(observed, {'exit': 126})
        self.assertEqual(self.trace(['restricted-executor', '-c',
            '/usr/bin/sudo -n /opt/social-monitor-release/root-executor'], 'x' * 513, login=True),
                         {'exit': 126})
        if os.getuid() == 0:
            self.assertEqual(self.trace(['root-executor', 'status']), {'exit': 126})


if __name__ == '__main__':
    unittest.main()
