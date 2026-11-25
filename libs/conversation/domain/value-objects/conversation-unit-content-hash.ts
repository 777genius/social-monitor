import { createHash } from 'node:crypto';

import type { ConversationUnitProps } from '../entities/conversation-unit';

export const contentHashForConversationUnit = (
  snapshot: ConversationUnitProps,
): string =>
  createHash('sha256')
    .update(
      [
        snapshot.sourceBindingId,
        snapshot.rootProviderItemId,
        snapshot.providerUnitId,
        snapshot.canonicalUrl,
        snapshot.body,
        snapshot.authorHandle ?? '',
        snapshot.publishedAt.toISOString(),
      ].join('\u001f'),
    )
    .digest('hex');
