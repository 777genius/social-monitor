"""Finite binary receive and tar processing budgets; no reader threads or extraction."""
import os
import select
import time
import tarfile
import zlib
from contract import require

RECEIVE_SECONDS = 120
PROCESS_SECONDS = 120
MEMBER_BYTES = 2 * 1024**3
TOTAL_BYTES = 8 * 1024**3
EXPANSION = 100
METADATA_BYTES = 65536
MEMBERS = 100000


class Budget:
    def __init__(self):
        self.end = time.monotonic() + PROCESS_SECONDS
        self.total = 0
        self.metadata = 0
        self.members = 0

    def check(self, count=0):
        require(time.monotonic() < self.end, 'archive-deadline')
        self.total += count
        require(self.total <= TOTAL_BYTES, 'archive-processing-limit')


def receive_bytes(stream, output, size):
    end = time.monotonic() + RECEIVE_SECONDS
    fd = stream.fileno()
    remaining = size
    while True:
        wait = end - time.monotonic()
        require(wait > 0 and select.select([fd], [], [], wait)[0], 'receive-deadline')
        chunk = os.read(fd, min(1024 * 1024, remaining) if remaining else 1)
        if not chunk:
            require(remaining == 0, 'archive-short')
            return
        require(remaining > 0, 'archive-long')
        require(type(chunk) is bytes and len(chunk) <= remaining, 'archive-byte-count')
        output.write(chunk)
        remaining -= len(chunk)


def scan_tar(stream, budget):
    """Inspect physical headers before tarfile can expand GNU/PAX sparse members."""
    stream.seek(0, os.SEEK_END)
    length = stream.tell()
    stream.seek(0)
    while stream.tell() < length:
        budget.check()
        block = stream.read(512)
        require(len(block) == 512, 'archive-truncated')
        if block == bytes(512):
            while True:
                tail = stream.read(65536)
                if not tail:
                    break
                budget.check()
                require(not any(tail), 'archive-trailing-data')
            break
        item = tarfile.TarInfo.frombuf(block, 'utf-8', 'surrogateescape')
        budget.members += 1
        require(budget.members <= MEMBERS, 'archive-member-count')
        require(item.type != tarfile.GNUTYPE_SPARSE, 'archive-sparse')
        require(0 <= item.size <= MEMBER_BYTES, 'archive-member-size')
        if item.type in (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME,
                         tarfile.GNUTYPE_LONGLINK):
            budget.metadata += item.size
            require(item.size <= METADATA_BYTES and budget.metadata <= 4_000_000, 'archive-metadata-size')
            data = stream.read(item.size)
            if item.type in (tarfile.XHDTYPE, tarfile.XGLTYPE):
                require(not any(key in data for key in (b'GNU.sparse', b'SCHILY.realsize=',
                                                       b'SCHILY.filetype=sparse')), 'archive-sparse')
            stream.seek((-item.size) % 512, os.SEEK_CUR)
        else:
            stream.seek((item.size + 511) // 512 * 512, os.SEEK_CUR)
        require(stream.tell() <= length, 'archive-truncated')
    stream.seek(0)


def gzip_chunks(raw, budget):
    """Bound every optional header before zlib; zlib verifies FHCRC, data CRC and ISIZE."""
    while True:
        budget.check()
        first = raw.read(2)
        if not first:
            return
        header = bytearray(first)
        def take(size):
            require(len(header) + size <= METADATA_BYTES, 'gzip-metadata-limit')
            budget.check()
            data = raw.read(size)
            require(len(data) == size, 'gzip-truncated')
            header.extend(data)
            return data
        require(first == b'\x1f\x8b', 'gzip-header')
        fixed = take(8)
        flags = fixed[1]
        require(fixed[0] == 8 and not flags & 0xe0, 'gzip-header')
        if flags & 4:
            take(int.from_bytes(take(2), 'little'))
        for flag in (8, 16):
            if flags & flag:
                while take(1) != b'\0':
                    pass
        if flags & 2:
            take(2)
        budget.metadata += len(header)
        require(budget.metadata <= 4_000_000, 'gzip-metadata-limit')
        decoder = zlib.decompressobj(31)
        pending = bytes(header)
        try:
            while not decoder.eof:
                budget.check()
                if not pending:
                    pending = raw.read(65536)
                    require(pending, 'gzip-truncated')
                chunk = decoder.decompress(pending, 65536)
                pending = decoder.unconsumed_tail
                budget.check()
                if chunk:
                    yield chunk
            # Return trailer lookahead for the next member, preserving concatenated gzip.
            raw.seek(-len(decoder.unused_data), os.SEEK_CUR)
        except zlib.error:
            require(False, 'gzip-invalid')
