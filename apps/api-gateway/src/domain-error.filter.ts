import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { DomainError, type DomainErrorCode } from '@social-monitor/shared-kernel';

type ProblemDetails = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(statusCode: number): {
        json(body: ProblemDetails): void;
      };
    }>();
    const status = statusForDomainError(exception.code);

    response.status(status).json({
      type: `https://social-monitor.local/problems/${exception.code}`,
      title: titleForDomainError(exception.code),
      status,
      detail: exception.message,
      code: exception.code,
      details: redactProblemDetails(exception.details),
    });
  }
}

export const redactProblemDetails = (
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, redactProblemDetailValue(key, value)]),
  );

const statusForDomainError = (code: DomainErrorCode): number => {
  switch (code) {
    case 'validation.failed':
    case 'tenant.scope_missing':
      return HttpStatus.BAD_REQUEST;
    case 'authorization.denied':
      return HttpStatus.FORBIDDEN;
    case 'resource.not_found':
      return HttpStatus.NOT_FOUND;
    case 'operation.conflict':
      return HttpStatus.CONFLICT;
    case 'operation.quota_exceeded':
    case 'operation.backpressure':
    case 'operation.rate_limited':
      return HttpStatus.TOO_MANY_REQUESTS;
    case 'external.dependency_unavailable':
      return HttpStatus.SERVICE_UNAVAILABLE;
  }
};

const titleForDomainError = (code: DomainErrorCode): string => {
  switch (code) {
    case 'validation.failed':
      return 'Validation failed';
    case 'tenant.scope_missing':
      return 'Tenant scope missing';
    case 'authorization.denied':
      return 'Authorization denied';
    case 'resource.not_found':
      return 'Resource not found';
    case 'operation.conflict':
      return 'Operation conflict';
    case 'operation.quota_exceeded':
      return 'Quota exceeded';
    case 'operation.backpressure':
      return 'Backpressure limit reached';
    case 'operation.rate_limited':
      return 'Rate limit exceeded';
    case 'external.dependency_unavailable':
      return 'External dependency unavailable';
  }
};

const REDACTED = '[REDACTED]';

const secretKeyPattern = /(?:secret|token|password|credential|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token)/i;
const bearerPattern = /^bearer\s+\S+/i;
const generatedSecretPattern = /^(?:smk|whsec)_[A-Za-z0-9_-]+/;
const urlWithPasswordPattern = /^[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s]+@/i;

const redactProblemDetailValue = (key: string, value: unknown): unknown => {
  if (secretKeyPattern.test(key)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return shouldRedactString(value) ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactProblemDetailValue('', item));
  }

  if (typeof value === 'object' && value !== null) {
    return redactProblemDetails(value as Readonly<Record<string, unknown>>);
  }

  return value;
};

const shouldRedactString = (value: string): boolean =>
  bearerPattern.test(value) ||
  generatedSecretPattern.test(value) ||
  urlWithPasswordPattern.test(value);
