export type OutboundFailureDisposition = 'retryable' | 'uncertain' | 'permanent';

export class OutboundDeliveryError extends Error {
  readonly disposition: OutboundFailureDisposition;
  readonly code: string;
  readonly httpStatus?: number;

  constructor(
    disposition: OutboundFailureDisposition,
    code: string,
    httpStatus?: number
  ) {
    super(code);
    this.name = 'OutboundDeliveryError';
    this.disposition = disposition;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function asOutboundDeliveryError(error: unknown): OutboundDeliveryError {
  if (error instanceof OutboundDeliveryError) return error;
  return new OutboundDeliveryError('retryable', 'worker_error');
}
