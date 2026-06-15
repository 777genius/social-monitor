export type RealtimeReplayCursor = {
  readonly afterSequence: number;
};

export const encodeRealtimeReplayCursor = (afterSequence: number): string =>
  Buffer.from(JSON.stringify({ afterSequence })).toString('base64url');

export const parseRealtimeReplayCursor = (cursor: string | undefined): RealtimeReplayCursor | null => {
  if (cursor === undefined) {
    return { afterSequence: 0 };
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      afterSequence?: unknown;
      offset?: unknown;
    };
    const afterSequence = parsed.afterSequence ?? parsed.offset;

    if (typeof afterSequence === 'number' && Number.isInteger(afterSequence) && afterSequence >= 0) {
      return { afterSequence };
    }
  } catch {
    return null;
  }

  return null;
};
