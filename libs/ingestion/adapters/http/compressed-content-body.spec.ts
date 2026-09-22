import { PassThrough, Readable } from 'node:stream';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { readContentBody } from './guarded-content-http';

const text = '<article>Unicode qualification: ограничение.</article>';
const codecs = [
  ['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync],
] as const;

describe('bounded compressed content body', () => {
  it.each(codecs)('decodes %s without network access', async (encoding, compress) => {
    const bytes = compress(Buffer.from(text));
    const chunks = Array.from(bytes, (byte) => Buffer.from([byte]));
    await expect(readContentBody(Readable.from(chunks), encoding, 1000, AbortSignal.timeout(1000))).resolves.toBe(text);
  });

  it.each(codecs)('bounds decoded %s expansion', async (encoding, compress) => {
    const source = Readable.from([compress(Buffer.from('x'.repeat(100_000)))]);
    await expect(readContentBody(source, encoding, 1000, AbortSignal.timeout(1000)))
      .rejects.toMatchObject({ reasonCode: 'response_too_large' });
    expect(source.destroyed).toBe(true);
  });

  it.each(codecs)('bounds encoded %s bytes even when decoded content fits', async (encoding, compress) => {
    const source = Readable.from([compress(Buffer.from('x'))]);
    await expect(readContentBody(source, encoding, 2, AbortSignal.timeout(1000)))
      .rejects.toMatchObject({ reasonCode: 'response_too_large' });
    expect(source.destroyed).toBe(true);
  });

  it.each(codecs)('rejects broken %s without returning partial text', async (encoding, compress) => {
    const bytes = compress(Buffer.from(text));
    await expect(readContentBody(Readable.from([bytes.subarray(0, bytes.length - 3)]), encoding, 1000, AbortSignal.timeout(1000)))
      .rejects.toMatchObject({ reasonCode: 'invalid_encoding' });
  });

  it.each(['compress', 'gzip, br'])('rejects unsupported encoding %s and closes input', async (encoding) => {
    const source = new PassThrough();
    await expect(readContentBody(source, encoding, 1000, AbortSignal.timeout(1000)))
      .rejects.toMatchObject({ reasonCode: 'unsupported_encoding' });
    expect(source.destroyed).toBe(true);
  });

  it('preserves transport failures as retryable errors instead of malformed encoding', async () => {
    const source = new PassThrough();
    const result = readContentBody(source, 'gzip', 1000, AbortSignal.timeout(1000));
    source.destroy(new Error('connection reset'));
    await expect(result).rejects.toThrow('connection reset');
  });

  it('cancels a stalled compressed response at the shared deadline', async () => {
    const source = new PassThrough();
    const controller = new AbortController();
    const result = readContentBody(source, 'gzip', 1000, controller.signal);
    source.write(gzipSync(Buffer.from(text)).subarray(0, 8));
    controller.abort(new Error('scan deadline'));
    await expect(result).rejects.toThrow('scan deadline');
    expect(source.destroyed).toBe(true);
  });
});
