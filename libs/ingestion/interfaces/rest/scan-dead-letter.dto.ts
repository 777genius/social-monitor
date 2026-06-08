import type { ListScanDeadLettersResult } from '../../features/list-scan-dead-letters/list-scan-dead-letters.result';

export type ScanDeadLetterDto = ListScanDeadLettersResult['deadLetters'][number];

export type ListScanDeadLettersResponseDto = {
  readonly deadLetters: readonly ScanDeadLetterDto[];
};
