import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicPrivateFile } from './local-config';

export type BootstrapState = {
  readonly schemaVersion: 1;
  interestId?: string;
  sources: Record<string, { bindingId: string; scanJobId?: string }>;
  period?: { startedAt: string; endedAt: string; timezone: 'UTC' };
  readerSummaryJobId?: string;
  readerSummaryId?: string;
};

export async function loadBootstrapState(directory: string): Promise<BootstrapState> {
  try {
    const file = await open(join(directory, 'bootstrap.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 65_536) throw new Error('bootstrap_state_invalid');
      const value = JSON.parse(await file.readFile('utf8')) as BootstrapState;
      if (value.schemaVersion !== 1 || typeof value.sources !== 'object' || value.sources === null) {
        throw new Error('bootstrap_state_invalid');
      }
      return value;
    } finally { await file.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { schemaVersion: 1, sources: {} };
  }
}

export async function saveBootstrapState(directory: string, state: BootstrapState): Promise<void> {
  await atomicPrivateFile(join(directory, 'bootstrap.json'), `${JSON.stringify(state, null, 2)}\n`, true);
}
