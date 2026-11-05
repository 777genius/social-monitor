import type { JsonObject } from '@social-monitor/shared-kernel';

/** These provider facts identify media, whose pixels/audio are not native text. */
export const hasRedditMediaContext = (metadata: JsonObject | undefined): boolean => {
  if (metadata?.isVideo === true || (typeof metadata?.postHint === 'string' &&
      ['image', 'hosted:video', 'rich:video'].includes(metadata.postHint))) return true;
  if (typeof metadata?.linkedUrl !== 'string') return false;
  try {
    return ['i.redd.it', 'v.redd.it'].includes(new URL(metadata.linkedUrl).hostname);
  } catch { return false; }
};
