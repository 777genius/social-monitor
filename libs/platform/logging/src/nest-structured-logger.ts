import { Logger } from '@nestjs/common';

import { formatLogMessage, type LogFields, type StructuredLogger } from './structured-logger';

export class NestStructuredLogger implements StructuredLogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  info(message: string, fields?: LogFields): void {
    this.logger.log(formatLogMessage(message, fields));
  }

  warn(message: string, fields?: LogFields): void {
    this.logger.warn(formatLogMessage(message, fields));
  }

  error(message: string, fields?: LogFields): void {
    this.logger.error(formatLogMessage(message, fields));
  }
}
