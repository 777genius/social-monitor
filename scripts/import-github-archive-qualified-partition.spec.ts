import { readGitHubArchiveQualifiedPartition } from './import-github-archive-qualified-partition';

describe('GitHub archive fixed-day admission', () => {
  const request = { inputRoot: '/nonexistent-github-archive-fixture', day: '2026-11-06',
    semanticKey: 'a'.repeat(64), packetSha256: 'b'.repeat(64) };

  it('admits a November 2026 day to the existing private input checks', async () => {
    await expect(readGitHubArchiveQualifiedPartition(request)).rejects.not.toThrow(
      'Archived GitHub fixed date/key/packet required');
  });

  it.each(['2026-08-31', '2026-12-01', '2027-11-06'])(
    'rejects a day outside the fixed months before accessing input: %s', async day => {
      await expect(readGitHubArchiveQualifiedPartition({ ...request, day })).rejects.toThrow(
        'Archived GitHub fixed date/key/packet required');
    });
});
