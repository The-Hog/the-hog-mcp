import { redactSecrets } from './redaction.js';

export class TheHogApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = 'TheHogApiError';
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: redactSecrets(this.message),
      status: this.status,
      requestId: this.requestId,
      responseBody: redactSecrets(this.responseBody),
    };
  }
}

export function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof TheHogApiError) {
    return error.toJSON();
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecrets(error.message),
    };
  }
  return {
    name: 'UnknownError',
    message: redactSecrets(String(error)),
  };
}
