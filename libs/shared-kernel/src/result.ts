export type Result<TValue, TError> = Ok<TValue> | Err<TError>;

export type Ok<TValue> = {
  readonly ok: true;
  readonly value: TValue;
};

export type Err<TError> = {
  readonly ok: false;
  readonly error: TError;
};

export const ok = <TValue>(value: TValue): Ok<TValue> => ({
  ok: true,
  value,
});

export const err = <TError>(error: TError): Err<TError> => ({
  ok: false,
  error,
});

export const isOk = <TValue, TError>(result: Result<TValue, TError>): result is Ok<TValue> =>
  result.ok;

export const isErr = <TValue, TError>(result: Result<TValue, TError>): result is Err<TError> =>
  !result.ok;
